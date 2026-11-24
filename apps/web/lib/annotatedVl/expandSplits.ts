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
import { splitRequestFor, type AnnotatedVotingList } from "@laurus/parser/voting-list-docx";
import type { VotPayload } from "@laurus/parser/vot-xml";
import { documentTextUrl } from "@laurus/parser";
import { parseMotionText, originalTextFor, type MotionText } from "@laurus/parser/report-docx";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import type { DbAmendment } from "./fromDb";
import { alignQuotes, quoteAlignmentAvailable } from "./alignQuotes";
import { articleTextIn } from "./load";
import type { LoadedCouncilPosition } from "./councilPosition";
import { splitAgent, splitAgentAvailable, type LocatedRun, type SplitAgentResult } from "./splitAgent";

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

/**
 * The official list's footer marks a part that is ALSO a roll-call or separate
 * vote with a bracketed tag after the quote — `“to PIF offences” [ROLL-CALL VOTE]`.
 * The tag is the Tabling Service's, not the report's: left in, the words
 * searched for in the paragraph were `to PIF offences" [ROLL-CALL VOTE]` and
 * every such split came back TERMINI_NON_TROVATI. Only an upper-case tag at the
 * end is taken off, so a bracket in the report's own words ("[or]") is safe.
 * The notation printed on the list is not touched; this is only for cutting.
 */
