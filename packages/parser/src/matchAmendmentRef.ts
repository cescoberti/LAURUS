import type { ParsedAmendment, RefResolution } from "./types.ts";

/**
 * Deterministic resolver for Feature 4 (Remarks auto-fill), Italian prototype.
 *
 * Given a voting-list row `subject` and the set of parsed amendments for the
 * same item, decide whether the row references a concrete amendment whose text
 * can be placed in the Remarks column — or flag it as an anomaly.
 *
 * NON-NEGOTIABLE: this is pure regex + number normalisation. It never invents
 * text and never guesses. Anything it cannot resolve deterministically becomes
 * an anomaly for the human-review report. An LLM may only be used, elsewhere,
 * as a second-level fallback for anomalous layouts with a confidence score.
 */

// Matches "Am 72", "Am. 72", "Em 15", "Em. 15", "Emendamento 3", "Emend. 3",
// optionally followed by a letter suffix (e.g. "72 S" is handled by callers).
const AMENDMENT_RE = /\b(?:am|em|emend|emendamento)\.?\s*(\d+)\b/i;

// Rows that reference a paragraph / recital / article rather than an amendment.
const PARAGRAPH_RE = /(?:^|\s)(?:§|(?:par\.?|paragrafo|considerando|articolo|art\.?)\b)/i;

// Textual markers for special amendment kinds.
const ORAL_RE = /\b(?:orale|oral)\b/i;
const CAM_RE = /\b(?:cam|compromesso|comprom-?)\b/i;

/** Parse the amendment number out of a subject string, or null. */
export function parseAmendmentNumber(subject: string): number | null {
  const m = AMENDMENT_RE.exec(subject);
  return m ? Number(m[1]) : null;
}

export function resolveRef(
  subject: string,
  amendmentsByNumber: Map<number, ParsedAmendment>,
): RefResolution {
  // Special kinds are recognised from the subject text itself first.
  if (ORAL_RE.test(subject)) return { status: "anomaly", reason: "oral" };
  if (CAM_RE.test(subject)) return { status: "anomaly", reason: "compromise_cam" };

  const number = parseAmendmentNumber(subject);
  if (number === null) {
    // No amendment number: is it a paragraph/recital reference, or just noise?
    return {
      status: "anomaly",
      reason: PARAGRAPH_RE.test(subject) ? "paragraph_ref" : "unresolvable",
    };
  }

  const am = amendmentsByNumber.get(number);
  if (!am) return { status: "anomaly", reason: "not_found" };
  if (am.kind === "withdrawn") return { status: "anomaly", reason: "withdrawn" };
  if (am.kind === "oral") return { status: "anomaly", reason: "oral" };
  if (am.kind === "compromise_cam") return { status: "anomaly", reason: "compromise_cam" };

  return { status: "auto", amendmentNumber: number };
}

/** Build the lookup a caller passes to `resolveRef`. */
export function indexAmendments(amendments: ParsedAmendment[]): Map<number, ParsedAmendment> {
  const map = new Map<number, ParsedAmendment>();
  for (const a of amendments) map.set(a.number, a);
  return map;
}
