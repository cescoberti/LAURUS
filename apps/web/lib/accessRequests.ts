/**
 * Access requests: a person with no invite asks to join, an admin decides. SERVER ONLY.
 *
 * The flow, end to end:
 *   1. the person fills /request-access            -> a row, status 'pending'
 *   2. every admin gets an email "X asked for access" with one button
 *   3. the button opens /richiesta/<token> (or the admin uses /admin/richieste):
 *      Approve / Refuse — a deliberate tap, never a link that decides by being opened,
 *      because mail scanners open every link in a message before the reader does
 *   4. Approve makes an invite for that address and emails the person the link
 *      (/onboarding?token=…): password or Google, then straight into LAURUS
 *
 * Mail goes out through Resend, not through the auth provider's mailer, which
 * only delivers to the project's own team. Nothing here involves Vercel.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail } from "@/lib/notify/email";
import { SITE } from "@/lib/site";

export interface AccessRequest {
  id: string;
  token: string;
  email: string;
  full_name: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  invite_token: string | null;
  created_at: string;
  decided_at: string | null;
  decided_via: "panel" | "email" | null;
}

export const REQUEST_COLUMNS = "id, token, email, full_name, note, status, invite_token, created_at, decided_at, decided_via";

const BRAND = "#1f5138";
const WELCOME_FROM = process.env.EMAIL_FROM_WELCOME ?? "LAURUS <welcome@laurus.the361.eu>";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const onboardingUrl = (inviteToken: string) => `${SITE}/onboarding?token=${inviteToken}`;
export const decisionUrl = (token: string) => `${SITE}/richiesta/${token}`;

export type RequestOutcome = "created" | "member" | "already-waiting" | "throttled" | "failed";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** More than this many requests in an hour is a flood, not people: stop before it reaches the admins' inbox. */
const HOURLY_CAP = 20;

/**
 * Record that someone asks to join, and tell the admins once. Used by the form
 * and by a sign-in attempt from a person who is not a member yet, so both
 * doors behave the same: a member is not asked again, a request already
 * waiting is not announced twice, and a flood is stopped.
 */
export async function createAccessRequest(input: { email: string; fullName?: string | null; note?: string | null }): Promise<RequestOutcome> {
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!EMAIL_SHAPE.test(email)) return "failed";
  const admin = createAdminClient();

  const { data: member } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (member) return "member";

  const { data: waiting } = await admin.from("access_requests").select("id").eq("status", "pending").ilike("email", email).limit(1);
  if (waiting?.length) return "already-waiting";

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from("access_requests").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= HOURLY_CAP) return "throttled";

  const { data: row, error } = await admin
    .from("access_requests")
    .insert({ email, full_name: input.fullName?.trim().slice(0, 120) || null, note: input.note?.trim().slice(0, 500) || null })
    .select(REQUEST_COLUMNS)
    .single();
  if (error || !row) return "failed";

  await notifyAdminsOfRequest(row as AccessRequest);
  return "created";
}

