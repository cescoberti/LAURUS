/**
 * Local ingestion dry-run against the live EP Open Data API.
 *
 *   npm run ingest -- <year>
 *
 * Prints the plenary sittings for the year and, for one sample report, the
 * per-language file references discovered via the FRBR tree. Writes nothing to
 * the database — this is the "does the source still look like we think" check.
 */
import { listMeetings, listPlenaryDocuments, getDocument, fileRefs } from "./epApi.ts";
import { WORK_TYPES } from "./index.ts";

const year = Number(process.argv[2] ?? new Date().getFullYear());

async function main() {
  console.log(`\nEP API dry-run for ${year}\n${"=".repeat(28)}`);

  const meetings = await listMeetings(year, { limit: "5" });
  console.log(`\nPlenary sittings (first ${meetings.length}):`);
  for (const m of meetings) {
    console.log(`  ${m.activity_id}  ${m.activity_label?.en ?? m.activity_date}`);
  }

  const reports = await listPlenaryDocuments(year, WORK_TYPES.report, { limit: "1" });
  const sample = reports[0];
  if (!sample) {
    console.log("\nNo reports returned for this year.");
    return;
  }
  console.log(`\nSample report: ${sample.label ?? sample.identifier} (${sample.id})`);

  const docId = sample.id.split("/").pop()!;      // 'A-10-2026-0006'
  const full = await getDocument(docId);
  const refs = full ? fileRefs(full) : [];
  console.log(`  ${refs.length} file manifestations across languages:`);
  for (const r of refs.slice(0, 6)) {
    console.log(`    [${r.language}] ${r.format ?? "?"}  ${r.byteSize ?? "?"}B  ${r.path ?? ""}`);
  }
}

main().catch((err) => {
  console.error("ingest dry-run failed:", err.message);
  process.exit(1);
});
