import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRequestsFromNotes } from "./indicativeVotingList.ts";

// Footer of the official list for A10-0218/2026 (PETROV, EMPL), FINAL VERSION.
const NOTES = [
  "Requests for roll-call votes",
  "Greens/ EFA: am 2",
  "S&D: am 3 and 11, § 74, 75 and 83",
  "Requests for separate votes",
  "Renew: § 15",
  "EPP: § 15 and 33",
  "Requests for split votes",
  "EPP",
  "§ 54",
  "1st part: Text as a whole excluding the words “of all kinds”",
  "2nd part: These words",
  "§ 83",
  "1st part: Text as a whole excluding the words “fairly remunerated,” and “emphasises that unpaid … labour market policies,”",
  "2nd part: “fairly remunerated”",
  "3rd part: “emphasises that unpaid … labour market policies,”",
  "S&D",
  "am 3",
  "1st part: Text as a whole excluding the words “by 2030”",
  "2nd part: These words",
];

test("reads the split requests printed under an official list", () => {
  const reqs = splitRequestsFromNotes(NOTES);
  assert.deepEqual(reqs.map((r) => [r.group, r.subject, r.parts.length]), [
    ["EPP", "§ 54", 2],
    ["EPP", "§ 83", 3],
    ["S&D", "am 3", 2],
  ]);
  assert.equal(reqs[0]!.parts[0]!.text, "Text as a whole excluding the words “of all kinds”");
  assert.equal(reqs[1]!.parts[2]!.section, "3");
});

test("no split section → no requests", () => {
  assert.deepEqual(splitRequestsFromNotes(NOTES.slice(0, 6)), []);
});
