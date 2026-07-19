import type { AnnotatedVotingList, AnnotatedVlRow } from "@laurus/parser/voting-list-docx";
import { remarksFor } from "@laurus/parser";

/**
 * Build a per-report annotated voting list straight from ingested EP data —
 * no Tabling Service upload needed. One row per plenary amendment (ordered by
 * number), Remarks pre-filled with the published text (IT first), plus the
 * final vote row. The Vote column is left empty: that's the advisor's call.
 */

export interface DbItem {
  code: string;
  title: { en?: string; it?: string };
  rapporteur: string | null;
  committee: string | null;
}

export interface DbAmendment {
  number: number;
  language: string;
  target: string | null;
  tabled_by: string | null;
  original_text: string | null;
  amended_text: string | null;
  kind: string;
}

/** DocAmend artifacts stored in tabled_by before author extraction existed. */
const NON_AUTHOR = /^(proposta di risoluzione|motion for a resolution|draft legislative resolution|parliament's rules|proposta di regolamento|proposal for a)/i;

const COMMITTEE_LABEL: Record<string, string> = {
  AFET: "Committee on Foreign Affairs",
  DEVE: "Committee on Development",
  INTA: "Committee on International Trade",
  BUDG: "Committee on Budgets",
  CONT: "Committee on Budgetary Control",
  ECON: "Committee on Economic and Monetary Affairs",
  EMPL: "Committee on Employment and Social Affairs",
  ENVI: "Committee on the Environment, Public Health and Food Safety",
  ITRE: "Committee on Industry, Research and Energy",
  IMCO: "Committee on the Internal Market and Consumer Protection",
  TRAN: "Committee on Transport and Tourism",
  REGI: "Committee on Regional Development",
  AGRI: "Committee on Agriculture and Rural Development",
  PECH: "Committee on Fisheries",
  CULT: "Committee on Culture and Education",
  JURI: "Committee on Legal Affairs",
  LIBE: "Committee on Civil Liberties, Justice and Home Affairs",
  AFCO: "Committee on Constitutional Affairs",
  FEMM: "Committee on Women's Rights and Gender Equality",
  PETI: "Committee on Petitions",
};

export function buildVlFromAmendments(
  item: DbItem,
  amendments: DbAmendment[],
  lang = "it",
): AnnotatedVotingList {
  // One entry per number in the requested language; EN then IT as fallbacks
  // (later assignments win, so the requested language is applied last).
  const byNumber = new Map<number, DbAmendment>();
  for (const l of ["en", "it", lang]) {
    for (const a of amendments) if (a.language === l) byNumber.set(a.number, a);
  }

  const rows: AnnotatedVlRow[] = [...byNumber.values()]
    .sort((a, b) => a.number - b.number)
    .map((a) => ({
      subject: a.target ?? "",
      amNo: String(a.number),
      author: a.tabled_by && !NON_AUTHOR.test(a.tabled_by) ? a.tabled_by : null,
      voteType: null,
      vote: null,
      // Advisor convention: added text bold, deleted text struck through.
      remarks: remarksFor(a.original_text, a.amended_text),
      splitParts: [],
    }));

  rows.push({
    subject: "vote: resolution (as a whole)",
    amNo: null,
    author: null,
    voteType: "RCV",
    vote: null,
    remarks: "",
    splitParts: [],
    isFinalVote: true,
  });

  // 'STREIT' style surname: last word of the rapporteur, uppercased.
  const rapporteurLabel = item.rapporteur ? (item.rapporteur.split(/\s+/).pop() ?? item.rapporteur).toUpperCase() : null;

  return {
    documentTitle: "INDICATIVE VOTING LIST",
    version: "LAURUS DRAFT",
    rapporteur: rapporteurLabel,
    reportCode: item.code,
    procedureType: null,
    reportTitle: item.title.en || item.title.it || null,
    committee: item.committee ? (COMMITTEE_LABEL[item.committee] ?? item.committee) : null,
    rows,
  };
}
