import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailConfigured } from "@/lib/notify/email";
import { sendDueReminders } from "@/lib/notify/whipReminder";
import { rapporteurLabel } from "@/lib/rapporteur";
import { logEvent } from "@/lib/track";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";

/**
 * Notification dispatcher — run by Vercel Cron (see vercel.json) or manually:
 *   curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/notify
 *
 * There is no daily digest here any more. It wrote to every member about every
 * file in the database, whether or not they follow it, and the only thing it
 * had to say was that amendments had been tabled — in a language nobody drafts
 * the Remarks in, days before the text that matters. What replaces it is
 * /api/alerts/vl, which is per-subscription and speaks on the two moments that
 * ask for work: the official voting list appearing or changing, and the
 * translation finishing in the follower's own language.
 *
 * 1. Clean-final: items voted in the last 25h → members with wants_clean_final
 *    get the link to the adopted-text page and the report files.
 * 2. Whip reminders: advisors with pending plenary notes, three weeks and two
 *    weeks before a sitting. Idempotent through laurus.whip_reminders.
 *
 * Every send is recorded in laurus.notifications-like events, and the whole
 * run no-ops gracefully while the provider keys are not configured.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "21 Oct" — the day is what tells you whether a file is urgent. */
function voteDay(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  // The run is at 07:00, before the day's votes: today's files are still ahead,
  // yesterday's are the ones that have just closed.
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 10);

  // --- 1. Items voted in the window (clean final) ------------------------
  // The window that has closed, and only that. `gte(since)` had no upper bound,
  // so "texts voted in plenary — final version" also listed every file whose
  // vote is still weeks away, and listed it again every morning until the day
  // came. On a date column, gte(yesterday) + lt(today) is yesterday alone.
  const { data: votedItems } = await supabase
    .from("items")
    .select("code, title, vote_date, rapporteur")
    .gte("vote_date", yesterday)
    .lt("vote_date", today);

  const { data: members } = await supabase
    .from("users")
    .select("id, email, whatsapp_phone, wants_email, wants_whatsapp, wants_clean_final");

  const sent = { cleanFinal: 0 };
  const skipped: string[] = [];
  if (!emailConfigured()) skipped.push("email: RESEND_API_KEY mancante");

  // --- Clean-final --------------------------------------------------------
  if (votedItems?.length && emailConfigured()) {
    for (const m of members ?? []) {
      if (!m.wants_clean_final) continue;
      const html =
        `<p>Texts voted in plenary — final version:</p><ul>` +
        votedItems
          .map((i) => {
            const t = (i.title ?? {}) as { en?: string; it?: string };
            const who = rapporteurLabel(i.rapporteur as string | null);
            const head = who ? esc(who) : esc(i.code as string);
            return (
              `<li style="margin-bottom:8px">` +
              `<a href="${SITE}/items/${encodeURIComponent(i.code as string)}" style="text-decoration:none;color:#1f5138"><strong>${head}</strong></a>` +
              (t.en || t.it ? ` — ${esc(t.en || t.it || "")}` : "") +
              `<br><span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#7a8a82">${esc(i.code as string)} · voted ${voteDay(i.vote_date as string | null) ?? i.vote_date}</span>` +
              `</li>`
            );
          })
          .join("") +
        `</ul><p>The official adopted texts are published by the EP under "Texts adopted".</p>`;
      const r = await sendEmail({ to: m.email, subject: `LAURUS — final post-vote texts (${votedItems.length})`, html });
      if (r.ok) sent.cleanFinal++;
    }
  }

  // --- Whip reminders (3 weeks / 2 weeks before a sitting) ----------------
  const reminders = await sendDueReminders(supabase);

  void logEvent("cron_notify", {
    meta: { voted: votedItems?.length ?? 0, sent, skipped, reminders },
  });
  return NextResponse.json({
    voted: votedItems?.length ?? 0,
    sent,
    skipped,
    reminders,
  });
}
