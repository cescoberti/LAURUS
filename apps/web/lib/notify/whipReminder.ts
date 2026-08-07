/**
 * Whip reminders: each advisor is emailed twice before a sitting — three weeks
 * out as a heads-up, two weeks out because the plenary note is due that day.
 *
 * The mail lists only that advisor's own files that are still pending, so it
 * shrinks as they submit. `whip_reminders` is the send receipt: its unique key
 * (session, advisor, stage) is what makes the daily cron and the whip's manual
 * "send due reminders" button safe to run repeatedly.
 *
 * An advisor with no LAURUS account has no address, so nothing is sent and
 * nothing is recorded — they show up as unreachable on the whip board instead
 * of silently counting as reminded.
 */
import { sendEmail, emailConfigured } from "./email";
import { rapporteurLabel } from "@/lib/rapporteur";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://laurus-web-theta.vercel.app";
const BRAND = "#1f5138";
const DAY = 86_400_000;

/** Days before the sitting at which each reminder goes out. */
export const STAGES = { T21: 21, T14: 14 } as const;
export type Stage = keyof typeof STAGES;

export interface ReminderFile {
  code: string;
  rapporteur: string | null;
  title: string;
  committee: string | null;
}

export interface ReminderRecipient {
  advisor: string;
  email: string | null;
  files: ReminderFile[];
}

export interface DueReminder {
  sessionId: string;
  sessionLabel: string;
  startDate: string;
  endDate: string;
  location: string;
  /** Date the plenary note is due (two weeks before the sitting). */
  noteDue: string;
  stage: Stage;
  /** Calendar date this reminder became due. */
  dueOn: string;
  recipients: ReminderRecipient[];
  /** Advisors already emailed for this (session, stage). */
  alreadySent: string[];
}

const iso = (d: number) => new Date(d).toISOString().slice(0, 10);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export function renderReminderHtml(r: DueReminder, recipient: ReminderRecipient): string {
  const isDeadline = r.stage === "T14";
  const lead = isDeadline
    ? `The plenary note is due <strong>today</strong> for the files below.`
    : `Three weeks to the ${esc(r.sessionLabel)} part-session. The plenary note for the files below is due on <strong>${fmtDate(r.noteDue)}</strong>.`;

  const rows = recipient.files
    .map(
      (f) => `<li style="margin-bottom:10px">
        <div style="font-size:14px;font-weight:600;letter-spacing:.03em;color:#1a2b22">${esc(rapporteurLabel(f.rapporteur) ?? "No rapporteur")}</div>
        <div style="font-size:13px;color:#4a5a52">${esc(f.title)}</div>
        <div style="font-size:12px;color:${BRAND};font-family:ui-monospace,Menlo,monospace">${esc(f.code)}${f.committee ? ` · ${esc(f.committee)}` : ""}</div>
      </li>`,
    )
    .join("");

  return `<!doctype html><meta charset="utf-8">
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:40rem;margin:0 auto;padding:24px;color:#1a2b22">
  <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND};font-weight:600">LAURUS</div>
  <h1 style="font-size:20px;margin:6px 0 4px">${esc(r.sessionLabel)} · ${fmtDate(r.startDate)}–${fmtDate(r.endDate)} · ${esc(r.location)}</h1>
  <p style="color:#4a5a52;font-size:14px;margin:0 0 16px">${lead}</p>

  <div style="background:${isDeadline ? "#fdeeec" : "#e8f0ea"};border-left:4px solid ${isDeadline ? "#b3261e" : BRAND};padding:10px 14px;border-radius:0 6px 6px 0;font-size:14px">
    ${recipient.files.length} file${recipient.files.length === 1 ? "" : "s"} still waiting on you.
  </div>

  <ul style="list-style:none;padding:0;margin:18px 0">${rows}</ul>

  <p style="font-size:13px">
    <a href="${SITE}/whip" style="color:${BRAND};font-weight:600">Open the whip board</a>
    — mark a note as submitted there once it is done.
  </p>
  <p style="color:#8a9a92;font-size:12px;margin:24px 0 0;border-top:1px solid #e4e9e6;padding-top:12px">
    You are getting this because these committees' files are assigned to you. Reminders go out three weeks
    and two weeks before each part-session, and only list what is still pending.
  </p>
</div>`;
}

// ---------------------------------------------------------------------------
// Which reminders are due, and for whom
// ---------------------------------------------------------------------------

interface ItemRow {
  code: string;
  title: { en?: string; it?: string };
  rapporteur: string | null;
  committee: string | null;
  committees: string[] | null;
  assigned_advisors: Record<string, string> | null;
  note_status: string;
  session_id: string;
}

/** Normalised name key, so "Jan van Brussel" links to the same person as "JAN VAN BRUSSEL". */
const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Every reminder that is due on `today` and not yet sent. A stage stays due
 * from its date until the sitting starts, so a missed cron day catches up
 * instead of skipping the advisor.
 */
