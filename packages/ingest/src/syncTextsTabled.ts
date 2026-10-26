/**
 * THE source of items.rapporteur and items.committee.
 *
 *   npm run sync-texts-tabled                 # shows what it would write
 *   npm run sync-texts-tabled -- --write      # writes it
 *
 * Reads the EP's "Texts tabled → Reports" page, which is where a report shows
 * up as soon as it is tabled — the week before the plenary that votes it, which
 * is the week LAURUS exists for:
 *
 *   https://www.europarl.europa.eu/plenary/en/texts-submitted.html
 *
 * It gives the rapporteur's FULL name, the responsible committees, the
 * procedure reference and the tabling date. `sync-rapporteurs` reads the same
 * names out of the per-sitting VOT XML, but that is published after the vote,
 * so it can say nothing about the files anyone is actually preparing; it is a
 * backfill for past part-sessions and nothing more.
 *
 * The page shows the latest tabled reports, so this is meant to run daily
 * through the tabling period rather than once: each report is picked up on the
 * day it appears. Pass a URL to read a filtered result page instead — the
 * search form is a POST, so the way to narrow it today is to run the search in
 * the browser and hand over the resulting page.
 *
 * Writes only where the column is NULL; nothing at all without --write.
 */
import { readFileSync } from "node:fs";
import { parseTextsTabled } from "@laurus/parser/texts-tabled";
import { fetchBytesPatiently } from "./httpFetch.ts";
import { makeAdminClient } from "./epShared.ts";

const LATEST = "https://www.europarl.europa.eu/plenary/en/texts-submitted.html";
const WRITE = process.argv.includes("--write");
const source = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? LATEST;

/** The page, fetched or read from a file saved out of the browser. */
async function pageHtml(from: string): Promise<string> {
  if (!/^https?:\/\//.test(from)) return readFileSync(from, "utf8");
  // node:https, never fetch(): the EP WAF rejects undici at the TLS level, and
  // its www host answers a datacenter client with an empty 202 before serving
  // the page, so the retry-with-cookies helper is the one to use.
  const res = await fetchBytesPatiently(from, { Accept: "text/html" });
  if (res.status !== 200) {
    // Checked from a residential address and from a datacenter one: the www
    // host does not serve this page to an HTTP client, only to a browser.
    // Until this script is pointed at the browser helper the way
    // votesPageBrowser.ts is, the page has to come in by hand.
    throw new Error(
      `${res.status} for ${from}\n\n` +
        `  The EP does not serve this page to an HTTP client. Open it in a browser,\n` +
        `  save it (⌘S), and pass the file instead:\n\n` +
        `    npm run sync-texts-tabled --workspace @laurus/ingest -- ~/Downloads/texts-submitted.html\n`,
    );
  }
  return res.body.toString("utf8");
}

async function main() {
  const reports = parseTextsTabled(await pageHtml(source));
  console.log(`${reports.length} tabled reports on the page`);
  if (reports.length === 0) {
    console.log("nothing to match — the page may have changed shape, or the search returned no rows.");
    return;
  }

  const supabase = makeAdminClient();
  const { data: items, error } = await supabase
    .from("items")
    .select("id, code, rapporteur, committee")
    .in(
      "code",
      reports.map((r) => r.code),
    );
  if (error || !items) throw new Error(`items read: ${error?.message}`);
  const byCode = new Map(items.map((i) => [i.code as string, i]));

  const plan: Array<{ id: string; code: string; patch: Record<string, string> }> = [];
  const unknown: string[] = [];
  for (const r of reports) {
    const item = byCode.get(r.code);
    if (!item) {
      unknown.push(r.code);
      continue;
    }
    const patch: Record<string, string> = {};
    if (!item.rapporteur && r.rapporteurs.length) patch.rapporteur = r.rapporteurs.join(", ");
    // The full set of committees belongs in items.committees, which syncAgenda
    // owns; this column holds the leading one.
    if (!item.committee && r.committees.length) patch.committee = r.committees[0]!;
    if (Object.keys(patch).length) plan.push({ id: item.id as string, code: r.code, patch });
  }

  if (unknown.length) console.log(`not in the database yet: ${unknown.join(", ")}`);
  console.log(`\n${plan.length} items would be filled:`);
  for (const p of plan) {
    console.log(`  ${p.code.padEnd(16)} ${Object.entries(p.patch).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  }

  if (!WRITE) {
    console.log("\ndry run — pass --write to apply.");
    return;
  }

  let updated = 0;
  for (const p of plan) {
    // Guarded again in the statement: between the read and the write a sync may
    // have landed a value, and an existing one is left alone.
    let q = supabase.from("items").update(p.patch).eq("id", p.id);
    if (p.patch.rapporteur) q = q.is("rapporteur", null);
    if (p.patch.committee) q = q.is("committee", null);
    const { error: upErr } = await q;
    if (upErr) console.error(`  ${p.code}: ${upErr.message}`);
    else updated++;
  }
  console.log(`\ndone: ${updated} items updated.`);
}

main().catch((err) => {
  console.error("sync-texts-tabled failed:", err);
  process.exit(1);
});
