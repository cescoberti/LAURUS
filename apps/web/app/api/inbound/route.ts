import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhook, fetchReceivedEmail, fetchReceivedAttachment, parseAddress, type ReceivedEvent } from "@/lib/inbox/resend";
import { triage, proposeAction, type InboxKind } from "@/lib/inbox/triage";

// Fetching the mail plus its attachments and one Claude call can exceed the
// default budget on a slow day.
export const maxDuration = 60;

/**
 * Resend calls this for every email received at laurus.the361.eu
 * (event "email.received"). The webhook carries metadata only, so the body
 * and attachments are fetched back, stored, and the message is triaged into
 * the admin's Inbox queue. Signature checked on the raw body; anything else
 * is a 401 — there is no other way in.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers)) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  const event = JSON.parse(raw) as ReceivedEvent;
  if (event.type !== "email.received") return NextResponse.json({ ok: true, ignored: event.type });

  const admin = createAdminClient();
  const emailId = event.data.email_id;

  // Resend retries on non-2xx; a message already stored is done.
  const { data: existing } = await admin.from("inbox_messages").select("id").eq("resend_email_id", emailId).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, duplicate: true });

  const mail = await fetchReceivedEmail(emailId);
  const from = parseAddress(mail.from);
  const toAddr = (event.data.to?.[0] ?? mail.to?.[0] ?? "").toLowerCase();
  const routeKind: InboxKind = /^inbox@/.test(toAddr) ? "document" : /^hello@/.test(toAddr) ? "request" : "other";

  // Attachments → private bucket, <email id>/<filename>.
  const stored: Array<{ id: string; filename: string; content_type: string; size: number; storage_path: string }> = [];
  for (const a of mail.attachments ?? event.data.attachments ?? []) {
    if (a.content_disposition === "inline" && /^image\//.test(a.content_type)) continue; // signatures, logos
    try {
      const file = await fetchReceivedAttachment(emailId, a.id);
      const safe = file.filename.replace(/[^\w.() \-À-ɏ]+/g, "_");
      const path = `${emailId}/${safe}`;
      const { error } = await admin.storage.from("inbox").upload(path, file.bytes, { contentType: file.contentType, upsert: true });
      if (error) throw new Error(error.message);
      stored.push({ id: a.id, filename: file.filename, content_type: file.contentType, size: file.bytes.length, storage_path: path });
    } catch (err) {
      stored.push({ id: a.id, filename: a.filename, content_type: a.content_type, size: a.size ?? 0, storage_path: `ERROR: ${(err as Error).message}` });
    }
  }

  const { data: known } = await admin.from("users").select("id").eq("email", from.email).maybeSingle();
  const analysis = await triage({
    from: from.email,
    fromName: from.name,
    to: toAddr,
    subject: mail.subject ?? event.data.subject ?? null,
    text: mail.text ?? (mail.html ? mail.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : null),
    attachments: stored.map((s) => ({ filename: s.filename, content_type: s.content_type })),
    routeKind,
  });
  const action = proposeAction(analysis, { email: from.email, knownUser: !!known });

  const { error } = await admin.from("inbox_messages").insert({
    resend_email_id: emailId,
    message_id: event.data.message_id ?? null,
    from_email: from.email,
    from_name: from.name,
    to_email: toAddr,
    subject: mail.subject ?? event.data.subject ?? null,
    received_at: mail.created_at ?? event.data.created_at,
    text_body: mail.text,
    html_body: mail.html,
    attachments: stored,
    kind: analysis?.kind ?? routeKind,
    analysis,
    proposed_action: action,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, kind: analysis?.kind ?? routeKind, action: action.type, attachments: stored.length });
}
