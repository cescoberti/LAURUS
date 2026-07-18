import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAmendmentsDocx } from "./amendmentsDocx.ts";
import { consolidateAmendments } from "./consolidate.ts";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));

// Real EP report DOCX: A10-0064/2026, AFCO amendment of the Rules of Procedure.
// Captured 2026-07-14 via the API distribution path (redmap CDN, not bot-gated).

test("parses every amendment block with number, target and both columns", async () => {
  const ams = await parseAmendmentsDocx(fixture("rep-A-10-2026-0064-en.docx"), "en");

  assert.equal(ams.length, 3);
  assert.deepEqual(ams.map((a) => a.number), [1, 2, 3]);

  const first = ams[0];
  assert.equal(first.language, "en");
  assert.equal(first.kind, "standard");
  assert.equal(first.target, "Rule 135 – title");
  assert.equal(first.tabledBy, "Parliament's Rules of Procedure");
  // Left column = present text, right column = amendment; kept verbatim.
  assert.match(first.originalText ?? "", /economic governance/);
  assert.match(first.amendedText ?? "", /Union agencies and/);
});

test("an insertion has empty original text and populated amended text", async () => {
  const ams = await parseAmendmentsDocx(fixture("rep-A-10-2026-0064-en.docx"), "en");
  const inserted = ams.find((a) => a.number === 3)!;
  assert.equal(inserted.target, "Rule 135 – paragraph 1 a (new)");
  assert.ok(!inserted.originalText, "new-paragraph insertion has no present text");
  assert.match(inserted.amendedText ?? "", /committee responsible/);
});

test("never fabricates: header labels are not emitted as content", async () => {
  const ams = await parseAmendmentsDocx(fixture("rep-A-10-2026-0064-en.docx"), "en");
  for (const a of ams) {
    assert.doesNotMatch(a.originalText ?? "", /^Present text$/);
    assert.doesNotMatch(a.amendedText ?? "", /^Amendment$/);
  }
});

test("consolidates EN + IT of the same report by amendment number", async () => {
  const [en, it] = await Promise.all([
    parseAmendmentsDocx(fixture("rep-A-10-2026-0064-en.docx"), "en"),
    parseAmendmentsDocx(fixture("rep-A-10-2026-0064-it.docx"), "it"),
  ]);
  const consolidated = consolidateAmendments({ en, it });

  assert.equal(consolidated.length, 3);
  const one = consolidated[0];
  assert.deepEqual(one.languages, ["en", "it"]);
  assert.equal(one.target.en, "Rule 135 – title");
  assert.equal(one.target.it, "Articolo 135 – titolo");
  assert.match(one.amendedText.it ?? "", /agenzie e agli organismi dell'Unione/);
});
