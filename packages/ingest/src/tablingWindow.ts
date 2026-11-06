/**
 * Are reports being tabled this week?
 *
 *   npm run tabling-window                   # prints 1 inside the window, 0 outside
 *   npm run tabling-window -- 2026-11-05     # asks about another day
 *
 * A report's rapporteur reaches open data the day the report is tabled, and
 * tabling happens in the run-up to the part-session that votes it. So
 * `sync-texts-tabled` earns its keep through the part-session week and the week
 * before it, and costs nothing worth paying the rest of the month — which is
 * what this gate is for.
 *
 * Both kinds of part-session count. The four-day Strasbourg weeks and the
 * one- or two-day Brussels mini-sessions (Jan II, Feb II, Nov … — the red
 * weeks in the EP calendar) table reports the same way, so no filter on
 * sessions.location: a mini-session's reports are tabled the week before it
 * like any other.
 *
 * The window opens on the MONDAY OF THE WEEK BEFORE the first sitting day and
 * closes at the end of the last one. A session that starts mid-week gets the
 * same treatment: the November mini-session (Wed 11 → Thu 12) opens the window
 * on Monday 2 November, the Monday of the week before its own.
 *
 * Read from laurus.sessions, the agenda LAURUS already syncs, so it follows the
 * real calendar — including a part-session that moves — rather than a hardcoded
 * list someone has to remember to update.
 */
import { makeAdminClient } from "./epShared.ts";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = process.argv.slice(2).find((a) => ISO.test(a)) ?? new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });

/** Noon UTC on `iso`, far enough from either midnight for ±2h of zone to be harmless. */
const noon = (iso: string) => new Date(`${iso}T12:00:00Z`);

function shift(iso: string, days: number): string {
  const d = noon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week `iso` falls in. */
function monday(iso: string): string {
  return shift(iso, -((noon(iso).getUTCDay() + 6) % 7));
}

const supabase = makeAdminClient();
const { data: sessions, error } = await supabase
  .from("sessions")
  .select("month_label, start_date, end_date, location")
  .gte("end_date", day)
  .order("start_date")
  .limit(3);

if (error) {
  console.error(`sessions query failed: ${error.message}`);
  process.exit(2);
}

let open = false;
for (const s of sessions ?? []) {
  const from = shift(monday(s.start_date as string), -7);
  const to = s.end_date as string;
  if (day < from || day > to) continue;
  open = true;
  const sitting = day >= (s.start_date as string);
  console.error(
    `${day}: ${sitting ? "sitting" : "tabling for"} ${s.month_label} ` +
      `(${s.location}, ${s.start_date} → ${s.end_date}) — window ${from} → ${to}`,
  );
  break;
}

if (!open) {
  const next = sessions?.[0];
  console.error(
    next
      ? `${day}: nothing being tabled — next is ${next.month_label} (${next.location}, ${next.start_date}), window opens ${shift(monday(next.start_date as string), -7)}`
      : `${day}: no part-session on record after today`,
  );
}

console.log(open ? "1" : "0");
