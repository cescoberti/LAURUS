import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePdoj } from "./pdoj.ts";

// Verbatim from SYN_PDOJ_November I_BRU_EN.pdf — the final draft agenda for the
// sittings of 11-12/11/2026, published 22/10/26, as pypdf extracts it. Kept with
// its oddities: the double space where no procedure marker is printed, the note
// glued to a title without a space, and the file that has no number yet.
const PDOJ = [
  "FINAL DRAFT AGENDA Sittings of 11/11/2026 - 12/11/2026",
  "Published by the Plenary Sittings Directorate, 22/10/26 - 1",
  "15:00 - 20:00",
  "• Resumption of session and order of business",
  "• Commission statement - Commission Work Programme 2027",
  "À • ***I (A10-0271/2026) PAJÍN, VERYGA ENVI/SANT",
  "Union Civil Protection Mechanism and Union support for health emergency preparedness and response",
  "À • (A10-0261/2026) VASILE-VOICULESCU SANT",
  "Europe’s Beating Cancer Plan",
  "• One-minute speeches (Rule 179)",
  "11:00 - 13:00 VOTES followed by explanations of votes",
  "À •  (A10-0270/2026) WOLTERS JURI",
  "Amendments to the Statute for Members of the European Parliament, as regards proxy voting",
  "À • ***I (A9-0160/2024) YON-COURTIN ECON",
  "Modernisation of the key information document",
  "À • ***I (A10-0093/2026) CLERGEAU ENVI",
  "European Chemicals Agency and amending regulations(Vote: 29/04/2026)",
  "À • * (A10-0275/2026) ANDREWS DEVE",
  "Association of the overseas countries and territories with the EU including EU/Greenland/Denmark relations",
  "À •  (A10-0269/2026) DE MEO AGRI",
  "EU agri-food promotion policy",
  "À •  (A10-/) KEFALOGIANNIS AFCO",
  "Institutional aspects of artificial intelligence in the context of European integration",
  "À •  (A10-0268/2026) STAĶIS SEDE",
  "From prototypes to capabilities – enabling new defence actors to scale up",
].join("\n");

test("reads every file entry and skips the statements and debates around them", () => {
  const entries = parsePdoj(PDOJ);
  assert.equal(entries.length, 9);
  assert.deepEqual(
    entries.map((e) => e.code),
    [
      "A10-0271/2026",
      "A10-0261/2026",
      "A10-0270/2026",
      "A9-0160/2024",
      "A10-0093/2026",
      "A10-0275/2026",
      "A10-0269/2026",
      null, // "(A10-/)" — tabled, not yet numbered
      "A10-0268/2026",
    ],
  );
});

test("tells joint committees apart from a hyphenated surname", () => {
  const byCode = new Map(parsePdoj(PDOJ).map((e) => [e.code, e]));
  // Two rapporteurs, two committees.
  assert.deepEqual(byCode.get("A10-0271/2026")?.rapporteurs, ["PAJÍN", "VERYGA"]);
  assert.deepEqual(byCode.get("A10-0271/2026")?.committees, ["ENVI", "SANT"]);
  // A hyphen is part of the name, not a separator.
  assert.deepEqual(byCode.get("A10-0261/2026")?.rapporteurs, ["VASILE-VOICULESCU"]);
  assert.deepEqual(byCode.get("A10-0261/2026")?.committees, ["SANT"]);
  // A surname can be two words and must not become two rapporteurs.
  assert.deepEqual(byCode.get("A10-0269/2026")?.rapporteurs, ["DE MEO"]);
  assert.deepEqual(byCode.get("A10-0269/2026")?.committees, ["AGRI"]);
});

test("keeps the diacritics the EP prints", () => {
  const byCode = new Map(parsePdoj(PDOJ).map((e) => [e.code, e]));
  assert.deepEqual(byCode.get("A10-0268/2026")?.rapporteurs, ["STAĶIS"]);
});

test("reads the procedure marker and the deadline flag", () => {
  const byCode = new Map(parsePdoj(PDOJ).map((e) => [e.code, e]));
  assert.equal(byCode.get("A10-0271/2026")?.procedure, "***I");
  assert.equal(byCode.get("A10-0275/2026")?.procedure, "*");
  // Printed with no marker at all, which is how a non-legislative file appears.
  assert.equal(byCode.get("A10-0270/2026")?.procedure, null);
  assert.equal(byCode.get("A10-0270/2026")?.deadline, true);
});

test("takes the title from the line under the entry, note and all", () => {
  const byCode = new Map(parsePdoj(PDOJ).map((e) => [e.code, e]));
  assert.equal(byCode.get("A10-0261/2026")?.title, "Europe’s Beating Cancer Plan");
  assert.equal(
    byCode.get("A10-0093/2026")?.title,
    "European Chemicals Agency and amending regulations(Vote: 29/04/2026)",
  );
});

test("an agenda with no file entries yields nothing, not a crash", () => {
  assert.deepEqual(parsePdoj("• Resumption of session\n• One-minute speeches (Rule 179)\n"), []);
});
