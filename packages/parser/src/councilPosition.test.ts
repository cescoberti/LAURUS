import { test } from "node:test";
import assert from "node:assert/strict";
import {
  articleTextFor,
  councilPositionRef,
  councilPositionUrl,
  parseCouncilPosition,
} from "./councilPosition.ts";

test("the Council document is read off the report's own reference line", () => {
  const ref = councilPositionRef(
    "<DocRef>(07106/2/2026– C10‑0244/2026 – 2023/0132(COD))</DocRef>\nRapporteur: Dolors Montserrat",
  );
  assert.deepEqual(ref, { number: 7106, revision: 2, year: 2026 });
  assert.equal(
    councilPositionUrl(ref!, "it"),
    "https://data.consilium.europa.eu/doc/document/ST-7106-2026-REV-2/it/pdf",
  );
});

test("an unrevised position is the INIT version, and a procedure file is not a position", () => {
  const ref = councilPositionRef("(15311/2025 – C10-0012/2026 – 2024/0021(COD))");
  assert.deepEqual(ref, { number: 15311, revision: null, year: 2025 });
  assert.equal(councilPositionUrl(ref!, "en"), "https://data.consilium.europa.eu/doc/document/ST-15311-2025-INIT/en/pdf");
  // No C-number after it: that is the interinstitutional file, not a document.
  assert.equal(councilPositionRef("on the proposal (2023/0132(COD)) as amended"), null);
});

/**
 * Two pages of 7106/2/26 REV 2 (Union code relating to medicinal products),
 * as a PDF text extractor gives them: the Council stamp and the language code
 * at the HEAD of each page, because the page furniture is drawn first, and a
 * footnote at the foot. Indentation is gone — the nesting has to come out of
 * the numbering alone.
 */
const PAGES_EN = [
  [
    "7106/2/26 REV 2 105",
    "EN",
    "Article 5",
    "Definitions",
    "1. For the purposes of this Directive, the following definitions apply:",
    "(30) ‘immunological medicinal product’ means:",
    "(a) a vaccine, allergen medicinal product or other medicinal product eliciting an",
    "active and specific immune response;",
    "(b) a medicinal product consisting of toxins, serums, polyclonal or monoclonal",
    "antibodies or other immunoglobulins;",
    "(31) ‘vaccine’ means a medicinal product that is intended to elicit an immune response for",
    "the prevention, including post-exposure prophylaxis, and treatment of diseases",
    "caused by an infectious agent;",
    "46 Directive (EU) 2024/2853 of the European Parliament and of the Council",
    "of 23 October 2024 on liability for defective products.",
  ].join("\n"),
  [
    "7106/2/26 REV 2 106",
    "EN",
    "(32) ‘gene therapy medicinal product’ means a medicinal product, other than a vaccine",
    "against infectious diseases, that contains or consists of:",
    "(a) a substance or combination of substances intended to edit the host genome in a",
    "sequence-specific manner; or",
    "(b) a recombinant or synthetic nucleic acid used in or administered to human",
    "beings with a view to regulating a genetic sequence that mediates its effect by",
    "the long-lasting transcription of the transferred genetic materials;",
    "Article 180",
    "Restrictions on advertising of medicinal products",
    "1. Member States shall prohibit the advertising to the general public of medicinal products",
    "that:",
    "(a) are subject to medical prescription;",
    "2. Medicinal products may be advertised to the general public where they are intended for",
    "use without the intervention of a healthcare professional.",
    "3. Member States may prohibit, on their territory:",
    "(a) advertising to the general public of medicinal products the cost of which may be",
    "reimbursed;",
    "4. The prohibition contained in paragraph 1 shall not apply to campaigns promoting",
    "vaccination where those campaigns are carried out or approved by the Member States.",
  ].join("\n"),
];

