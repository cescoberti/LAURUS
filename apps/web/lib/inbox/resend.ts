/**
 * Resend receiving — what the webhook tells us and what we fetch back.
 * SERVER ONLY. Reads:
 *   RESEND_WEBHOOK_SECRET  (whsec_...)  — signing secret of the email.received webhook
 *   RESEND_ADMIN_KEY       (re_...)     — full-access key; the send-only key cannot read received mail
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.resend.com";

function adminKey(): string | null {
  return process.env.RESEND_ADMIN_KEY ?? process.env.RESEND_API_KEY ?? null;
}

/**
 * Svix scheme (used by Resend): HMAC-SHA256 over "id.timestamp.rawBody" with
 * the base64 secret after "whsec_"; the header carries space-separated
 * "v1,<base64>" entries. Five minutes of clock tolerance.
 */
export function verifyWebhook(rawBody: string, headers: Headers, secret = process.env.RESEND_WEBHOOK_SECRET): boolean {
  if (!secret) return false;
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sig = headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest();
  return sig.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export interface ReceivedAttachmentMeta {
  id: string;
  filename: string;
  content_type: string;
  content_disposition?: string | null;
  content_id?: string | null;
  size?: number;
}

export interface ReceivedEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    created_at: string;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    received_for?: string[];
    message_id?: string;
    subject?: string;
    attachments?: ReceivedAttachmentMeta[];
  };
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  created_at: string;
  headers?: Record<string, string>;
  attachments?: ReceivedAttachmentMeta[];
}

export async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail> {
  const key = adminKey();
  if (!key) throw new Error("RESEND_ADMIN_KEY not set");
  const res = await fetch(`${API}/emails/receiving/${emailId}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`resend receiving ${res.status}: ${await res.text()}`);
  return (await res.json()) as ReceivedEmail;
}

/** The attachment bytes, via the short-lived download URL Resend issues. */
export async function fetchReceivedAttachment(emailId: string, attachmentId: string): Promise<{ filename: string; contentType: string; bytes: Buffer }> {
  const key = adminKey();
  if (!key) throw new Error("RESEND_ADMIN_KEY not set");
  const meta = await fetch(`${API}/emails/receiving/${emailId}/attachments/${attachmentId}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!meta.ok) throw new Error(`resend attachment ${meta.status}: ${await meta.text()}`);
  const info = (await meta.json()) as { download_url: string; filename: string; content_type: string };
  const file = await fetch(info.download_url);
  if (!file.ok) throw new Error(`attachment download ${file.status}`);
  return { filename: info.filename, contentType: info.content_type, bytes: Buffer.from(await file.arrayBuffer()) };
}

/** "Mario Rossi <mario@x>" → { name, email }. */
export function parseAddress(raw: string): { name: string | null; email: string } {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1]?.trim() || null, email: m[2]!.trim().toLowerCase() };
  return { name: null, email: raw.trim().toLowerCase() };
}
