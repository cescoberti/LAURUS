/**
 * THE source of items.rapporteur and items.committee for the week ahead.
 *
 * Fills them from the synoptic final draft agenda (PDOJ) the Plenary Sittings
 * Directorate publishes before a sitting — the only document that names the
 * rapporteur while there is still time to prepare the list, which is what
 * LAURUS is for. `sync-rapporteurs`, reading the post-vote VOT XML, is a
 * backfill for past sittings and nothing more.
 *
 *   npm run sync-pdoj -- ~/Downloads/pdoj.txt            # shows what it would do
 *   npm run sync-pdoj -- ~/Downloads/pdoj.txt --write    # writes it
 *
 * Why this exists: syncRapporteurs reads the per-sitting VOT XML, which the EP
 * publishes AFTER the vote. A file that has not been voted yet therefore has no
 * rapporteur and no committee anywhere in the data — exactly the files an
 * advisor is preparing, which is why the list showed "No rapporteur" and "TBD"
 * on the week's agenda. The PDOJ names both, in advance, and is the document
 * the Conference of Presidents has approved.
 *
 * It takes TEXT, not the PDF: the agenda is published as PDF only (no DOCX or
 * XML sibling at the same path), and nothing in this monorepo can read a PDF.
 * Extract it first, with whatever is at hand:
 *
 *   pdftotext -layout pdoj.pdf pdoj.txt        # poppler
 *   python3 -c "from pypdf import PdfReader; ..."
 *
 * Writes only where the column is NULL — a name already in the database, which
 * came from the VOT after a vote, is the more authoritative one and is kept.
 * Nothing is written without --write.
 */
import { readFileSync } from "node:fs";
import { parsePdoj } from "@laurus/parser/pdoj";
import { makeAdminClient } from "./epShared.ts";

const path = process.argv[2];
const WRITE = process.argv.includes("--write");

if (!path || path.startsWith("--")) {
  console.error("usage: sync-pdoj -- <pdoj.txt> [--write]");
  process.exit(2);
}

const supabase = makeAdminClient();

async function main() {
  const entries = parsePdoj(readFileSync(path!, "utf8"));
  const withCode = entries.filter((e) => e.code !== null);
  console.log(`PDOJ: ${entries.length} files, ${withCode.length} with a number`);
  const skipped = entries.length - withCode.length;
  if (skipped) console.log(`  (${skipped} not numbered yet — nothing to match them on)`);

  const codes = withCode.map((e) => e.code!);
  const { data: items, error } = await supabase
    .from("items")
    .select("id, code, rapporteur, committee")
    .in("code", codes);
  if (error || !items) throw new Error(`items read: ${error?.message}`);
  const byCode = new Map(items.map((i) => [i.code as string, i]));

  const plan: Array<{ id: string; code: string; patch: Record<string, string> }> = [];
  const unknown: string[] = [];
  for (const e of withCode) {
    const item = byCode.get(e.code!);
    if (!item) {
      unknown.push(e.code!);
      continue;
    }
    const patch: Record<string, string> = {};
    // The PDOJ prints surnames only, which is the form the interface shows.
    if (!item.rapporteur && e.rapporteurs.length) patch.rapporteur = e.rapporteurs.join(", ");
    // A jointly responsible file keeps the first committee here; the full set
    // belongs in items.committees, which syncAgenda owns.
    if (!item.committee && e.committees.length) patch.committee = e.committees[0]!;
    if (Object.keys(patch).length) plan.push({ id: item.id as string, code: e.code!, patch });
  }

  if (unknown.length) console.log(`not in the database: ${unknown.join(", ")}`);
  console.log(`\n${plan.length} items would be filled:`);
  for (const p of plan) {
    const bits = Object.entries(p.patch).map(([k, v]) => `${k}=${v}`);
    console.log(`  ${p.code.padEnd(16)} ${bits.join("  ")}`);
  }

  if (!WRITE) {
    console.log("\ndry run — pass --write to apply.");
    return;
  }

  let updated = 0;
  for (const p of plan) {
    // The NULL guards are repeated in the statement: between reading and
    // writing a sync may have landed the real value, and that one wins.
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
  console.error("sync-pdoj failed:", err);
  process.exit(1);
});
