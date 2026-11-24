import { test } from "node:test";
import assert from "node:assert/strict";
import { isSecondReading, splitRequestsFromNotes, subjectKey, votingSchemeFromNotes } from "./indicativeVotingList.ts";

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

/**
 * Footer of the official list for A10-0297/2026 (MONTSERRAT, SANT), FINAL
 * VERSION — a recommendation for second reading. Two things here broke the
 * expansion: the subjects are articles of the Council position, which the
 * reader took for group names, and two groups asked to cut the same point in
 * different places, so neither request matches the three-part row. Only the
 * voting scheme does.
 */
const SECOND_READING = [
  "N.B. There is no final vote in second reading.",
  "Majority of Parliament’s component Members is required to amend the Council position.",
  "<i><u>Requests for roll-call votes</u></i>",
  "ESN:\tArticle 180, § 4",
  "<i><u>Requests for split votes</u></i>",
  "<b>ECR</b>",
  "Article 5, § 1, point 31",
  "<i>1st part:</i>\t\t“’vaccine’ means a medicinal product that is intended to elicit an immune response for the prevention, including post-exposure prophylaxis,”",
  "<i>2nd part:</i>\t\t“and treatment of diseases caused by an infectious agent”",
  "Article 5, § 1, point 32, introductory part",
  "<i>1st part:</i>\t\tText as a whole excluding the words “other than a vaccine against infectious diseases”",
  "<i>2nd part:</i>\t\tthese words",
  "<b>ESN</b>",
  "Article 5, § 1, point 31",
  "<i>1st part:</i>\t\tText as a whole excluding the words “and treatment of diseases”",
  "<i>2nd part:</i>\t\tthese words <b><i>[ROLL-CALL VOTE]</i></b>",
  "<b><u>Voting scheme</u></b>",
  "Article 5, § 1, point 31",
  "<i>1st part:</i>\t\t“’vaccine’ means a medicinal product that is intended to elicit an immune response for the prevention, including post-exposure prophylaxis,”",
  "<i>2nd part:</i>\t\t“and treatment of diseases” <b><i>[ROLL-CALL VOTE]</i></b>",
  "<i>3rd part:</i>\t\t“caused by an infectious agent”",
];

test("an article of the Council position is a subject, not a group", () => {
  const reqs = splitRequestsFromNotes(SECOND_READING);
  assert.deepEqual(reqs.map((r) => [r.group, r.subject, r.parts.length]), [
    ["ECR", "Article 5, § 1, point 31", 2],
    ["ECR", "Article 5, § 1, point 32, introductory part", 2],
    ["ESN", "Article 5, § 1, point 31", 2],
  ]);
});

test("the voting scheme is read on its own, and the requests stop at it", () => {
  const scheme = votingSchemeFromNotes(SECOND_READING);
  assert.deepEqual(scheme.map((r) => [r.subject, r.parts.length]), [["Article 5, § 1, point 31", 3]]);
  assert.equal(scheme[0]!.parts[1]!.text, "“and treatment of diseases” [ROLL-CALL VOTE]");
  // The scheme's own lines must not be read a second time as requests.
  assert.equal(splitRequestsFromNotes(SECOND_READING).length, 3);
});

test("no voting scheme printed, nothing read", () => {
  assert.deepEqual(votingSchemeFromNotes(NOTES), []);
});

test("the table's abbreviation and the footer's full words are one subject", () => {
  assert.equal(
    subjectKey("Article 5, § 1, point 32, intro"),
    subjectKey("Article 5, § 1, point 32, introductory part"),
  );
  assert.equal(subjectKey("§ 54"), subjectKey("Paragraph 54"));
  assert.notEqual(subjectKey("Article 5, § 1, point 31"), subjectKey("Article 5, § 1, point 32"));
});

test("a second reading is read from the marker, or from the Service's own note", () => {
  assert.equal(isSecondReading({ procedureType: "[***II]", notes: [] }), true);
  assert.equal(isSecondReading({ procedureType: null, notes: SECOND_READING }), true);
  assert.equal(isSecondReading({ procedureType: "[init.]", notes: NOTES }), false);
});
