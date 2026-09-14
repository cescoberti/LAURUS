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

// Committee amendment block (no <Amend> tokens): A10-0230/2026, ENVI,
// "AMENDMENTS 001-006 by the Committee". Captured 2026-09-14 from
// distribution/reds_iPlRp_Amd.

test("parses a committee amendment block by paragraph style", async () => {
  const ams = await parseAmendmentsDocx(fixture("am-A-10-2026-0230-AM-001-006-en.docx"), "en");

  assert.deepEqual(ams.map((a) => a.number), [1, 2, 3, 4, 5, 6]);
  for (const a of ams) assert.equal(a.tabledBy, "Committee on the Environment, Climate and Food Safety");

  const first = ams[0];
  assert.equal(first.target, "Citation 5");
  assert.match(first.originalText ?? "", /^Having regard to the opinion of the Committee of the Regions/);
  assert.equal(first.amendedText, "After consulting the Committee of the Regions,");
  // Footnotes below the underscore separator are not amendment text.
  assert.doesNotMatch(first.originalText ?? "", /OJ C/);
  assert.doesNotMatch(first.originalText ?? "", /_____/);

  // Multi-level target: amending act + amended act, one line each.
  const fifth = ams[4];
  assert.equal(fifth.target, "Article 1 – paragraph 1 – Decision (EU) 2015/1814 – Article 5 – paragraph 2");
  assert.equal(fifth.amendedText, "deleted");
});

test("a consolidated-text block yields its single amendment with the full body", async () => {
  const ams = await parseAmendmentsDocx(fixture("am-A-10-2026-0197-AM-001-001-en.docx"), "en");
  assert.equal(ams.length, 1);
  assert.equal(ams[0].number, 1);
  assert.equal(ams[0].tabledBy, "Committee on Industry, Research and Energy");
  assert.match(ams[0].amendedText ?? "", /^Proposal for a COUNCIL REGULATION/);
  assert.match(ams[0].amendedText ?? "", /HAS ADOPTED THIS REGULATION/);
  assert.ok(!ams[0].originalText);
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
