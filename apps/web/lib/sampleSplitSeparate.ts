/**
 * Split & Separate export demo data.
 *
 * This is a REAL captured EP "Results of votes" extract (item 6.1, Uganda,
 * PV-10-2026-02-12-VOT_EN.html — the same fixture committed under
 * packages/parser/fixtures/), run through the production @laurus/parser split
 * extractor. It is shown as a demo because live VOT ingestion (versioning +
 * polling) lands in M3; the extraction and CSV export below are the real M2
 * code path, not a mock-up.
 */
import {
  extractSplitSeparate,
  splitSeparateToCsv,
  type CapturedVot,
  type SplitSeparateRow,
} from "@laurus/parser";

export const sampleVot: CapturedVot = {
  source_url: "https://www.europarl.europa.eu/doceo/document/PV-10-2026-02-12-VOT_EN.html",
  item_label: "6.1 Post-election situation in Uganda and threats against opposition leader Bobi Wine",
  requestsForSplitVotes: [
    {
      group: "ECR, PfE",
      subject: "§ 5",
      parts: [
        { index: 1, label: "First part", boundary: "'Calls for the EU and its Member States to review cooperation with and assistance for Uganda to ensu[re…]'" },
        { index: 2, label: "Second part", boundary: "'ensure respect for EU principles,'" },
        { index: 3, label: "Third part", boundary: "'implement targeted sanctions, and prioritise support for civil society, human rights and LGBTIQ+ de[fenders…]'" },
        { index: 4, label: "Fourth part", boundary: "'and LGBTQI+'" },
      ],
    },
  ],
  requestsForRollCallVotes: [
    { group: "ESN", targets: ["Amendment 1"] },
    { group: "Renew", targets: ["final vote"] },
    { group: "PfE", targets: ["§ 5 (2nd part)"] },
  ],
};

export const sampleSplitSeparateRows: SplitSeparateRow[] = extractSplitSeparate(sampleVot);
export const sampleSplitSeparateCsv: string = splitSeparateToCsv(sampleSplitSeparateRows);
