/**
 * WhatsApp notifications via the Twilio API. No SDK — one POST. Reads:
 *   TWILIO_ACCOUNT_SID   (AC...)             — absent → disabled
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM (default sandbox "whatsapp:+14155238886")
 * Recipients must have joined the sandbox (or, in production, messaged the
 * business number / been reached via an approved template).
 */

export function whatsappConfigured(): boolean {
  return !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
}

/** `to` is an E.164 phone number, e.g. "+393331234567". */
export async function sendWhatsApp(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { ok: false, error: "Twilio credentials not set" };

  const from = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: `whatsapp:${to}`, Body: body }),
  });
  if (!res.ok) return { ok: false, error: `twilio ${res.status}: ${await res.text()}` };
  return { ok: true };
}
