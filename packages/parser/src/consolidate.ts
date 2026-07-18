import type { ParsedAmendment } from "./types.ts";

/**
 * One amendment consolidated across the languages it was parsed in. The number
 * is the join key (stable across the 24 EP language versions of a report);
 * per-language fields hold the localised text/target.
 */
export interface ConsolidatedAmendment {
  number: number;
  kind: ParsedAmendment["kind"];
  /** Languages this amendment was found in, in insertion order. */
  languages: string[];
  target: Record<string, string>;
  originalText: Record<string, string>;
  amendedText: Record<string, string>;
  tabledBy?: string;
}

/**
 * Merge parsed amendments from several language versions of the same report
 * into one record per amendment number. Input is a map (or entries) of
 * language → parsed amendments for that language.
 */
export function consolidateAmendments(
  byLanguage: Record<string, ParsedAmendment[]> | Array<[string, ParsedAmendment[]]>,
): ConsolidatedAmendment[] {
  const entries = Array.isArray(byLanguage) ? byLanguage : Object.entries(byLanguage);
  const map = new Map<number, ConsolidatedAmendment>();

  for (const [language, amendments] of entries) {
    for (const a of amendments) {
      let c = map.get(a.number);
      if (!c) {
        c = {
          number: a.number,
          kind: a.kind,
          languages: [],
          target: {},
          originalText: {},
          amendedText: {},
          tabledBy: a.tabledBy,
        };
        map.set(a.number, c);
      }
      if (!c.languages.includes(language)) c.languages.push(language);
      // A non-standard kind seen in any language wins (e.g. withdrawn/oral).
      if (c.kind === "standard" && a.kind !== "standard") c.kind = a.kind;
      if (a.target) c.target[language] = a.target;
      if (a.originalText) c.originalText[language] = a.originalText;
      if (a.amendedText) c.amendedText[language] = a.amendedText;
      if (!c.tabledBy && a.tabledBy) c.tabledBy = a.tabledBy;
    }
  }

  return [...map.values()].sort((x, y) => x.number - y.number);
}
