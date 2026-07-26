/**
 * Ingest the official per-sitting "Results of votes" XML (VOT) and store, per
 * item and language, the vote-request data group advisors need:
 *
 *   - split-vote requests WITH THE FULL TEXT of each part (partValue),
 *   - separate-vote requests,
 *   - roll-call requests,
 *
 * all localised (the _it.xml carries Italian subjects and part texts).
 *
 *   npm run sync-vot -- 2026            # languages = union of member prefs
 *   npm run sync-vot -- 2026 it,en      # explicit
 *
 * Source: deterministic distribution path
 *   https://data.europarl.europa.eu/distribution/doc/PV-10-YYYY-MM-DD-VOT_<lang>.xml
 * (missing days → 404 → skipped). Items are matched by the report code(s)
 * cited in each <vote> label. Idempotent: upsert on (item_id, language).
 */
import { createClient } from "@supabase/supabase-js";
import { parseVotXml } from "@laurus/parser/vot-xml";
import { fetchBytes } from "./httpFetch.ts";

const YEAR = Number(process.argv[2] ?? new Date().getFullYear());
const LANGS_ARG = (process.argv[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const BASE = "https://data.europarl.europa.eu";
const TERM = 10;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "laurus" },
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The XML shapes and the extraction live in @laurus/parser/vot-xml so the
// voting-list verifier can re-derive the same requests from the same source.

async function main() {
  const { data: run } = await supabase
    .from("ingestion_runs")
    .insert({ source: `ep-api:vot:${YEAR}` })
    .select("id")
    .single();

  try {
    let LANGS = LANGS_ARG;
    if (LANGS.length === 0) {
      const { data: userLangs } = await supabase.from("users").select("languages");
      LANGS = [...new Set((userLangs ?? []).flatMap((u) => (u.languages as string[]) ?? []))];
      if (LANGS.length === 0) LANGS = ["it", "en"];
    }

    // Sitting days = every day inside the year's part-sessions.
    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select("start_date, end_date")
      .gte("start_date", `${YEAR}-01-01`)
      .lte("start_date", `${YEAR}-12-31`);
    if (sessErr || !sessions) throw new Error(`sessions read: ${sessErr?.message}`);
    const days: string[] = [];
    for (const s of sessions) {
      for (let t = Date.parse(s.start_date); t <= Date.parse(s.end_date); t += 86_400_000) {
        days.push(new Date(t).toISOString().slice(0, 10));
      }
    }
    days.sort();

    // Items lookup by code.
    const { data: items, error: itemErr } = await supabase.from("items").select("id, code");
    if (itemErr || !items) throw new Error(`items read: ${itemErr?.message}`);
    const itemByCode = new Map(items.map((i) => [i.code, i.id]));

    let stored = 0;
    let daysWithVot = 0;

    for (const day of days) {
      for (const lang of LANGS) {
        const url = `${BASE}/distribution/doc/PV-${TERM}-${day}-VOT_${lang}.xml`;
        let res;
        try {
          res = await fetchBytes(url);
        } catch {
          continue;
        }
        if (res.status !== 200) continue;
        daysWithVot++;

        let votes;
        try {
          votes = parseVotXml(res.body.toString("utf8"));
        } catch (err) {
          console.warn(`  ${day} ${lang}: XML parse failed — ${err}`);
          continue;
        }

        const rows: Array<Record<string, unknown>> = [];
        for (const vote of votes) {
          const itemId = vote.codes.map((c) => itemByCode.get(c)).find(Boolean);
          if (!itemId) continue;
          rows.push({ item_id: itemId, language: lang, source_url: url, payload: vote.payload });
        }
        if (rows.length) {
          // One VOT file can cite the same item once only; still de-dupe defensively.
          const unique = [...new Map(rows.map((r) => [`${r.item_id}|${r.language}`, r])).values()];
          const { error } = await supabase.from("vot_requests").upsert(unique, { onConflict: "item_id,language" });
          if (error) console.warn(`  ${day} ${lang}: upsert failed — ${error.message}`);
          else {
            stored += unique.length;
            console.log(`  ${day} ${lang}: ${unique.length} items with vote requests`);
          }
        }
        await sleep(400);
      }
    }

    console.log(`\ndone: ${stored} vot_requests rows (${daysWithVot} VOT files found).`);
    if (run) {
      await supabase
        .from("ingestion_runs")
        .update({
          status: "ok",
          finished_at: new Date().toISOString(),
          found: { days_scanned: days.length, vot_files: daysWithVot, rows: stored },
        })
        .eq("id", run.id);
    }
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
  console.error("sync-vot failed:", err);
  process.exit(1);
});
