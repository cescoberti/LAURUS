import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailConfigured } from "@/lib/notify/email";
import { sendWhatsApp, whatsappConfigured } from "@/lib/notify/whatsapp";
import { logEvent } from "@/lib/track";

export const runtime = "nodejs";

/**
 * Notification dispatcher — run by Vercel Cron (see vercel.json) or manually:
 *   curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/notify
 *
 * 1. "Nuova VL" reminder: items whose plenary amendments were ingested in the
 *    last 25h → email/WhatsApp to members who opted in.
 * 2. Clean-final: items voted in the last 25h → members with wants_clean_final
 *    get the link to the adopted-text page and the report files.
 *
 * Every send is recorded in laurus.notifications-like events, and the whole
 * run no-ops gracefully while the provider keys are not configured.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://laurus-web-theta.vercel.app";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const since = new Date(Date.now() - 25 * 3_600_000).toISOString();

  // --- 1. Items with freshly ingested amendments -------------------------
  const { data: freshAms } = await supabase
    .from("amendments")
    .select("item_id")
    .gte("created_at", since);
  const freshItemIds = [...new Set((freshAms ?? []).map((a) => a.item_id))];

  let newVlItems: Array<{ code: string; am_count: number }> = [];
  if (freshItemIds.length) {
    const { data } = await supabase
      .from("items")
      .select("code, am_count")
      .in("id", freshItemIds)
      .gt("am_count", 0);
    newVlItems = data ?? [];
  }

  // --- 2. Items voted in the window (clean final) ------------------------
  const { data: votedItems } = await supabase
    .from("items")
    .select("code, title, vote_date")
    .gte("vote_date", since.slice(0, 10));

  const { data: members } = await supabase
    .from("users")
    .select("id, email, whatsapp_phone, wants_email, wants_whatsapp, wants_clean_final");

  const sent = { email: 0, whatsapp: 0, cleanFinal: 0 };
  const skipped: string[] = [];
  if (!emailConfigured()) skipped.push("email: RESEND_API_KEY mancante");
  if (!whatsappConfigured()) skipped.push("whatsapp: credenziali Twilio mancanti");

  // --- New-VL reminders ---------------------------------------------------
  if (newVlItems.length) {
    const list = newVlItems.map((i) => `• ${i.code} (${i.am_count} em.)`).join("\n");
    const html =
      `<p>Nuove voting list annotate disponibili su <a href="${SITE}">LAURUS</a>:</p><ul>` +
      newVlItems.map((i) => `<li><a href="${SITE}/items/${i.code}">${i.code}</a> — ${i.am_count} emendamenti</li>`).join("") +
      `</ul><p>Scarica le VL con i Remarks già compilati dalla pagina di ogni relazione.</p>`;

    for (const m of members ?? []) {
      if (m.wants_email && emailConfigured()) {
        const r = await sendEmail({ to: m.email, subject: `LAURUS — ${newVlItems.length} nuove VL annotate`, html });
        if (r.ok) sent.email++;
      }
      if (m.wants_whatsapp && m.whatsapp_phone && whatsappConfigured()) {
        const r = await sendWhatsApp(m.whatsapp_phone, `🌿 LAURUS — nuove VL annotate:\n${list}\n\nScrivi *vl <codice>* per il link diretto.`);
        if (r.ok) sent.whatsapp++;
      }
    }
  }

  // --- Clean-final --------------------------------------------------------
  if (votedItems?.length && emailConfigured()) {
    for (const m of members ?? []) {
      if (!m.wants_clean_final) continue;
      const html =
        `<p>Testi votati in plenaria — versione definitiva:</p><ul>` +
        votedItems
          .map(
            (i) =>
              `<li><a href="${SITE}/items/${i.code}">${i.code}</a> — ${(i.title as { en?: string }).en ?? ""} (votato ${i.vote_date})</li>`,
          )
          .join("") +
        `</ul><p>I testi adottati ufficiali sono pubblicati dall'EP alla voce "Texts adopted".</p>`;
      const r = await sendEmail({ to: m.email, subject: `LAURUS — testi definitivi post-voto (${votedItems.length})`, html });
      if (r.ok) sent.cleanFinal++;
    }
  }

  void logEvent("cron_notify", { meta: { newVlItems: newVlItems.length, voted: votedItems?.length ?? 0, sent, skipped } });
  return NextResponse.json({ newVlItems: newVlItems.map((i) => i.code), voted: votedItems?.length ?? 0, sent, skipped });
}
