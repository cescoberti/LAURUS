/**
 * One-shot loader for a hand-parsed draft-agenda JSON (from the EP "SYN_POJ"
 * PDF the Conference of Presidents approves for each part-session). Fills the
 * whip cruscotto with the FULL file list of an upcoming session now, including
 * files that do not yet carry a numbered report (which `syncAgenda.ts` cannot
 * see via the API). Idempotent — keyed on (session, code).
 *
 *   npm run seed-agenda -- data/agenda-2026-09-STR.json
 *
 * Run this once per published session; `syncAgenda.ts` then keeps the
 * report-linked files fresh and picks up October on its own. Requires
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync } from "node:fs";
import { makeAdminClient } from "./epShared.ts";

interface AgendaFile {
  code: string;
  committee: string | null;
  committees?: string[];
  rapporteur: string | null;
  title: string;
}
interface AgendaSeed {
  session: { ep_meeting_id: string; month_label: string; start_date: string; end_date: string; location: "BXL" | "STR" };
  items: AgendaFile[];
}

const path = process.argv[2];
if (!path) {
  console.error("usage: npm run seed-agenda -- <path/to/agenda.json>");
  process.exit(1);
}

const supabase = makeAdminClient();

async function main() {
  const seed = JSON.parse(readFileSync(path, "utf8")) as AgendaSeed;
  const { session, items } = seed;

  // 1. Ensure the part-session exists.
  const { error: sessErr } = await supabase.from("sessions").upsert(
    {
      ep_meeting_id: session.ep_meeting_id,
      month_label: session.month_label,
      start_date: session.start_date,
      end_date: session.end_date,
      location: session.location,
    },
    { onConflict: "ep_meeting_id" },
  );
  if (sessErr) throw new Error(`session upsert: ${sessErr.message}`);

  const { data: sessionRow, error: readErr } = await supabase
    .from("sessions")
    .select("id")
    .eq("ep_meeting_id", session.ep_meeting_id)
    .single();
  if (readErr || !sessionRow) throw new Error(`session read: ${readErr?.message}`);

  // 2. Upsert the agenda files as items.
  const itemRows = items.map((f) => {
    const committees = f.committees?.length ? f.committees : f.committee ? [f.committee] : null;
    return {
      session_id: sessionRow.id,
      code: f.code,
      title: { en: f.title, it: "" },
      rapporteur: f.rapporteur,
      committee: committees?.[0] ?? f.committee,
      committees,
    };
  });
  const { error: itemErr } = await supabase.from("items").upsert(itemRows, { onConflict: "session_id,code" });
  if (itemErr) throw new Error(`items upsert: ${itemErr.message}`);

  // 3. Surface the session on the whip board (vote_count = item count).
  const { count } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionRow.id);
  await supabase.from("sessions").update({ vote_count: count ?? 0 }).eq("id", sessionRow.id);

  console.log(`seeded ${session.month_label} (${session.start_date}): ${itemRows.length} agenda files.`);
}

main().catch((err) => {
  console.error("seed-agenda failed:", err);
  process.exit(1);
});
