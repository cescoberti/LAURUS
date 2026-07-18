/**
 * Email notifications via Resend. No SDK — one POST. Reads:
 *   RESEND_API_KEY   (re_...)          — absent → notifications disabled
 *   EMAIL_FROM       (default "LAURUS <onboarding@resend.dev>")
 * Attachments are base64, per the Resend API.
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "LAURUS <onboarding@resend.dev>",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      })),
    }),
  });
  if (!res.ok) return { ok: false, error: `resend ${res.status}: ${await res.text()}` };
  return { ok: true };
}