/** Email to every admin: who asked, and one button to decide. Best effort — the request is saved either way. */
export async function notifyAdminsOfRequest(req: AccessRequest): Promise<void> {
  if (!emailConfigured()) return;
  const admin = createAdminClient();
  const { data: admins } = await admin.from("users").select("email").eq("role", "admin");
  const who = req.full_name ? `${req.full_name} (${req.email})` : req.email;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:32rem;color:#1a2b22">
<p style="font-size:16px"><strong>${esc(req.full_name || req.email)}</strong> ha fatto richiesta di accesso a LAURUS.</p>
<p style="color:#6b7a72;font-size:14px;margin:4px 0">${esc(who)}</p>
${req.note ? `<p style="background:#f4f6f4;border-radius:8px;padding:10px 14px;font-size:14px">${esc(req.note)}</p>` : ""}
<p style="margin:24px 0"><a href="${decisionUrl(req.token)}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">Esamina e decidi</a></p>
<p style="color:#8a9a92;font-size:12px">Apre una pagina con i pulsanti Approva e Rifiuta. Non succede nulla finché non premi. Dal telefono la trovi anche in Admin → Requests.</p>
</div>`;
  for (const a of admins ?? []) {
    if (a.email) await sendEmail({ to: a.email as string, subject: `Richiesta di accesso a LAURUS: ${req.full_name || req.email}`, html });
  }
}

export interface Decision {
  ok: boolean;
  message: string;
  /** The onboarding link, handed back when the email could not be sent, so it can be passed on by hand. */
  link?: string;
}

/** Approve: make the invite, tell the person. Only a request that is still pending can be approved. */
export async function approveAccessRequest(id: string, by: { userId: string | null; via: "panel" | "email" }): Promise<Decision> {
  const admin = createAdminClient();
  // Claim it first, so two taps (or panel and email at once) cannot make two invites.
  const { data: claimed } = await admin
    .from("access_requests")
    .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: by.userId, decided_via: by.via })
    .eq("id", id)
    .eq("status", "pending")
    .select(REQUEST_COLUMNS)
    .maybeSingle();
  if (!claimed) return { ok: false, message: "Richiesta già decisa o inesistente." };
  const req = claimed as AccessRequest;

  const { data: invite, error } = await admin
    .from("invites")
    .insert({ email: req.email.toLowerCase(), created_by: by.userId, prefill: req.full_name ? { full_name: req.full_name } : null })
    .select("token")
    .single();
  if (error || !invite) {
    await admin.from("access_requests").update({ status: "pending", decided_at: null, decided_by: null, decided_via: null }).eq("id", id);
    return { ok: false, message: `Invito non creato: ${error?.message ?? "errore"}. La richiesta è di nuovo in attesa.` };
  }
  await admin.from("access_requests").update({ invite_token: invite.token }).eq("id", id);

  const link = onboardingUrl(invite.token as string);
  if (!emailConfigured()) return { ok: true, message: `Approvata. Email non configurata: passale tu questo link.`, link };
  const sent = await sendEmail({
    to: req.email,
    // The one mail a person gets from LAURUS before they are in comes from "welcome@".
    // Any address on the verified domain can send; replies land in the admin's inbox.
    from: WELCOME_FROM,
    subject: "Il tuo accesso a LAURUS è pronto · Your LAURUS access is ready",
    html: `<div style="font-family:system-ui,sans-serif;max-width:32rem;color:#1a2b22">
<p>Ciao${req.full_name ? ` ${esc(req.full_name.split(" ")[0]!)}` : ""},</p>
<p>la tua richiesta è stata approvata. Apri il link e scegli come entrare: una password (almeno 8 caratteri) oppure il tuo account Google, con questo stesso indirizzo.</p>
<p style="margin:20px 0"><a href="${link}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;display:inline-block">Entra in LAURUS</a></p>
<p style="color:#6b7a72;font-size:13px">Il link è personale, vale 30 giorni e funziona una volta sola.</p>
<hr style="border:none;border-top:1px solid #e2e8e4;margin:24px 0">
<p>Your request has been approved. Open the link and choose how to sign in: a password (at least 8 characters) or your Google account with this same address. The link is personal, valid for 30 days and works once.</p>
<p style="color:#8a9a92;font-size:12px">LAURUS · Less paperwork. More wins.</p>
</div>`,
  });
  return sent.ok
    ? { ok: true, message: `Approvata. Ho mandato il link a ${req.email}.`, link }
    : { ok: true, message: `Approvata, ma la mail non è partita (${sent.error}). Passale tu questo link.`, link };
}

export async function rejectAccessRequest(id: string, by: { userId: string | null; via: "panel" | "email" }): Promise<Decision> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("access_requests")
    .update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: by.userId, decided_via: by.via })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  return data ? { ok: true, message: "Rifiutata." } : { ok: false, message: "Richiesta già decisa o inesistente." };
}
