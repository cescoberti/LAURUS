import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseIndicativeVotingList } from "./indicativeVotingList.ts";

// Group-internal "ECR VOTING LIST" variant (VAN OVERTVELDT, A10-0002/2026,
// ECB annual report): different header (no "Report:" line — code on a
// "Doc n°" line, rapporteur as a standalone all-caps paragraph), same table
// body. Internal document (carries vote indications) → gitignored; tests
// skip where the fixture is absent.
const fixturePath = fileURLToPath(
  new URL("../fixtures/ecr-vl-vanovertveldt-A10-0002-2026.docx", import.meta.url),
);
const skip = !existsSync(fixturePath) ? "private ECR fixture not present" : false;
const fixture = skip ? Buffer.alloc(0) : readFileSync(fixturePath);

test("parses the group-internal header variant", { skip }, async () => {
  const vl = await parseIndicativeVotingList(fixture);
  assert.equal(vl.documentTitle, "ECR VOTING LIST");
  assert.equal(vl.rapporteur, "VAN OVERTVELDT");
  assert.equal(vl.reportCode, "A10-0002/2026");
  assert.match(vl.reportTitle ?? "", /European Central Bank/);
});

test("original-text rows carry no amendment number; amendment rows do", { skip }, async () => {
  const vl = await parseIndicativeVotingList(fixture);
  const numbered = vl.rows.filter((r) => /\d/.test(r.amNo ?? ""));
  assert.equal(numbered.length, 41); // Am 1–41 all present
  const origText = vl.rows.find((r) => r.subject === "§ 25")!;
  assert.equal(origText.amNo, "§"); // separate vote on original text
});

test("split votes on original text attach their part rows", { skip }, async () => {
  const vl = await parseIndicativeVotingList(fixture);
  const split13 = vl.rows.find((r) => r.subject === "§ 13")!;
  assert.equal(split13.voteType, "split");
  assert.equal(split13.splitParts.length, 2);
});
