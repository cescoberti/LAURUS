import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseIndicativeVotingList } from "./indicativeVotingList.ts";

// Real EP Tabling Service "INDICATIVE VOTING LIST FINAL VERSION" for the STREIT
// report (A10-0170/2026), Italian — the ground-truth annotated VL output.
// The file is an INTERNAL group document (it carries vote indications), so it
// is gitignored: these tests run where the fixture exists and skip elsewhere.
const fixturePath = fileURLToPath(
  new URL("../fixtures/annotated-vl-streit-A10-0170-2026-it.docx", import.meta.url),
);
const skip = !existsSync(fixturePath) ? "private STREIT fixture not present" : false;
const fixture = skip ? Buffer.alloc(0) : readFileSync(fixturePath);

test("reads the voting-list header metadata", { skip }, async () => {
  const vl = await parseIndicativeVotingList(fixture);
  assert.equal(vl.documentTitle, "INDICATIVE VOTING LIST");
  assert.equal(vl.version, "FINAL VERSION");
  assert.equal(vl.rapporteur, "STREIT");
  assert.equal(vl.reportCode, "A10-0170/2026");
  assert.equal(vl.procedureType, "[init.]");
  assert.equal(vl.committee, "Committee on Budgets");
  assert.match(vl.reportTitle ?? "", /European Investment Bank/);
});

test("extracts every amendment row with subject / Am No / author / vote", { skip }, async () => {
  const vl = await parseIndicativeVotingList(fixture);
  assert.equal(vl.rows.length, 17);

  const am11 = vl.rows.find((r) => r.amNo === "11")!;
  assert.equal(am11.subject, "After § 5");
  assert.equal(am11.author, "ESN");
  assert.equal(am11.vote, "-");
  assert.match(am11.remarks, /sottolinea che la BEI/);
});

test("a merged-subject continuation row inherits the previous subject", { skip }, async () => {
  const vl = await parseIndicativeVotingList(fixture);
  // Am 14 sits on the same subject (§ 12) as Am 6, with the subject cell merged.
  const am14 = vl.rows.find((r) => r.amNo === "14")!;
  assert.equal(am14.subject, "§ 12");
  assert.equal(am14.author, "PfE");
});

test("a split vote keeps its parts, each with its own remarks", { skip }, async () => {
  const vl = await parseIndicativeVotingList(fixture);
  const split = vl.rows.find((r) => r.amNo === "3")!;
  assert.equal(split.voteType, "split");
  assert.equal(split.splitParts.length, 2);
  assert.match(split.splitParts[0]!.remarks, /obiettivi principali della Banca/);
});

test("captures the final vote row", { skip }, async () => {
  const vl = await parseIndicativeVotingList(fixture);
  const final = vl.rows.find((r) => r.isFinalVote)!;
  assert.match(final.subject, /resolution \(as a whole\)/i);
  assert.equal(final.vote, "+");
});
