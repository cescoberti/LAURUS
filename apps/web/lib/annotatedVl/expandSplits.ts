/**
 * Split-vote expansion for the annotated voting list. SERVER ONLY.
 *
 * A split notation ("text as a whole excluding the words '…'" / "those words")
 * presupposes the report open next to the list. This step closes that gap: it
 * reconstructs the literal text of each part so the advisor sees what is being
 * voted, following the voting-list-split method:
 *
 *   - splits are TABLED ON ENGLISH, so the cut is made on the English text of
 *     the subject (report paragraph, recital, or amendment), and it only
 *     stands if re-composing the parts gives back the original character for
 *     character — otherwise the row is NOT expanded and keeps its notation,
 *     marked with an error code;
 *   - the Italian (or requested-language) rendering prefers a crop of the
 *     official translation; when the corresponding words are not one
 *     contiguous run, the official notation is kept as the rendering and
 *     flagged RESA_NON_LETTERALE;
 *   - every expanded cell carries the English crop underneath ("[EN] …"),
 *     because English is the text the vote is on.
 *
 * Error codes (row NOT expanded, notation left intact):
 *   OGGETTO_NON_RISOLTO, TERMINI_NON_TROVATI, TERMINI_AMBIGUI,
 *   RICOMPOSIZIONE_FALLITA, GRAMMATICA_NON_SUPPORTATA
 * Warning codes (row expanded, flagged):
 *   RESA_NON_LETTERALE, VERSIONE_TRADOTTA_ASSENTE
 */
import mammoth from "mammoth";
import type { AnnotatedVotingList } from "@laurus/parser/voting-list-docx";
import type { VotPayload } from "@laurus/parser/vot-xml";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import type { DbAmendment } from "./fromDb";

const BASE = "https://data.europarl.europa.eu";

