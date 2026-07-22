/**
 * Forward draft-agenda sync: pull the PUBLISHED order of business for upcoming
 * part-sessions from the EP Open Data API into Supabase (laurus schema), so the
 * whip cruscotto can pre-assign advisors to files before the votes happen.
 *
 *   npm run sync-agenda -- 2026
 *
 * Complements `sync.ts` (which only ever sees files AFTER they are voted). This
 * reads `/meetings/{sitting}/foreseen-activities` for every sitting day of the
 * remaining part-sessions of the year and upserts one `items` row per agenda
 * file that already carries a committee report (A/B/RC doc). Idempotent —
 * re-run it as the agenda firms up; the same file keeps the same (session,code)
 * key, and October fills in on its own once the EP publishes it (~late Sept).
 *
 * Files still lacking a numbered report (shown as "A10-/" in the draft agenda)
 * have no linked doc yet, so they are skipped here and picked up on a later run;
 * the September top-up seed (`seedAgenda.ts`) covers those for the current
 * session. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { listMeetings, getDocument } from "./epApi.ts";
import { BASE, UA, makeAdminClient, groupSessions, displayCode, COMMITTEES, personName, mapLimit } from "./epShared.ts";

const YEAR = Number(process.argv[2] ?? new Date().getFullYear());
const TODAY = new Date().toISOString().slice(0, 10);

const supabase = makeAdminClient();

interface ForeseenActivity {
  activity_id: string;
  activity_date?: string;
  activity_label?: Record<string, string>;
  based_on_a_realization_of?: string[];
  had_activity_type?: string;
}

/** GET a sitting's draft agenda; tolerate the not-yet-published 404/empty case. */
async function foreseenActivities(meetingId: string): Promise<ForeseenActivity[]> {
  const url = new URL(`${BASE}/api/v2/meetings/${meetingId}/foreseen-activities`);
  url.searchParams.set("format", "application/ld+json");
  url.searchParams.set("limit", "300");
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/ld+json", "User-Agent": UA } });
      if (res.status === 404) return []; // agenda not published yet
      if (!res.ok) throw new Error(`foreseen-activities ${meetingId} ${res.status}`);
      return ((await res.json()) as { data?: ForeseenActivity[] }).data ?? [];
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

/** Pick the committee report (A/B/RC) a foreseen file item is based on, if any. */
function reportRef(item: ForeseenActivity): string | undefined {
  return (item.based_on_a_realization_of ?? [])
    .map((ref) => ref.split("/").pop()!)
    .find((id) => /^(A|B|RC)-\d+-\d{4}-\d+$/.test(id));
}

async function main() {
  const { data: run } = await supabase
    .from("ingestion_runs")
    .insert({ source: `ep-api:sync-agenda:${YEAR}` })
    .select("id")
    .single();

  try {
    // 1. Ensure part-sessions exist (idempotent) — the calendar is published
    //    well ahead of the votes, so future sessions already come back here.
    const meetings = await listMeetings(YEAR, { limit: "500" });
    const sessions = groupSessions(meetings.map((m) => m.activity_date));
    const { error: sessErr } = await supabase.from("sessions").upsert(sessions, { onConflict: "ep_meeting_id" });
    if (sessErr) throw new Error(`sessions upsert: ${sessErr.message}`);

    const { data: sessionRows, error: sessReadErr } = await supabase
      .from("sessions")
      .select("id, start_date, end_date")
      .gte("start_date", `${YEAR}-01-01`)
      .lte("start_date", `${YEAR}-12-31`);
    if (sessReadErr || !sessionRows) throw new Error(`sessions read: ${sessReadErr?.message}`);

    // 2. Upcoming/current sittings only — past votes are `sync.ts`'s job.
    const upcoming = sessionRows.filter((s) => s.end_date >= TODAY);
    const sittingDays = meetings
      .map((m) => m.activity_date)
      .filter((d) => d && d >= TODAY)
      .sort();
    console.log(`upcoming part-sessions: ${upcoming.length}, sitting days to scan: ${sittingDays.length}`);

    const sessionFor = (date: string) =>
      sessionRows.find((s) => s.start_date <= date && date <= s.end_date)?.id;

    // 3. Collect draft-agenda file items across those sittings (dedup per file).
    const seen = new Map<string, { sessionId: string; identifier: string; code: string; title: { en: string; it: string } }>();
    for (const day of sittingDays) {
      const sessionId = sessionFor(day);
      if (!sessionId) continue;
      const activities = await foreseenActivities(`MTG-PL-${day}`);
      for (const a of activities) {
        const identifier = reportRef(a);
        if (!identifier) continue; // procedural item or file without a report yet
        const code = displayCode(identifier);
        const key = `${sessionId}|${code}`;
        if (seen.has(key)) continue;
        seen.set(key, {
          sessionId,
          identifier,
          code,
          title: { en: a.activity_label?.en ?? code, it: a.activity_label?.it ?? "" },
        });
      }
    }
    const files = [...seen.values()];
    console.log(`draft-agenda files with a report: ${files.length}`);

    // 4. Resolve committee + rapporteur from the report's FRBR tree.
    let detailsOk = 0;
    const enriched = await mapLimit(files, 4, async (f) => {
      let committee: string | undefined;
      let rapporteur: string | undefined;
      try {
        const doc = await getDocument(f.identifier);
        if (doc) {
          detailsOk++;
          const creator = (doc as unknown as { creator?: string[] }).creator ?? [];
          committee = creator
            .filter((c) => c.startsWith("org/"))
            .map((c) => c.slice(4))
            .find((code) => COMMITTEES.has(code));
          const person = creator.find((c) => c.startsWith("person/"));
          if (person) rapporteur = await personName(person);
        }
      } catch {
        // a missing committee/rapporteur is not fatal — the row is still useful
      }
      return { ...f, committee, rapporteur };
    });
    console.log(`report details resolved: ${detailsOk}/${files.length}`);

    // 5. Upsert items. No vote_date — these have not been voted yet.
    const itemRows = enriched.map((e) => ({
      session_id: e.sessionId,
      code: e.code,
      ep_work_id: `eli/dl/doc/${e.identifier}`,
      title: e.title,
      rapporteur: e.rapporteur ?? null,
      committee: e.committee ?? null,
      committees: e.committee ? [e.committee] : null,
    }));
    if (itemRows.length) {
      const { error: itemErr } = await supabase.from("items").upsert(itemRows, { onConflict: "session_id,code" });
      if (itemErr) throw new Error(`items upsert: ${itemErr.message}`);
    }
    console.log(`items: ${itemRows.length} upserted`);

    // 6. Surface the touched sessions on the whip board (vote_count = item count).
    const touched = new Set(enriched.map((e) => e.sessionId));
    for (const sessionId of touched) {
      const { count } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);
      await supabase.from("sessions").update({ vote_count: count ?? 0 }).eq("id", sessionId);
    }

    if (run) {
      await supabase
        .from("ingestion_runs")
        .update({
          status: "ok",
          finished_at: new Date().toISOString(),
          found: { upcoming_sessions: upcoming.length, files: files.length, items: itemRows.length },
        })
        .eq("id", run.id);
    }
    console.log("sync-agenda done.");
  } catch (err) {
    if (run) {
      await supabase
        .from("ingestion_runs")
        .update({ status: "error", finished_at: new Date().toISOString(), error: String(err) })
        .eq("id", run.id);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("sync-agenda failed:", err);
  process.exit(1);
});
