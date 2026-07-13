export * from "./types.ts";
export * from "./matchAmendmentRef.ts";
export * from "./votingList.ts";

// Document parsers (DOCX two-column amendments, voting-list tables, split/separate
// extraction) land here in M2, once real fixtures are committed under
// packages/parser/fixtures/. They will use `mammoth`/`unpdf` and expose:
//   parseAmendmentsDocx(buf, language): ParsedAmendment[]
//   parseVotingList(buf, language): ParsedVotingListRow[]
// Kept out of this scaffold on purpose — no parser is written before a real
// fixture validates the table layout it targets.