export interface SplitExpansionNote {
  subject: string;
  level: "error" | "warning";
  code: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Text plumbing
// ---------------------------------------------------------------------------

/** One typographic plane for cutting and comparing: straight quotes, plain spaces. */
function norm(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[«»]/g, '"')
    .replace(/ /g, " ")
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Display-only tidy: double spaces and space before punctuation (never more). */
function tidy(s: string): string {
  return s.replace(/\s{2,}/g, " ").replace(/\s+([,;.:])/g, "$1").trim();
}

function stripOuterQuotes(s: string): string {
  return s.replace(/^["']\s*/, "").replace(/\s*["']$/, "").trim();
}

/** Count non-overlapping occurrences of `needle` in `hay`. */
function occurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Notation grammar
// ---------------------------------------------------------------------------

/** Grammar A markers — "everything except the words …". */
const EXCLUDING = /without the words|excluding the words|apart from the words|tranne i termini|senza i termini|ad eccezione dei termini|esclusi i termini/i;
/** Grammar B markers — sequential cut, ambiguous by construction. */
const SEQUENTIAL = /up to the words|until the words|fino ai termini|fino alle parole/i;
/** "those words" back-reference used by the second part. */
const THOSE_WORDS = /^(those|these) words$|^tali termini$|^detti termini$|^the remainder/i;

/** The quoted terms of an "excluding the words" notation (normalised plane). */
function excludedTerms(notation: string): string | null {
  const m = EXCLUDING.exec(notation);
  if (!m) return null;
  const tail = notation.slice(m.index + m[0].length).replace(/^\s*[:,]?\s*/, "");
  const terms = stripOuterQuotes(tail);
  return terms || null;
}

// ---------------------------------------------------------------------------
// Subject resolution on the report text
// ---------------------------------------------------------------------------

/** 'A10-0163/2026' → 'A-10-2026-0163'. */
function epDocId(code: string): string | null {
  const m = code.match(/^([A-Z]+)(\d+)-(\d+)\/(\d{4})$/);
  if (!m) return null;
  const [, prefix, term, num, year] = m;
  return `${prefix}-${term}-${year}-${num.padStart(4, "0")}`;
}

async function reportParagraphs(itemCode: string, lang: string): Promise<string[] | null> {
  const id = epDocId(itemCode);
  if (!id) return null;
  const buf = await fetchBytesWithBackoff(`${BASE}/distribution/reds_iPlRp/${id}/${id}_${lang}.docx`);
  if (!buf || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) return null;
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value.split("\n").map((l) => norm(l)).filter(Boolean);
}

/**
 * Find the text of a split subject ('§ 20', 'Recital C', 'Am 5') in the
 * report paragraphs / amendment set. Null when it cannot be pinned down to
 * exactly one run of text — never guess.
 */
function resolveSubject(
  subject: string,
  paragraphs: string[] | null,
  amendments: Map<number, string>,
): { text: string } | { error: string } {
  const s = subject.trim();

  const am = /^(?:am|amendment|emendamento|em)\.?\s*(\d+)/i.exec(s);
  if (am) {
    const text = amendments.get(Number(am[1]));
    return text ? { text } : { error: `amendment ${am[1]} not in the ingested set` };
  }

  if (!paragraphs) return { error: "report text not available" };

  const para = /^§+\s*(\d+[a-z]?)/i.exec(s);
  const recital = /^(?:recital|considerando)\s+([A-Z]+[a-z]?)\b/i.exec(s);
  const anchor = para ? `${para[1]}.` : recital ? `${recital[1]}.` : null;
  if (!anchor) return { error: `subject notation "${s}" not supported` };

  const matches = paragraphs.filter((p) => p.startsWith(anchor + " ") || p.startsWith(anchor + "\t"));
  if (matches.length === 0) return { error: `"${s}" not found in the report text` };
  if (matches.length > 1) return { error: `"${s}" matches ${matches.length} paragraphs` };
  return { text: matches[0]! };
}

// ---------------------------------------------------------------------------
// The expansion itself
// ---------------------------------------------------------------------------

interface PartTexts {
  /** Rendering in the list's language (or the EN crop when that IS the language). */
  main: string;
  /** EN crop, shown underneath unless it already is the main text. */
  en: string | null;
  warning?: { code: string; detail: string };
}

/**
 * Cut one subject's text according to an excluding-grammar split.
 * Returns one entry per part, or an error that leaves the row untouched.
 */
function cutParts(
  enSubject: string,
  langSubject: string | null,
  enParts: Array<{ text: string }>,
  langParts: Array<{ text: string }>,
  isEnglishList: boolean,
): { parts: PartTexts[] } | { error: { code: string; detail: string } } {
  const first = norm(enParts[0]?.text ?? "");
  if (SEQUENTIAL.test(first)) {
    return { error: { code: "GRAMMATICA_NON_SUPPORTATA", detail: "sequential-cut notation; which side keeps the quoted words is not stated" } };
  }

  // Quotes to exclude: from part 1 when part 2 is a back-reference, otherwise
  // each later part quotes its own words.
  let quotesEn: string[];
  const laterAreQuotes = enParts.slice(1).every((p) => !THOSE_WORDS.test(norm(p.text)));
  if (enParts.length >= 2 && laterAreQuotes) {
    quotesEn = enParts.slice(1).map((p) => stripOuterQuotes(norm(p.text)));
  } else {
    const terms = excludedTerms(first);
    if (!terms) return { error: { code: "GRAMMATICA_NON_SUPPORTATA", detail: `notation "${first.slice(0, 60)}…" not recognised` } };
    quotesEn = [terms];
  }
  if (quotesEn.length !== enParts.length - 1) {
    return { error: { code: "GRAMMATICA_NON_SUPPORTATA", detail: `${enParts.length} parts but ${quotesEn.length} quoted blocks` } };
  }

  // EN cut, with the recomposition guarantee.
  const para = norm(enSubject);
  let firstEn = para;
  for (const q of quotesEn) {
    const n = occurrences(firstEn, q);
    if (n === 0) return { error: { code: "TERMINI_NON_TROVATI", detail: `"${q.slice(0, 60)}…" is not in the subject text` } };
    if (n > 1) return { error: { code: "TERMINI_AMBIGUI", detail: `"${q.slice(0, 60)}…" occurs ${n} times in the subject text` } };
    firstEn = firstEn.replace(q, " ");
  }
  // Putting the quotes back must give the paragraph again, or the cut is wrong.
  let recomposed = firstEn;
  for (const q of quotesEn) recomposed = recomposed.replace(" ", q);
  if (recomposed !== para) {
    return { error: { code: "RICOMPOSIZIONE_FALLITA", detail: "re-inserting the quoted words does not give back the original paragraph" } };
  }
  const firstEnText = tidy(firstEn.replaceAll(" ", " "));

  if (isEnglishList) {
    return {
      parts: [
        { main: firstEnText, en: null },
        ...quotesEn.map((q) => ({ main: q, en: null })),
      ],
    };
  }

  // Rendering in the list's language: crop the official translation when the
  // corresponding words are one contiguous unique run; otherwise keep the
  // official notation as the rendering and flag it.
  const langQuotes = langParts.length === enParts.length
    ? (langParts.length >= 2 && langParts.slice(1).every((p) => !THOSE_WORDS.test(norm(p.text)))
        ? langParts.slice(1).map((p) => stripOuterQuotes(norm(p.text)))
        : (() => {
            const t = excludedTerms(norm(langParts[0]?.text ?? ""));
            return t ? [t] : null;
          })())
    : null;

  const fallback = (i: number, code: string, detail: string): PartTexts => ({
    main: norm(langParts[i]?.text ?? enParts[i]?.text ?? ""),
    en: i === 0 ? firstEnText : quotesEn[i - 1]!,
    warning: { code, detail },
  });

  if (!langSubject || !langQuotes) {
    return {
      parts: enParts.map((_, i) =>
        fallback(i, "VERSIONE_TRADOTTA_ASSENTE", langSubject ? "translated notation incomplete" : "translated report not available"),
      ),
    };
  }

  const paraLang = norm(langSubject);
  let firstLang = paraLang;
  for (const q of langQuotes) {
    if (occurrences(paraLang, q) !== 1) {
      // The norm, not a failure: the translation reorders. Official notation + EN crop.
      return {
        parts: enParts.map((_, i) => fallback(i, "RESA_NON_LETTERALE", "the translated words are not one contiguous run")),
      };
    }
    firstLang = firstLang.replace(q, " ");
  }

  return {
    parts: [
      { main: tidy(firstLang), en: firstEnText },
      ...langQuotes.map((q, i) => ({ main: q, en: quotesEn[i]! })),
    ],
  };
}

/**
 * Expand every split row of the list in place. Returns the notes for the
 * report email; rows with an error keep their official notation untouched.
 */
export async function expandSplitRows(
  vl: AnnotatedVotingList,
  opts: {
    itemCode: string;
    language: string;
    votEn: VotPayload | null;
    votLang: VotPayload | null;
    amendments: DbAmendment[];
  },
): Promise<SplitExpansionNote[]> {
  const notes: SplitExpansionNote[] = [];
  const splitRows = vl.rows.filter((r) => r.voteType === "split" && r.splitParts.length > 0);
  if (splitRows.length === 0) return notes;

  const isEnglishList = opts.language === "en";
  const [paraEn, paraLang] = await Promise.all([
    reportParagraphs(opts.itemCode, "en"),
    isEnglishList ? Promise.resolve(null) : reportParagraphs(opts.itemCode, opts.language),
  ]);

  const amEn = new Map<number, string>();
  const amLang = new Map<number, string>();
  for (const a of opts.amendments) {
    const text = norm(a.amended_text ?? a.original_text ?? "");
    if (!text) continue;
    if (a.language === "en") amEn.set(a.number, text);
    if (a.language === opts.language) amLang.set(a.number, text);
  }

  for (const row of splitRows) {
    const subject = row.subject;
    const reqEn = (opts.votEn?.splitVotes ?? []).find((sv) => norm(sv.subject) === norm(subject));
    const reqLang = (opts.votLang?.splitVotes ?? []).find((sv) => norm(sv.subject) === norm(subject));
    if (!reqEn) {
      notes.push({ subject, level: "error", code: "OGGETTO_NON_RISOLTO", detail: "no English VOT request found for this split (splits are tabled on English)" });
      continue;
    }
    if (reqEn.parts.length !== row.splitParts.length) {
      notes.push({ subject, level: "error", code: "OGGETTO_NON_RISOLTO", detail: `the list has ${row.splitParts.length} parts, the English VOT ${reqEn.parts.length}` });
      continue;
    }

    const resolvedEn = resolveSubject(subject, paraEn, amEn);
    if ("error" in resolvedEn) {
      notes.push({ subject, level: "error", code: "OGGETTO_NON_RISOLTO", detail: resolvedEn.error });
      continue;
    }
    const resolvedLang = isEnglishList ? null : resolveSubject(subject, paraLang, amLang);
    const langSubject = resolvedLang && !("error" in resolvedLang) ? resolvedLang.text : null;

    const cut = cutParts(resolvedEn.text, langSubject, reqEn.parts, reqLang?.parts ?? [], isEnglishList);
    if ("error" in cut) {
      notes.push({ subject, level: "error", code: cut.error.code, detail: cut.error.detail });
      continue;
    }

    for (const [i, part] of cut.parts.entries()) {
      const target = row.splitParts[i]!;
      target.notation ??= target.remarks;
      target.remarks = part.en ? `${part.main}\n[EN] ${part.en}` : part.main;
      if (part.warning && i === 0) {
        notes.push({ subject, level: "warning", code: part.warning.code, detail: part.warning.detail });
      }
    }
  }

  return notes;
}