test("the act is indexed by article, paragraph and point, across the page break", () => {
  const position = parseCouncilPosition(PAGES_EN);
  assert.deepEqual([...position.articles.keys()], ["5", "180"]);
  assert.deepEqual([...position.ambiguous], []);

  assert.equal(
    articleTextFor("Article 5, § 1, point 31", position),
    "‘vaccine’ means a medicinal product that is intended to elicit an immune response for the prevention, including post-exposure prophylaxis, and treatment of diseases caused by an infectious agent;",
  );
  assert.equal(
    articleTextFor("Article 180, § 4", position),
    "The prohibition contained in paragraph 1 shall not apply to campaigns promoting vaccination where those campaigns are carried out or approved by the Member States.",
  );
});

test("the chapeau is the point's own words, without the letters under it", () => {
  const position = parseCouncilPosition(PAGES_EN);
  const intro =
    "‘gene therapy medicinal product’ means a medicinal product, other than a vaccine against infectious diseases, that contains or consists of:";
  assert.equal(articleTextFor("Article 5, § 1, point 32, introductory part", position), intro);
  // The table abbreviates the same thing.
  assert.equal(articleTextFor("Article 5, § 1, point 32, intro", position), intro);
  assert.match(articleTextFor("Article 5, § 1, point 32", position)!, /^‘gene therapy.*transferred genetic materials;$/);
  assert.equal(
    articleTextFor("Article 5, § 1, point 32, point b", position),
    "a recombinant or synthetic nucleic acid used in or administered to human beings with a view to regulating a genetic sequence that mediates its effect by the long-lasting transcription of the transferred genetic materials;",
  );
});

test("the page stamp and the footnote are furniture, not text of the act", () => {
  const position = parseCouncilPosition(PAGES_EN);
  for (const subject of ["Article 5, § 1, point 31", "Article 180, § 4"]) {
    const text = articleTextFor(subject, position)!;
    assert.doesNotMatch(text, /7106|REV|Directive \(EU\) 2024\/2853/);
  }
});

test("what cannot be pinned down comes back null, never a guess", () => {
  const position = parseCouncilPosition(PAGES_EN);
  assert.equal(articleTextFor("Article 5, § 1, point 99", position), null);
  assert.equal(articleTextFor("Article 7, § 1", position), null);
  assert.equal(articleTextFor("§ 20", position), null);
  // An article printed twice is not resolved either.
  const twice = parseCouncilPosition([...PAGES_EN, "Article 5\nSomething else entirely"]);
  assert.deepEqual([...twice.ambiguous], ["5"]);
  assert.equal(articleTextFor("Article 5, § 1, point 31", twice), null);
});

/** The same two pages in Italian: the labels lose their opening bracket. */
const PAGES_IT = [
  [
    "7106/2/26 REV 2 105",
    "IT",
    "Articolo 5",
    "Definizioni",
    "1. Ai fini della presente direttiva si applicano le definizioni seguenti:",
    "31) \"vaccino\": un medicinale destinato a generare una risposta immunitaria per la",
    "prevenzione, compresa la profilassi in seguito ad esposizione, e il trattamento di",
    "malattie causate da un agente infettivo;",
    "32) \"medicinale di terapia genica\": un medicinale, diverso dai vaccini contro le malattie",
    "infettive, contenente o costituito da:",
    "a) una sostanza o un'associazione di sostanze destinata a modificare il genoma",
    "ospite in modo specifico per sequenza;",
    "b) un acido nucleico ricombinante o sintetico utilizzato negli esseri umani o",
    "somministrato a questi al fine di regolare una sequenza genetica;",
  ].join("\n"),
];

test("the Italian of the same act reads the same, bracket or no bracket", () => {
  const position = parseCouncilPosition(PAGES_IT);
  assert.equal(
    articleTextFor("Article 5, § 1, point 31", position),
    '"vaccino": un medicinale destinato a generare una risposta immunitaria per la prevenzione, compresa la profilassi in seguito ad esposizione, e il trattamento di malattie causate da un agente infettivo;',
  );
  assert.equal(
    articleTextFor("Article 5, § 1, point 32, intro", position),
    '"medicinale di terapia genica": un medicinale, diverso dai vaccini contro le malattie infettive, contenente o costituito da:',
  );
});
