import type { AnnotatedVotingList, AnnotatedVlRow } from "@laurus/parser/voting-list-docx";
import { remarksFor } from "@laurus/parser";

/**
 * Fill the Remarks column of an indicative voting list with the published
 * amendment text (Feature 4 core).
 *
 * Deterministic and conservative, per the "never invent text" rule:
 *   - only rows whose "Am No" parses to a number are candidates;
 *   - an existing (advisor-written) Remark is NEVER overwritten;
 *   - a row with split parts gets the full amendment text on the parent row —
 *     the per-part boundaries are a human call (the VOT split requests only
 *     exist after the deadline), so parts are left for the advisor;
 *   - anything unresolved is reported as an anomaly, not guessed.
 */

export interface AmendmentText {
  number: number;
  amendedText?: string;
  originalText?: string;
  kind: string;
}

export interface FillReport {
  filled: number;
  candidates: number;
  anomalies: Array<{ subject: string; amNo: string | null; reason: "not_found" | "no_text" | "oral" | "withdrawn" | "compromise_cam" }>;
}

function amendmentNumber(row: AnnotatedVlRow): number | null {
  const m = /(\d+)/.exec(row.amNo ?? "");
  return m ? Number(m[1]) : null;
}

export function fillRemarks(
  vl: AnnotatedVotingList,
  amendments: Map<number, AmendmentText>,
): { vl: AnnotatedVotingList; report: FillReport } {
  const report: FillReport = { filled: 0, candidates: 0, anomalies: [] };

  const rows = vl.rows.map((row): AnnotatedVlRow => {
    if (row.isFinalVote) return row;
    const n = amendmentNumber(row);
    if (n === null) return row; // §/recital votes carry no amendment text
    report.candidates++;

    if (row.remarks.trim()) return row; // advisor already wrote something — keep it

    const am = amendments.get(n);
    if (!am) {
      report.anomalies.push({ subject: row.subject, amNo: row.amNo, reason: "not_found" });
      return row;
    }
    if (am.kind === "oral" || am.kind === "withdrawn" || am.kind === "compromise_cam") {
      report.anomalies.push({ subject: row.subject, amNo: row.amNo, reason: am.kind });
      return row;
    }
    // Advisor convention: added text bold, deleted text struck through
    // (word-level diff of the published present/amended columns).
    const text = remarksFor(am.originalText, am.amendedText);
    if (!text) {
      report.anomalies.push({ subject: row.subject, amNo: row.amNo, reason: "no_text" });
      return row;
    }

    report.filled++;

    // Split vote: when the amendment is a pure addition (or deletion) with
    // exactly one paragraph per split part, each part gets its own paragraph
    // (STREIT Am 3 pattern), re-diffed per paragraph so the <b>/<s> markup
    // stays balanced. Anything else puts the full text on the parent row —
    // part boundaries are a human call, never guessed.
    if (row.splitParts.length > 0) {
      const origParas = (am.originalText ?? "").split("\n").filter((p) => p.trim());
      const amendParas = (am.amendedText ?? "").split("\n").filter((p) => p.trim());
      const pure =
        (origParas.length === 0 && amendParas.length === row.splitParts.length) ||
        (amendParas.length === 0 && origParas.length === row.splitParts.length);
      if (pure) {
        return {
          ...row,
          splitParts: row.splitParts.map((p, i) =>
            p.remarks.trim()
              ? p
              : { ...p, remarks: remarksFor(origParas[i] ?? null, amendParas[i] ?? null) },
          ),
        };
      }
      return { ...row, remarks: text };
    }

    return { ...row, remarks: text };
  });

  return { vl: { ...vl, rows }, report };
}
