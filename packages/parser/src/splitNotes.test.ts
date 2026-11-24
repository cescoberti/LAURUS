import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSecondReading,
  splitRequestFor,
  splitRequestsFromNotes,
  subjectKey,
  votingSchemeFromNotes,
} from "./indicativeVotingList.ts";

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

/** A row as the table gives it, with only the fields the matcher reads. */
const row = (subject: string, amNo: string | null, parts = 2) => ({
  subject,
  amNo,
  splitParts: Array.from({ length: parts }, (_, i) => ({ label: String(i + 1), vote: "", remarks: "" })),
});
const req = (group: string, subject: string, ...parts: string[]) => ({
  group,
  subject,
  parts: parts.map((text, i) => ({ section: String(i + 1), text })),
});

test("the footer names the amendment, the table names what it amends", () => {
  // A10-0216/2026: the row is "Article 9, § 4", the request "Am 68".
  const requests = [req("PfE", "Am 68", "Text as a whole excluding the words “in writing”", "These words")];
  assert.equal(splitRequestFor(row("Article 9, § 4", "68"), requests), requests[0]);
  // A10-0201/2026: the subject cell carries only the block heading.
  assert.equal(
    splitRequestFor(row("Amendments by the committee responsible -separate and split votes", "7"), [
      req("S&D", "Am 7", "a", "b"),
    ])?.subject,
    "Am 7",
  );
});

test("one subject, two rows: each goes to its own amendment", () => {
  // A10-0199/2026 votes § 80 twice — the text itself, and ESN's am 51 on it.
  const requests = [req("EPP", "§ 80", "Text as a whole excluding the words “X”", "These words"), req("ESN", "am 51", "p", "q")];
  assert.equal(splitRequestFor(row("§ 80", "§"), requests)?.group, "EPP");
  assert.equal(splitRequestFor(row("§ 80", "51"), requests)?.group, "ESN");
});

test("the same cut asked by three groups is one vote, a different cut is not", () => {
  // A10-0201/2026: S&D, ECR and EPP all asked for the same division of am 83,
  // and the list votes it on the row that carries amendment 83's first part.
  const same = ["Text as a whole excluding the line: “2905 11 00”", "This line"];
  const requests = [req("S&D", "Am 83", ...same), req("ECR", "Am 83", ...same), req("EPP", "Am 83", ...same)];
  assert.equal(splitRequestFor(row("Annex I, point 2, table on ‘Iron and steel’", "83cp1"), requests)?.group, "S&D");

  // Two groups cutting the same amendment differently is the Tabling
  // Service's call to merge, and without a scheme there is no answer.
  const differ = [req("S&D", "Am 83", ...same), req("ECR", "Am 83", "Text as a whole excluding the words “methanol”", "Those words")];
  assert.equal(splitRequestFor(row("Annex I", "83"), differ), null);
});

test("a subject the footer writes shorter, only when the parts agree", () => {
  // A10-0257/2026: "Article 2, point 12" under the table, "Article 2, § 1,
  // point 12" in it.
  const requests = [req("EPP", "Article 2, point 12", "Text as a whole excluding the words “or service”", "These words")];
  assert.equal(splitRequestFor(row("Article 2, § 1, point 12", "§", 2), requests), requests[0]);
  // Three parts on the list against two requested: not this request.
  assert.equal(splitRequestFor(row("Article 2, § 1, point 12", "§", 3), requests), null);
});

test("a row whose request is not there gets nothing, not the nearest thing", () => {
  const requests = [req("EPP", "§ 27", "a", "b"), req("EPP", "Recital BK", "a", "b")];
  assert.equal(splitRequestFor(row("§ 28", "§"), requests), null);
  assert.equal(splitRequestFor(row("After § 110", "25"), requests), null);
});
