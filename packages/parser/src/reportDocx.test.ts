import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseMotionText, originalTextFor } from "./reportDocx.ts";
import { parseIndicativeVotingList } from "./indicativeVotingList.ts";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));

// Real report A10-0224/2026 (HALICKI, BUDG) in Italian, from the EP
// distribution path, and the EP's official voting list for it (public,
// "Order and lists of votes", FINAL VERSION). Captured 2026-09-14.

test("indexes the motion for a resolution by citation, recital and paragraph", async () => {
  const motion = await parseMotionText(fixture("rep-A-10-2026-0224-it.docx"));
  assert.ok(motion);
  assert.equal(motion.citations.length, 12);
  assert.deepEqual([...motion.recitals.keys()], ["A", "B", "C", "D", "E"]);
  assert.equal(motion.paragraphs.size, 13);
  assert.match(motion.paragraphs.get(2) ?? "", /^2\. accoglie con favore/);
  assert.match(motion.citations[5] ?? "", /^visto l'accordo interistituzionale/);
  // Footnote markers are dropped, the text is otherwise verbatim.
  assert.doesNotMatch(motion.citations[2] ?? "", /\[\d\]/);
});

test("resolves a voting-list subject to the motion text", async () => {
  const motion = (await parseMotionText(fixture("rep-A-10-2026-0224-it.docx")))!;
  assert.match(originalTextFor("§ 10", motion) ?? "", /^10\. ribadisce/);
  assert.match(originalTextFor("Recital D", motion) ?? "", /^D\. considerando/);
  assert.match(originalTextFor("Citation 7", motion) ?? "", /^vista la decisione/);
  assert.equal(originalTextFor("After § 1", motion), null); // a new paragraph — nothing to quote
  assert.equal(originalTextFor("§ 99", motion), null);
});

test("the official list keeps its version label, original-text rows and footer notes", async () => {
  const vl = await parseIndicativeVotingList(fixture("official-vl-halicki-A10-0224-2026.docx"));
  assert.equal(vl.version, "FINAL VERSION");
  assert.equal(vl.reportCode, "A10-0224/2026");
  assert.equal(vl.rows.length, 18);
  const original = vl.rows.filter((r) => r.author === "original text");
  assert.deepEqual(original.map((r) => r.subject), ["§ 2", "§ 4", "§ 10", "Citation 6", "Citation 7"]);
  assert.equal(vl.rows.filter((r) => r.voteType === "RCV").length, 12);
  assert.equal(vl.notes[0], "Ams 2 and 14 were cancelled due to technical reasons");
  assert.equal(vl.notes.length, 6);
});