export async function findDueReminders(admin: Admin, today = iso(Date.now())): Promise<DueReminder[]> {
  const todayMs = Date.parse(today);

  const { data: sessions } = await admin
    .from("sessions")
    .select("id, month_label, start_date, end_date, location")
    .gte("start_date", today)
    .order("start_date");
  if (!sessions?.length) return [];

  // Advisor → email: the explicit link first, then a full-name match.
  const [{ data: advisorRows }, { data: users }] = await Promise.all([
    admin.from("committee_advisors").select("code, advisor, advisor_user_id"),
    admin.from("users").select("id, email, full_name"),
  ]);
  const userById = new Map((users ?? []).map((u) => [u.id as string, u]));
  const userByName = new Map((users ?? []).filter((u) => u.full_name).map((u) => [nameKey(u.full_name as string), u]));

  const advisorByCommittee = new Map<string, string>();
  const emailByAdvisor = new Map<string, string>();
  for (const a of advisorRows ?? []) {
    if (!a.advisor) continue;
    advisorByCommittee.set(a.code as string, a.advisor as string);
    const linked = a.advisor_user_id ? userById.get(a.advisor_user_id as string) : undefined;
    const matched = linked ?? userByName.get(nameKey(a.advisor as string));
    if (matched?.email) emailByAdvisor.set(a.advisor as string, matched.email as string);
  }

  const due: DueReminder[] = [];
  for (const s of sessions) {
    const startMs = Date.parse(s.start_date as string);
    for (const [stage, days] of Object.entries(STAGES) as Array<[Stage, number]>) {
      const dueOn = iso(startMs - days * DAY);
      if (todayMs < Date.parse(dueOn)) continue; // not yet
      // T21 stops being the right message once T14 has come round.
      if (stage === "T21" && todayMs >= startMs - STAGES.T14 * DAY) continue;

      const { data: sent } = await admin
        .from("whip_reminders")
        .select("advisor")
        .eq("session_id", s.id)
        .eq("stage", stage);
      const alreadySent = (sent ?? []).map((r) => r.advisor as string);

      const { data: items } = await admin
        .from("items")
        .select("code, title, rapporteur, committee, committees, assigned_advisors, note_status, session_id")
        .eq("session_id", s.id)
        .eq("note_status", "pending");

      const byAdvisor = new Map<string, ReminderFile[]>();
      for (const it of (items ?? []) as ItemRow[]) {
        const codes = it.committees?.length ? it.committees : it.committee ? [it.committee] : [];
        const overrides = it.assigned_advisors ?? {};
        // A joint file reminds each committee's advisor about their own share.
        for (const c of new Set(codes)) {
          const advisor = overrides[c] ?? advisorByCommittee.get(c);
          if (!advisor) continue;
          const list = byAdvisor.get(advisor) ?? [];
          if (!list.some((f) => f.code === it.code)) {
            list.push({
              code: it.code,
              rapporteur: it.rapporteur,
              title: it.title?.en || it.title?.it || it.code,
              committee: c,
            });
          }
          byAdvisor.set(advisor, list);
        }
      }
      if (byAdvisor.size === 0) continue;

      due.push({
        sessionId: s.id as string,
        sessionLabel: s.month_label as string,
        startDate: s.start_date as string,
        endDate: s.end_date as string,
        location: s.location as string,
        noteDue: iso(startMs - STAGES.T14 * DAY),
        stage,
        dueOn,
        alreadySent,
        recipients: [...byAdvisor.entries()]
          .map(([advisor, files]) => ({ advisor, email: emailByAdvisor.get(advisor) ?? null, files }))
          .sort((a, b) => a.advisor.localeCompare(b.advisor)),
      });
    }
  }
  return due;
}

export interface ReminderSendResult {
  sent: number;
  skippedAlreadySent: number;
  skippedNoAccount: string[];
  failed: string[];
}

/** Send every due reminder that has not gone out yet. Safe to run repeatedly. */
export async function sendDueReminders(admin: Admin, today = iso(Date.now())): Promise<ReminderSendResult> {
  const result: ReminderSendResult = { sent: 0, skippedAlreadySent: 0, skippedNoAccount: [], failed: [] };
  if (!emailConfigured()) {
    result.failed.push("RESEND_API_KEY not set");
    return result;
  }

  for (const reminder of await findDueReminders(admin, today)) {
    for (const recipient of reminder.recipients) {
      if (reminder.alreadySent.includes(recipient.advisor)) {
        result.skippedAlreadySent++;
        continue;
      }
      if (!recipient.email) {
        // No LAURUS account: nothing sent, nothing recorded — so it goes out
        // as soon as the account is linked, and shows as a gap until then.
        if (!result.skippedNoAccount.includes(recipient.advisor)) result.skippedNoAccount.push(recipient.advisor);
        continue;
      }

      const subject =
        reminder.stage === "T14"
          ? `LAURUS — plenary notes due today (${reminder.sessionLabel})`
          : `LAURUS — ${reminder.sessionLabel} in three weeks: ${recipient.files.length} file${recipient.files.length === 1 ? "" : "s"}`;

      const res = await sendEmail({ to: recipient.email, subject, html: renderReminderHtml(reminder, recipient) });
      if (!res.ok) {
        result.failed.push(`${recipient.advisor}: ${res.error}`);
        continue;
      }
      // Record only after the provider accepted it.
      await admin.from("whip_reminders").insert({
        session_id: reminder.sessionId,
        advisor: recipient.advisor,
        advisor_email: recipient.email,
        stage: reminder.stage,
        item_codes: recipient.files.map((f) => f.code),
      });
      result.sent++;
    }
  }
  return result;
}
