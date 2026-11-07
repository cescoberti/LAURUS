import { test } from "node:test";
import assert from "node:assert/strict";
import { reportCodeToWorkId, reportRefsFromWork, type EpWork } from "./tabledReportApi.ts";

// Two payloads as data.europarl.europa.eu/api/v2/plenary-documents/{id} returned
// them on 27/10/2026, cut to the fields the mapper reads (the 24 title languages
// are trimmed to two, one of which — `it` carrying the English text — is a real
// quirk of this record). A10-0277 is a joint AFET/DEVE report whose two
// co-rapporteurs are NOT in precedence order in the payload.
const JOINT: EpWork = {
  label: "A10-0277/2026",
  identifier: "A-10-2026-0277",
  document_date: "2026-10-20",
  title_dcterms: {
    en: "REPORT on the proposal for a regulation of the European Parliament and of the Council establishing Global Europe",
  },
  creator: ["org/AFET", "person/2341", "org/DEVE", "person/197498"],
  workHadParticipation: [
    { had_participant_organization: ["org/AFET"], participation_role: "def/ep-roles/AUTHOR" },
    {
      had_participant_person: ["person/197498"],
      participation_in_name_of: "org/DEVE",
      participation_role: "def/ep-roles/RAPPORTEUR_CO",
      precedenceOrder: 402,
    },
    { had_participant_organization: ["org/DEVE"], participation_role: "def/ep-roles/AUTHOR" },
    {
      had_participant_person: ["person/2341"],
      participation_in_name_of: "org/AFET",
      participation_role: "def/ep-roles/RAPPORTEUR_CO",
      precedenceOrder: 101,
    },
  ],
  is_realized_by: [
    {
      title_alternative: {
        en: "REPORT - on the proposal for a regulation of the European Parliament and of the Council establishing Global Europe - (COM(2025)0551 - C10-0175/2025 - 2025/0227(COD)) - Committee on Foreign Affairs - Committee on Development - Rapporteurs: Michael Gahler, Robert Biedroń",
      },
    },
  ],
};

const SINGLE: EpWork = {
  label: "A10-0276/2026",
  identifier: "A-10-2026-0276",
  document_date: "2026-10-19",
  title_dcterms: {
    it: "REPORT on the proposal for a regulation of the European Parliament and of the Council amending Directive 2003/87/EC as regards revised benchmark values for the heat and fuel benchmarks for the period from 2026 to 2030",
    en: "REPORT on the proposal for a regulation of the European Parliament and of the Council amending Directive 2003/87/EC as regards revised benchmark values for the heat and fuel benchmarks for the period from 2026 to 2030",
  },
  creator: ["org/ENVI", "person/197517"],
  workHadParticipation: [
    {
      had_participant_person: ["person/197517"],
      participation_in_name_of: "org/ENVI",
      participation_role: "def/ep-roles/RAPPORTEUR",
      precedenceOrder: 1101,
    },
    { had_participant_organization: ["org/ENVI"], participation_role: "def/ep-roles/AUTHOR" },
  ],
  is_realized_by: [
    {
      title_alternative: {
        en: "REPORT - … - (COM(2026)0619 - C10-0189/2026 - 2026/0211(COD)) - Committee on the Environment, Climate and Food Safety - Rapporteur: Adam Jarubas",
      },
    },
  ],
};

test("the document code becomes the id the API answers to", () => {
  assert.equal(reportCodeToWorkId("A10-0277/2026"), "A-10-2026-0277");
  assert.equal(reportCodeToWorkId("A10-0001/2026"), "A-10-2026-0001");
  assert.equal(reportCodeToWorkId(" A9-0150/2023 "), "A-9-2023-0150");
  assert.equal(reportCodeToWorkId("B10-0390"), null);
  assert.equal(reportCodeToWorkId("not a code"), null);
});

test("a joint report gives both co-rapporteurs in precedence order", () => {
  const r = reportRefsFromWork(JOINT);
  assert.ok(r);
  assert.equal(r.code, "A10-0277/2026");
  // 101 (AFET) before 402 (DEVE), which is not the payload's own order.
  assert.deepEqual(r.rapporteurIds, ["person/2341", "person/197498"]);
  assert.deepEqual(r.committees, ["AFET", "DEVE"]);
  assert.equal(r.procedureRef, "2025/0227(COD)");
  assert.equal(r.tabledOn, "2026-10-20");
  assert.match(r.title, /^REPORT on the proposal/);
});

test("a single-committee report gives one rapporteur and one committee", () => {
  const r = reportRefsFromWork(SINGLE);
  assert.ok(r);
  assert.deepEqual(r.rapporteurIds, ["person/197517"]);
  assert.deepEqual(r.committees, ["ENVI"]);
  assert.equal(r.procedureRef, "2026/0211(COD)");
  assert.equal(r.tabledOn, "2026-10-19");
});

test("only the lead roles count as rapporteurs", () => {
  const r = reportRefsFromWork({
    ...SINGLE,
    workHadParticipation: [
      ...SINGLE.workHadParticipation!,
      {
        had_participant_person: ["person/999999"],
        participation_role: "def/ep-roles/RAPPORTEUR_OPINION",
        precedenceOrder: 1,
      },
      { had_participant_person: ["person/888888"], participation_role: "def/ep-roles/RAPPORTEUR_SHADOW" },
    ],
  });
  assert.deepEqual(r?.rapporteurIds, ["person/197517"]);
});

test("the publisher and a delegation are not responsible committees", () => {
  const r = reportRefsFromWork({
    ...SINGLE,
    workHadParticipation: [
      { had_participant_organization: ["org/EU_PARLIAMENT"], participation_role: "def/ep-roles/AUTHOR" },
      { had_participant_organization: ["org/1558"], participation_role: "def/ep-roles/AUTHOR" },
      { had_participant_organization: ["org/ENVI"], participation_role: "def/ep-roles/AUTHOR" },
    ],
  });
  assert.deepEqual(r?.committees, ["ENVI"]);
});

test("a payload with no document code is refused rather than guessed at", () => {
  assert.equal(reportRefsFromWork({ identifier: "A-10-2026-0277" }), null);
  assert.equal(reportRefsFromWork({ label: "PE784.222" }), null);
});
