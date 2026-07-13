/**
 * Illustrative sample for the Feature 4 demo (Remarks auto-fill).
 *
 * NOT real EP document text — the real Italian voting-list/amendment fixtures
 * needed to validate the production parser haven't been captured yet (every
 * sampled report on the reference date used provisional agreements or
 * alternative motions instead of numbered amendments; see
 * packages/parser/fixtures/README.md). This sample only demonstrates the UI
 * and the deterministic matcher end-to-end; it is labelled as sample data,
 * never presented as sourced EP content, per the "never invent document
 * content" rule.
 */
import { resolveRef, indexAmendments, type ParsedAmendment } from "@laurus/parser";

export const sampleAmendments: ParsedAmendment[] = [
  { number: 12, language: "it", kind: "standard", target: "Considerando C",
    originalText: "considerando che la produzione di materiale forestale di riproduzione deve garantire elevati standard genetici;",
    amendedText: "considerando che la produzione di materiale forestale di riproduzione deve garantire elevati standard genetici e la tracciabilità lungo l'intera filiera;" },
  { number: 34, language: "it", kind: "standard", target: "Articolo 4, paragrafo 2",
    originalText: "Gli Stati membri istituiscono un registro nazionale dei materiali di base.",
    amendedText: "Gli Stati membri istituiscono, entro dodici mesi dall'entrata in vigore, un registro nazionale interoperabile dei materiali di base." },
  { number: 41, language: "it", kind: "withdrawn", target: "Articolo 7" },
  { number: 58, language: "it", kind: "oral", target: "Considerando F" },
  { number: 63, language: "it", kind: "compromise_cam", target: "Articolo 9" },
];

export interface SampleVlRow {
  orderIndex: number;
  subject: string;
  amNo: string | null;
}

export const sampleVlRows: SampleVlRow[] = [
  { orderIndex: 1, subject: "Considerando C", amNo: "Em 12" },
  { orderIndex: 2, subject: "Articolo 4, paragrafo 2", amNo: "Em. 34" },
  { orderIndex: 3, subject: "Articolo 7", amNo: "Em 41" },
  { orderIndex: 4, subject: "Considerando F", amNo: "Emendamento orale 58" },
  { orderIndex: 5, subject: "Articolo 9", amNo: "CAM 63" },
  { orderIndex: 6, subject: "§ 15", amNo: null },
  { orderIndex: 7, subject: "Testo nel complesso", amNo: null },
];

export interface AnnotatedRow extends SampleVlRow {
  status: "auto" | "anomaly";
  remarks: string;
  reason?: string;
}

const index = indexAmendments(sampleAmendments);

export function annotate(rows: SampleVlRow[]): AnnotatedRow[] {
  return rows.map((row) => {
    const subjectForMatch = row.amNo ?? row.subject;
    const resolution = resolveRef(subjectForMatch, index);
    if (resolution.status === "auto") {
      const am = index.get(resolution.amendmentNumber)!;
      return {
        ...row,
        status: "auto",
        remarks: am.amendedText ?? "",
      };
    }
    return { ...row, status: "anomaly", remarks: "", reason: resolution.reason };
  });
}

export const REASON_LABEL: Record<string, string> = {
  unresolvable: "Riferimento non risolvibile",
  not_found: "Emendamento non trovato",
  withdrawn: "Emendamento ritirato",
  oral: "Emendamento orale",
  compromise_cam: "Emendamento di compromesso (CAM)",
  paragraph_ref: "Riferimento a paragrafo, non a emendamento",
};
