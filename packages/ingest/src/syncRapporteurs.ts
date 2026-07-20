/**
 * Backfill items.rapporteur from the per-sitting VOT XML.
 *
 *   npm run sync-rapporteurs -- 2026
 *
 * Every <vote> in PV-<term>-<date>-VOT_<lang>.xml carries a label of the form
 *   "Report: Joachim Streit (A10-0170/2026) (Majority of votes cast required)"
 * which gives the rapporteur for each voted report — far cheaper and far more
 * complete than resolving /documents/{id} creators one item at a time (that
 * endpoint rate-limits hard, which is why 74 items were left without a name).
 *
 * Only fills rows where rapporteur IS NULL; never overwrites existing values.
 */
import { createClient } from "@supabase/supabase-js";
import { fetchBytes } from "./httpFetch.ts";

const YEAR = Number(process.argv[2] ?? new Date().getFullYear());
const BASE = "https://data.europarl.europa.eu";
const TERM = 10;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "laurus" },
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// "Report:"/"Relazione:"/"Rapport:" <name> "(" <code> ")"
const LABEL_RE = /<label>(?:Relazione|Report|Rapport|Bericht|Informe)\s*:\s*([^(<]+?)\s*\(([A-Z]+\d+-\d+\/\d{4})\)/g;

async function main() {
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

  // Items still missing a rapporteur.
  const { data: missing, error: itemErr } = await supabase
    .from("items")
    .select("id, code")
    .is("rapporteur", null);
  if (itemErr || !missing) throw new Error(`items read: ${itemErr?.message}`);
  const idByCode = new Map(missing.map((i) => [i.code as string, i.id as string]));
  console.log(`items without rapporteur: ${idByCode.size}, scanning ${days.length} sitting days`);

  const found = new Map<string, string>();
  for (const day of days) {
    const url = `${BASE}/distribution/doc/PV-${TERM}-${day}-VOT_en.xml`;
    let res;
    try {
      res = await fetchBytes(url);
    } catch {
      continue;
    }
    if (res.status !== 200) continue;
    const xml = res.body.toString("utf8");
    for (const m of xml.matchAll(LABEL_RE)) {
      const name = m[1]!.trim();
      const code = m[2]!;
      if (idByCode.has(code) && !found.has(code) && name.length > 2) found.set(code, name);
    }
    await sleep(300);
  }

  console.log(`resolved ${found.size} rapporteurs`);
  let updated = 0;
  for (const [code, name] of found) {
    const { error } = await supabase
      .from("items")
      .update({ rapporteur: name })
      .eq("id", idByCode.get(code)!)
      .is("rapporteur", null);
    if (!error) {
      updated++;
      console.log(`  ${code} → ${name}`);
    }
  }
  console.log(`\ndone: ${updated} items updated.`);
}

main().catch((err) => {
  console.error("sync-rapporteurs failed:", err);
  process.exit(1);
});
