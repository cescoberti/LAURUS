import type { AnnotatedVotingList } from "@laurus/parser/voting-list-docx";
import streit from "./streit.json";

/**
 * Annotated voting lists available for download, keyed by item code.
 *
 * For the first Italian test this holds the real STREIT (A10-0170/2026) list,
 * parsed from the Tabling Service DOCX with @laurus/parser and its Remarks
 * already carrying the published Italian amendment text. As VL ingestion lands
 * (M3), this map is replaced by a Supabase lookup of voting_list_rows.
 */
const REGISTRY: Record<string, AnnotatedVotingList> = {
  "A10-0170/2026": streit as AnnotatedVotingList,
};

export function getAnnotatedVl(code: string): AnnotatedVotingList | null {
  return REGISTRY[code] ?? null;
}

export function hasAnnotatedVl(code: string): boolean {
  return code in REGISTRY;
}
