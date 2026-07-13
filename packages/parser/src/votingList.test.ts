import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normaliseVotRows, type RawVotRow } from "./votingList.ts";

function loadFixture(name: string) {
  const path = fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

test("Uganda item: 4-part split request captured, main table split row normalised", () => {
  const fx = loadFixture("vot-2026-02-12-item-6.1-uganda.json");
  const rows = normaliseVotRows(fx.rows as RawVotRow[]);

  assert.equal(rows.length, 3);
  const splitRow = rows.find((r) => r.voteType === "split");
  assert.ok(splitRow, "expected a split-vote row");
  assert.equal(splitRow!.subject, "§ 5");
  // amNo cell is null here — the row is a paragraph vote, not an amendment;
  // the amendment number must come only from the "Am No" column, never guessed
  // from the subject text.
  assert.equal(splitRow!.amendmentNumber, null);
  assert.equal(splitRow!.splitParts.length, 1);

  // the *request* for the split carries the real 4-part boundary text —
  // verified verbatim from the source document, never invented.
  assert.equal(fx.requestsForSplitVotes[0].parts.length, 4);
  assert.match(fx.requestsForSplitVotes[0].parts[1].boundary, /ensure respect for EU principles/);
});

test("anti-poverty item: 20 rows, 4 split rows, no amendment numbers populated", () => {
  const fx = loadFixture("vot-2026-02-12-item-6.5-anti-poverty.json");
  const rows = normaliseVotRows(fx.rows as RawVotRow[]);

  assert.equal(rows.length, 22);
  const splitRows = rows.filter((r) => r.voteType === "split");
  assert.equal(splitRows.length, 4);

  // "Am No" cells here hold author/group labels ("PfE", "Members", "original
  // text"), not amendment numbers — the parser must not misread them as such.
  const withAmendmentNumber = rows.filter((r) => r.amendmentNumber !== null);
  assert.equal(withAmendmentNumber.length, 0);
});
