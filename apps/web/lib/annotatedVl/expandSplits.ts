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
 *   - the rendering is the advisor's: the parent row is emptied, part 1 is
 *     the whole paragraph in the list's language with the split-off words
 *     struck through, the later parts are those words;
 *   - the translated words come from the translated request when it exists
 *     (the VOT, after the vote) or, before the vote, are located in the
 *     translated paragraph by alignQuotes (Claude, verbatim-checked, flagged
 *     RESA_AUTOMATICA); when they are not one contiguous run the official
 *     notation is kept as the rendering and flagged RESA_NON_LETTERALE.
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
import { alignQuotes, quoteAlignmentAvailable } from "./alignQuotes";

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

/**
 * "emphasises that unpaid … labour market policies," → the literal span of
 * `hay` from the first fragment to the end of the last one. Each fragment
 * must occur exactly once, in order; a quote without an ellipsis is returned
 * as it is.
 */
function expandEllipsis(hay: string, quote: string): { text: string } | { error: { code: string; detail: string } } {
  const pieces = quote.split(/\s*(?:…|\.\.\.)\s*/).map((p) => p.trim()).filter(Boolean);
  if (pieces.length < 2) return { text: quote };
  let from = -1;
  let to = -1;
  for (let piece of pieces) {
    // The request quotes the words with its own closing punctuation ("…
    // policies,") where the paragraph has another ("… policies;"): the words
    // are what is voted, so drop a trailing comma/semicolon that is not there.
    if (occurrences(hay, piece) === 0 && /[,;.]$/.test(piece) && occurrences(hay, piece.slice(0, -1)) === 1) piece = piece.slice(0, -1);
    const n = occurrences(hay, piece);
    if (n === 0) return { error: { code: "TERMINI_NON_TROVATI", detail: `"${piece.slice(0, 60)}…" is not in the subject text` } };
    if (n > 1) return { error: { code: "TERMINI_AMBIGUI", detail: `"${piece.slice(0, 60)}…" occurs ${n} times in the subject text` } };
    const at = hay.indexOf(piece);
    if (at < to) return { error: { code: "TERMINI_NON_TROVATI", detail: `the abbreviated quote's fragments are not in order in the subject text` } };
    if (from < 0) from = at;
    to = at + piece.length;
  }
  return { text: hay.slice(from, to) };
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
  /** Rendering in the list's language (light HTML: `<s>` marks the split-off words). */
  main: string;
  warning?: { code: string; detail: string };
}

/** Locates the translated runs for English quotes (see alignQuotes.ts). */
type Aligner = (enParagraph: string, quotesEn: string[], langParagraph: string) => Promise<Array<string | null> | null>;

/**
 * Cut one subject's text according to an excluding-grammar split.
 * Returns one entry per part, or an error that leaves the row untouched.
 */
async function cutParts(
  enSubject: string,
  langSubject: string | null,
  enParts: Array<{ text: string }>,
  langParts: Array<{ text: string }>,
  isEnglishList: boolean,
  align: Aligner | null,
): Promise<{ parts: PartTexts[] } | { error: { code: string; detail: string } }> {
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
  // A long quote is often abbreviated "first words … last words": resolve it
  // to the one literal span of the paragraph that starts and ends so.
  for (const [i, q] of quotesEn.entries()) {
    const span = expandEllipsis(para, q);
    if ("error" in span) return { error: span.error };
    quotesEn[i] = span.text;
  }
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

  void firstEnText;

  // Rendering, as an advisor reads an amendment: part 1 is the WHOLE
  // paragraph with the split-off words struck through, the later parts are
  // those words — so the first row shows what was taken out.
  if (isEnglishList) return { parts: [{ main: struck(para, quotesEn) }, ...quotesEn.map((q) => ({ main: sentenceCase(q) }))] };

  const fallback = (code: string, detail: string): { parts: PartTexts[] } => ({
    parts: enParts.map((p, i) => ({
      main: norm(langParts[i]?.text ?? p.text),
      warning: i === 0 ? { code, detail } : undefined,
    })),
  });
  if (!langSubject) return fallback("VERSIONE_TRADOTTA_ASSENTE", "translated report not available");
  const paraLang = norm(langSubject);

  // The translated words: from the translated request when there is one
  // (the VOT, after the vote); before the vote, located in the translated
  // paragraph by the aligner and checked verbatim; else the official
  // notation stands, flagged.
  let langQuotes: string[] | null = null;
  let warning: PartTexts["warning"];
  if (langParts.length === enParts.length && langParts.length > 0) {
    langQuotes =
      langParts.length >= 2 && langParts.slice(1).every((p) => !THOSE_WORDS.test(norm(p.text)))
        ? langParts.slice(1).map((p) => stripOuterQuotes(norm(p.text)))
        : (() => {
            const t = excludedTerms(norm(langParts[0]?.text ?? ""));
            return t ? [t] : null;
          })();
    if (!langQuotes) return fallback("VERSIONE_TRADOTTA_ASSENTE", "translated notation incomplete");
  } else if (align) {
    const aligned = await align(para, quotesEn, paraLang);
    if (!aligned || !aligned.every((a): a is string => a !== null)) {
      return fallback("RESA_NON_LETTERALE", "the translated words could not be located as one contiguous run");
    }
    langQuotes = aligned.map((a) => norm(a));
    warning = { code: "RESA_AUTOMATICA", detail: "translated words located automatically and checked verbatim against the report — review" };
  } else {
    return fallback("VERSIONE_TRADOTTA_ASSENTE", "no translated request before the vote (ANTHROPIC_API_KEY not set for automatic alignment)");
  }

  let firstLang = paraLang;
  for (const q of langQuotes) {
    if (occurrences(paraLang, q) !== 1) {
      // The norm, not a failure: the translation reorders. Official notation.
      return fallback("RESA_NON_LETTERALE", "the translated words are not one contiguous run");
    }
    firstLang = firstLang.replace(q, " ");
  }

  void firstLang;

  return {
    parts: [
      { main: struck(paraLang, langQuotes), warning },
      ...langQuotes.map((q) => ({ main: sentenceCase(q) })),
    ],
  };
}

/** The paragraph with each quoted run struck through (light HTML `<s>`). */
function struck(paragraph: string, quotes: string[]): string {
  let out = paragraph;
  for (const q of quotes) out = out.replace(q, `<s>${q}</s>`);
  return out;
}

/** The split-off words stand alone in their row, so they open with a capital ("Di tutti i tipi"). */
function sentenceCase(words: string): string {
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
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

    const align: Aligner | null = quoteAlignmentAvailable()
      ? (en, quotes, langPara) => alignQuotes(en, quotes, langPara, opts.language)
      : null;
    const cut = await cutParts(resolvedEn.text, langSubject, reqEn.parts, reqLang?.parts ?? [], isEnglishList, align);
    if ("error" in cut) {
      notes.push({ subject, level: "error", code: cut.error.code, detail: cut.error.detail });
      continue;
    }

    // The parent row stays empty: what is voted is in the parts.
    row.remarks = "";
    for (const [i, part] of cut.parts.entries()) {
      const target = row.splitParts[i]!;
      target.notation ??= target.remarks;
      target.remarks = part.main;
      if (part.warning && i === 0) {
        notes.push({ subject, level: "warning", code: part.warning.code, detail: part.warning.detail });
      }
    }
  }

  return notes;
}
