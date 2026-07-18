// Client- and server-safe barrel: pure functions only, no heavy Node deps.
// The DOCX parser (which pulls in `mammoth`) is intentionally NOT re-exported
// here — import it from "@laurus/parser/amendments-docx" in server/ingest code
// only, so it never lands in the browser bundle.
export * from "./types.ts";
export * from "./matchAmendmentRef.ts";
export * from "./votingList.ts";
export * from "./consolidate.ts";
export * from "./splitSeparate.ts";
export * from "./remarksDiff.ts";