const TRAILING_TAGS = /(?:\s*\[[A-ZÀ-Ý][A-ZÀ-Ý\s,/-]{1,40}\])+\s*$/;
function partText(raw: string): string {
  return norm(raw).replace(TRAILING_TAGS, "").trim();
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
const EXCLUDING =
  /(?:without|excluding|apart from|except(?:ing)?) the (?:words?|terms?)|(?:tranne|senza|esclusi?|ad eccezione dei) (?:i |il |la |le )?(?:termini?|parole?)/i;
/** Grammar B markers — sequential cut, ambiguous by construction. */
const SEQUENTIAL = /up to the words|until the words|fino ai termini|fino alle parole/i;
/** "those words" back-reference used by the second part. */
const THOSE_WORDS =
  /^(?:those|these|this|that) (?:words?|terms?)$|^(?:tali|tale|detti|detto|questi|questo) (?:termini?|parole?)$|^the remainder/i;

/**
 * The quoted terms of an "excluding the words" notation (normalised plane).
 *
 * One clause can leave out several runs — "excluding the words \u201csystemic\u201d and
 * \u201cand gender-diverse people\u201d" is a vote in three parts, not two — so every
 * quoted run is returned, in the order printed. A clause with no quotation
 * marks gives its whole tail as the single run.
 */
function excludedTerms(notation: string): string[] {
  const m = EXCLUDING.exec(notation);
  if (!m) return [];
  const tail = notation.slice(m.index + m[0].length).replace(/^\s*[:,]?\s*/, "");
  const quoted = [...tail.matchAll(/"([^"]+)"/g)].map((q) => q[1]!.trim()).filter(Boolean);
  if (quoted.length) return quoted;
  const terms = stripOuterQuotes(tail);
  return terms ? [terms] : [];
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

/**
 * The text the splits cut on. `documentTextUrl` picks the store by document
 * kind — a report (A-) lives under reds_iPlRp, a motion for a resolution (B-)
 * under reds_iPlRe — and getting that wrong is silent: the wrong store 404s,
 * this returns null, and every split row of the file is reported as
 * OGGETTO_NON_RISOLTO, "report text not available". Which is what happened to
 * all six splits of B10-0423/2026 on the eve of the vote.
 */
async function reportParagraphs(itemCode: string, lang: string): Promise<ReportText | null> {
  const id = epDocId(itemCode);
  if (!id) return null;
  const buf = await fetchBytesWithBackoff(documentTextUrl(id, lang));
  if (!buf || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) return null;
  const { value } = await mammoth.extractRawText({ buffer: buf });
  const lines = value.split("\n").map((l) => norm(l)).filter(Boolean);
  // The motion index knows the shapes a flat line scan cannot tell apart —
  // "§ 2, point a, indent 1", "§ 1, point au" — and it is the same index the
  // Remarks fill uses, so a row cannot resolve one way there and another here.
  const motion = await parseMotionText(buf).catch(() => null);
  return { lines, motion };
}

/**
 * Find the text of a split subject ('§ 20', 'Recital C', 'Am 5') in the
 * report paragraphs / amendment set. Null when it cannot be pinned down to
 * exactly one run of text — never guess.
 */
/** The report in one language: its lines, and the motion indexed by reference. */
interface ReportText {
  lines: string[];
  motion: MotionText | null;
}

function resolveSubject(
  row: { subject: string; amNo: string | null },
  report: ReportText | null,
  amendments: Map<number, string>,
  article: ((subject: string) => string | null) | null,
): { text: string } | { error: string } {
  const s = row.subject.trim();

  // What the row votes is the amendment in its "Am No" column, whatever the
  // subject column calls it: the table names the place ("Article 9, § 4",
  // "After recital 15"), the text is the amendment's.
  const amNo = /^(\d+)$/.exec((row.amNo ?? "").trim());
  const am = amNo ?? /^(?:am|amendment|emendamento|em)\.?\s*(\d+)/i.exec(s);
  if (am) {
    const text = amendments.get(Number(am[1]));
    return text ? { text } : { error: `amendment ${am[1]} not in the ingested set` };
  }

  // A second reading's subjects are articles of the Council position, which
  // is a document of the Council's: nothing in the report holds them.
  if (/^article\b/i.test(s)) {
    if (!article) return { error: "the Council position is not available in this language" };
    const text = article(s);
    return text ? { text } : { error: `"${s}" not found in the Council position` };
  }

  if (!report) return { error: "report text not available" };

  // The motion's own index first: it reads the points and indents under a
  // paragraph, which the line scan below cannot.
  const indexed = report.motion ? originalTextFor(s, report.motion) : null;
  if (indexed) return { text: norm(indexed) };

  const para = /^§+\s*(\d+[a-z]?)$/i.exec(s);
  const recital = /^(?:recital|considerando)\s+([A-Z]+[a-z]?)$/i.exec(s);
  const anchor = para ? `${para[1]}.` : recital ? `${recital[1]}.` : null;
  if (!anchor) return { error: `subject notation "${s}" not supported` };

  const matches = report.lines.filter((p) => p.startsWith(anchor + " ") || p.startsWith(anchor + "\t"));
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
  warning?: { code: string; detail: string; level?: "error" | "warning" };
}

/** Locates the translated runs for English quotes (see alignQuotes.ts). */
type Aligner = (enParagraph: string, quotesEn: string[], langParagraph: string) => Promise<Array<string | null> | null>;

/**
 * Cut one subject's text according to an excluding-grammar split.
 * Returns one entry per part, or an error that leaves the row untouched.
 */
/** Stands in for a cut-out run while the paragraph is put back together. */
const SENTINEL = "\0";

async function cutParts(
  enSubject: string,
  langSubject: string | null,
  enParts: Array<{ text: string }>,
  langParts: Array<{ text: string }>,
  isEnglishList: boolean,
  align: Aligner | null,
): Promise<{ parts: PartTexts[] } | { error: { code: string; detail: string } }> {
  const first = partText(enParts[0]?.text ?? "");
  if (SEQUENTIAL.test(first)) {
    return { error: { code: "GRAMMATICA_NON_SUPPORTATA", detail: "sequential-cut notation; which side keeps the quoted words is not stated" } };
  }

  // Quotes to exclude: each later part quotes its own words, or part 1 says
  // which words are left out and the later parts point back at them ("these
  // words", "this word"). Both can be printed and disagree — § 1 of
  // A10-0200 is excluded on "systemic" and quoted as "systematic", one of
  // them a slip — so both are tried, the parts first, and a cut that only
  // the notation supports carries a warning.
  const para = norm(enSubject);
  const laterAreQuotes = enParts.length >= 2 && enParts.slice(1).every((p) => !THOSE_WORDS.test(partText(p.text)));
  const candidates: Array<{ quotes: string[]; grouped: boolean }> = [];
  if (laterAreQuotes) candidates.push({ quotes: enParts.slice(1).map((p) => stripOuterQuotes(partText(p.text))), grouped: false });
  const terms = excludedTerms(first);
  // Several runs left out of a two-part vote are taken out together and voted
  // together: "excluding the words \u201cX\u201d and \u201cY\u201d" / "these words" is one
  // second part holding both (A10-0280, Recital O).
  if (terms.length === enParts.length - 1) candidates.push({ quotes: terms, grouped: false });
  else if (terms.length > 1 && enParts.length === 2) candidates.push({ quotes: terms, grouped: true });
  if (candidates.length === 0) {
    return { error: { code: "GRAMMATICA_NON_SUPPORTATA", detail: `notation "${first.slice(0, 60)}\u2026" not recognised` } };
  }

  /** One quote set, resolved to literal runs of the paragraph and put back again. */
  const cut = (quotes: string[]): { quotes: string[] } | { error: { code: string; detail: string } } => {
    const resolved: string[] = [];
    for (const q of quotes) {
      // A long quote is often abbreviated "first words \u2026 last words": resolve
      // it to the one literal span of the paragraph that starts and ends so.
      const span = expandEllipsis(para, q);
      if ("error" in span) return { error: span.error };
      resolved.push(span.text);
    }
    let rest = para;
    for (const q of resolved) {
      const n = occurrences(rest, q);
      if (n === 0) return { error: { code: "TERMINI_NON_TROVATI", detail: `"${q.slice(0, 60)}\u2026" is not in the subject text` } };
      if (n > 1) return { error: { code: "TERMINI_AMBIGUI", detail: `"${q.slice(0, 60)}\u2026" occurs ${n} times in the subject text` } };
      rest = rest.replace(q, SENTINEL);
    }
    // Putting the quotes back must give the paragraph again, or the cut is wrong.
    let recomposed = rest;
    for (const q of resolved) recomposed = recomposed.replace(SENTINEL, q);
    if (recomposed !== para) {
      return { error: { code: "RICOMPOSIZIONE_FALLITA", detail: "re-inserting the quoted words does not give back the original paragraph" } };
    }
    return { quotes: resolved };
  };

  let quotesEn: string[] | null = null;
  let grouped = false;
  let disagreement: PartTexts["warning"];
  let firstError: { code: string; detail: string } | null = null;
  for (const [i, c] of candidates.entries()) {
    const got = cut(c.quotes);
    if ("error" in got) {
      firstError ??= got.error;
      continue;
    }
    quotesEn = got.quotes;
    grouped = c.grouped;
    if (i > 0) {
      disagreement = {
        code: "NOTAZIONE_DISCORDE",
        detail:
          "the later parts quote words the paragraph does not carry; the cut follows the words part 1 says are left out \u2014 check it against the official list",
      };
    }
    break;
  }
  if (!quotesEn) return { error: firstError! };

  // Rendering, as an advisor reads an amendment: part 1 is the WHOLE
  // paragraph with the split-off words struck through, the later parts are
  // those words — so the first row shows what was taken out.
  /** The runs as the list votes them: one part each, or all in the last part. */
  const asParts = (runs: string[]) =>
    grouped ? [{ main: sentenceCase(runs.join(" \u2026 ")) }] : runs.map((q) => ({ main: sentenceCase(q) }));

  if (isEnglishList) return { parts: [{ main: struck(para, quotesEn), warning: disagreement }, ...asParts(quotesEn)] };

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
      langParts.length >= 2 && langParts.slice(1).every((p) => !THOSE_WORDS.test(partText(p.text)))
        ? langParts.slice(1).map((p) => stripOuterQuotes(partText(p.text)))
        : (() => {
            const t = excludedTerms(partText(langParts[0]?.text ?? ""));
            return t.length ? t : null;
          })();
    if (!langQuotes) return fallback("VERSIONE_TRADOTTA_ASSENTE", "translated notation incomplete");
  } else if (align) {
    const aligned = await align(para, quotesEn, paraLang);
    if (!aligned || !aligned.every((a): a is string => a !== null)) {
      return fallback("RESA_NON_LETTERALE", "the translated words could not be located as one contiguous run");
    }
    langQuotes = aligned.map((a) => norm(a));
    warning = disagreement ?? { code: "RESA_AUTOMATICA", detail: "translated words located automatically and checked verbatim against the report — review" };
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

  return { parts: [{ main: struck(paraLang, langQuotes), warning }, ...asParts(langQuotes)] };
}

/** The paragraph with each quoted run struck through (light HTML `<s>`). */
function struck(paragraph: string, quotes: string[]): string {
  let out = paragraph;
  for (const q of quotes) out = out.replace(q, `<s>${q}</s>`);
  return out;
}

/** The paragraph with each located run struck through, by position (the same words may occur twice). */
function struckAt(paragraph: string, runs: LocatedRun[]): string {
  let out = "";
  let from = 0;
  for (const r of [...runs].sort((a, b) => a.at - b.at)) {
    out += paragraph.slice(from, r.at) + `<s>${r.text}</s>`;
    from = r.at + r.text.length;
  }
  return out + paragraph.slice(from);
}

/** Write the parts of one split into its row, the parent emptied. */
function applyParts(row: AnnotatedVotingList["rows"][number], parts: PartTexts[], subject: string, notes: SplitExpansionNote[]): void {
  // The parent row stays empty: what is voted is in the parts.
  row.remarks = "";
  for (const [i, part] of parts.entries()) {
    const target = row.splitParts[i]!;
    target.notation ??= target.remarks;
    target.remarks = part.main;
    if (part.warning && i === 0) {
      notes.push({ subject, level: part.warning.level ?? "warning", code: part.warning.code, detail: part.warning.detail });
    }
  }
}

/** What the split agent returned, as the parts of the row. */
function agentParts(r: SplitAgentResult, paraLang: string | null): PartTexts[] {
  if (r.kind === "located" && paraLang) {
    const all = r.runs.flat();
    const repeated = all.some((x) => x.repeated);
    return [
      {
        main: struckAt(paraLang, all),
        warning: repeated
          ? {
              code: "SPLIT_AGENTE_OCCORRENZA",
              detail:
                "the quoted words occur more than once in the paragraph; the split agent chose which one (the last, unless the English says otherwise) — check it is the one the request means",
            }
          : {
              code: "SPLIT_AGENTE",
              detail: "the Italian words were located by the split agent in the report's own paragraph and checked verbatim — review",
            },
      },
      ...r.runs.map((rs) => ({ main: sentenceCase(rs.map((x) => x.text).join(" … ")) })),
    ];
  }
  const texts = r.kind === "translated" ? r.texts : [];
  return texts.map((text, i) => ({
    main: text,
    warning:
      i === 0
        ? {
            code: "SPLIT_TRADOTTO",
            level: "error" as const,
            detail:
              "no verbatim Italian could be found in the report: the parts are an Italian TRANSLATION of the request's notation, not text of the report — verify against the EP's Italian VOT after the vote",
          }
        : undefined,
  }));
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
    /** Set for a second reading: the act the list votes on, article by article. */
    councilPosition?: LoadedCouncilPosition | null;
    /** Told what each model call used, by which agent made it. */
    onUsage?: (agent: "quote-aligner" | "split-agent", u: { input_tokens: number; output_tokens: number }) => void;
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

  const articleEn = articleTextIn(opts.councilPosition ?? null, "en");
  const articleLang = isEnglishList ? articleEn : articleTextIn(opts.councilPosition ?? null, opts.language);

  const amEn = new Map<number, string>();
  const amLang = new Map<number, string>();
  for (const a of opts.amendments) {
    const text = norm(a.amended_text ?? a.original_text ?? "");
    if (!text) continue;
    if (a.language === "en") amEn.set(a.number, text);
    if (a.language === opts.language) amLang.set(a.number, text);
  }

  const agentJobs: Array<{
    row: (typeof splitRows)[number];
    subject: string;
    notation: string[];
    paraEn: string | null;
    paraLang: string | null;
    cut: Awaited<ReturnType<typeof cutParts>>;
  }> = [];

  for (const row of splitRows) {
    const subject = row.subject;
    // The table and the footer name the same vote differently — the table by
    // what is amended, the footer by the amendment — so the row is matched to
    // its request by `splitRequestFor`, not by the characters of the subject.
    const reqEn = splitRequestFor(row, opts.votEn?.splitVotes ?? []);
    const reqLang = splitRequestFor(row, opts.votLang?.splitVotes ?? []);
    if (!reqEn) {
      notes.push({ subject, level: "error", code: "OGGETTO_NON_RISOLTO", detail: "no English VOT request found for this split (splits are tabled on English)" });
      continue;
    }
    if (reqEn.parts.length !== row.splitParts.length) {
      notes.push({ subject, level: "error", code: "OGGETTO_NON_RISOLTO", detail: `the list has ${row.splitParts.length} parts, the English VOT ${reqEn.parts.length}` });
      continue;
    }

    const resolvedEn = resolveSubject(row, paraEn, amEn, articleEn);
    const resolvedLang = isEnglishList ? null : resolveSubject(row, paraLang, amLang, articleLang);
    const langSubject = resolvedLang && !("error" in resolvedLang) ? resolvedLang.text : null;
    const enSubject = "error" in resolvedEn ? null : resolvedEn.text;

    const align: Aligner | null = quoteAlignmentAvailable()
      ? (en, quotes, langPara) => alignQuotes(en, quotes, langPara, opts.language, (u) => opts.onUsage?.("quote-aligner", u))
      : null;
    const cut: Awaited<ReturnType<typeof cutParts>> = enSubject
      ? await cutParts(enSubject, langSubject, reqEn.parts, reqLang?.parts ?? [], isEnglishList, align)
      : { error: { code: "OGGETTO_NON_RISOLTO", detail: (resolvedEn as { error: string }).error } };

    // A list in another language must not be left with the English notation in
    // it. Whatever the plain cut could not finish — an error, or a fall back to
    // the English words — goes to the split agent, which works on the Italian
    // side only. If it gives nothing, the plain result stands, as before.
    const wentEnglish =
      !("error" in cut) && ["RESA_NON_LETTERALE", "VERSIONE_TRADOTTA_ASSENTE"].includes(cut.parts[0]?.warning?.code ?? "");
    if (!isEnglishList && splitAgentAvailable() && ("error" in cut || wentEnglish)) {
      agentJobs.push({ row, subject, notation: reqEn.parts.map((p) => p.text), paraEn: enSubject, paraLang: langSubject, cut });
      continue;
    }
    if ("error" in cut) {
      notes.push({ subject, level: "error", code: cut.error.code, detail: cut.error.detail });
      continue;
    }
    applyParts(row, cut.parts, subject, notes);
  }

  // The agent's rows together: each is one call (up to three tries inside it),
  // and they do not depend on one another.
  const results = await Promise.all(
    agentJobs.map((j) =>
      splitAgent({
        subject: j.subject,
        language: opts.language,
        notationEn: j.notation,
        paraEn: j.paraEn,
        paraLang: j.paraLang,
        onUsage: (u) => opts.onUsage?.("split-agent", u),
      }),
    ),
  );
  for (const [i, j] of agentJobs.entries()) {
    const r = results[i];
    const parts = r ? agentParts(r, j.paraLang) : [];
    if (parts.length === j.row.splitParts.length) {
      applyParts(j.row, parts, j.subject, notes);
    } else if ("error" in j.cut) {
      notes.push({ subject: j.subject, level: "error", code: j.cut.error.code, detail: j.cut.error.detail });
    } else {
      applyParts(j.row, j.cut.parts, j.subject, notes);
    }
  }

  return notes;
}
