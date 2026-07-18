import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractSplitSeparate, splitSeparateToCsv, type CapturedVot } from "./splitSeparate.ts";

const vot = (name: string): CapturedVot =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), "utf8"));

test("extracts a 4-part split with verbatim boundaries (Uganda fixture)", () => {
  const rows = extractSplitSeparate(vot("vot-2026-02-12-item-6.1-uganda.json"));
  const splits = rows.filter((r) => r.type === "split");
  assert.equal(splits.length, 4);
  assert.equal(splits[0].subject, "§ 5");
  assert.equal(splits[0].partLabel, "First part");
  assert.match(splits[0].boundary ?? "", /review cooperation/);
  // roll-call requests are flattened too
  assert.ok(rows.some((r) => r.type === "rcv" && /Amendment 1/.test(r.subject)));
});

test("extracts separate + split votes (anti-poverty fixture)", () => {
  const rows = extractSplitSeparate(vot("vot-2026-02-12-item-6.5-anti-poverty.json"));
  const separates = rows.filter((r) => r.type === "separate");
  assert.deepEqual(separates.map((r) => r.subject), ["§ 2", "§ 16", "§ 17", "§ 64", "§ 65"]);
  const splits = rows.filter((r) => r.type === "split");
  assert.equal(splits.length, 8); // 4 subjects × 2 parts
});

test("CSV escapes commas and quotes in boundary text", () => {
  const rows = extractSplitSeparate(vot("vot-2026-02-12-item-6.5-anti-poverty.json"));
  const csv = splitSeparateToCsv(rows);
  const [header] = csv.split("\n");
  assert.equal(header, "Type,Subject,Group,Part,Boundary");
  // a boundary containing a comma must be quoted
  assert.match(csv, /"Text as a whole without the words: 'undocumented persons, migrants,'"/);
});
