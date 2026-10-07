/**
 * Is the Parliament sitting, and for how much longer?
 *
 *   npm run session-window            # prints the hours left to cover, or 0
 *
 * The answer comes from the agenda LAURUS already syncs (laurus.sessions:
 * every part-session of the term with its start and end date), not from a
 * human remembering to start something. The window opens at noon Brussels
 * the day BEFORE the first sitting day — the Tabling Service publishes the
 * first voting lists and the translations start landing then — and closes at
 * the end of the last one.
 *
 * Printed as a number of hours, capped at 5.5 because that is what one
 * Actions job can hold; the ticker asks again when its own window runs out
 * and chains itself for as long as this says more than zero. So the plenary
 * week looks after itself: nobody runs anything the night before.
 */
import { createClient } from "@supabase/supabase-js";

const CAP_HOURS = 5.5;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "laurus" },
  auth: { autoRefreshToken: false, persistSession: false },
});

/** A wall-clock moment in Brussels, as an absolute instant. */
function brussels(day: string, hour: number): Date {
  // The offset Brussels is on that day (+01:00 or +02:00), read from the zone
  // itself rather than assumed, so this is right on both sides of the change.
  const probe = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  const shown = new Date(probe.toLocaleString("en-US", { timeZone: "Europe/Brussels" }));
  const utc = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(probe.getTime() - (shown.getTime() - utc.getTime()));
}

/** The day before `iso`, as YYYY-MM-DD. */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });

const { data: sessions, error } = await supabase
  .from("sessions")
  .select("month_label, start_date, end_date")
  .gte("end_date", today)
  .order("start_date")
  .limit(2);

if (error) {
  console.error(`sessions query failed: ${error.message}`);
  process.exit(2);
}

const now = Date.now();
let hours = 0;
let which = "";

for (const s of sessions ?? []) {
  const opens = brussels(dayBefore(s.start_date as string), 12).getTime();
  const closes = brussels(s.end_date as string, 23).getTime();
  if (now < opens || now >= closes) continue;
  hours = Math.min(CAP_HOURS, (closes - now) / 3_600_000);
  which = `${s.month_label} (${s.start_date} → ${s.end_date})`;
  break;
}

// Two decimals: the chaining step compares this against zero and passes it on.
console.log(hours > 0 ? hours.toFixed(2) : "0");
if (which) console.error(`sitting: ${which} — ${hours.toFixed(2)}h of ticking to cover`);
else console.error("no part-session open: nothing to tick");
