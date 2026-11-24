/**
 * Where a quoted run of words sits in a paragraph.
 *
 * A split request names the words it votes by quoting them, and the quote is
 * the Tabling Service's transcription of the report — so it can differ from
 * the report by a word. What is voted is the report's own text, so a quote is
 * resolved to a SPAN of the paragraph, never used as text of its own:
 *
 *   - exactly one literal occurrence: that span;
 *   - an abbreviated quote ("first words … last words"): from the first
 *     fragment to the end of the last one, each located once and in order;
 *   - no occurrence, and only when the caller allows it: the one window of
 *     the paragraph that differs from the quote by at most `allowanceFor`
 *     words, with the differing words reported so the row can say so.
 *
 * Nothing here ever returns text that is not the paragraph's.
 */

/**
 * The words of a string, each with where it sits and a key for comparing
 * (lower case, outer punctuation off).
 */
interface QuoteWord {
  text: string;
  at: number;
  end: number;
  key: string;
}

const OUTER_PUNCT_START = /^[^\p{L}\p{N}]+/u;
const OUTER_PUNCT_END = /[^\p{L}\p{N}]+$/u;

function wordsOf(s: string): QuoteWord[] {
  const out: QuoteWord[] = [];
  for (const m of s.matchAll(/\S+/g)) {
    const text = m[0];
    const at = m.index!;
    out.push({ text, at, end: at + text.length, key: text.toLocaleLowerCase().replace(OUTER_PUNCT_START, "").replace(OUTER_PUNCT_END, "") });
  }
  return out;
}

/** One word the request and the report do not spell the same way. */
export interface QuoteDiff {
  /** As the request quotes it (empty: the report has a word the request leaves out). */
  quoted: string;
  /** As the report writes it (empty: the request has a word the report does not). */
  report: string;
}

/**
 * How many words a quote of `n` words may differ by. A quote of one or two
 * words is never located tolerantly — "increased risk" would match anything.
 */
function allowanceFor(n: number): number {
  if (n < 3) return 0;
  return Math.min(2, Math.max(1, Math.floor(n / 15)));
}

/**
 * Word-level edit distance, abandoned as soon as it must exceed `cap`
 * (a row's minimum is a lower bound on the final distance).
 */
function wordDistance(a: string[], b: string[], cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1);
    cur[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j]! < best) best = cur[j]!;
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Which words differ, read off the alignment of the two word runs. */
function wordDiffs(quote: QuoteWord[], report: QuoteWord[]): QuoteDiff[] {
  const n = quote.length;
  const m = report.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (quote[i - 1]!.key === report[j - 1]!.key ? 0 : 1));
    }
  }
  const diffs: QuoteDiff[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const same = i > 0 && j > 0 && quote[i - 1]!.key === report[j - 1]!.key;
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + (same ? 0 : 1)) {
      if (!same) diffs.push({ quoted: quote[i - 1]!.text, report: report[j - 1]!.text });
      i--;
      j--;
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) {
      diffs.push({ quoted: quote[i - 1]!.text, report: "" });
      i--;
    } else {
      diffs.push({ quoted: "", report: report[j - 1]!.text });
      j--;
    }
  }
  return diffs.reverse();
}

/**
 * Locate a quote the paragraph does not carry word for word.
 *
 * The Tabling Service transcribes the words it quotes, and transcription
 * slips: the request for A10-0261 quotes "plain packages requirements" where
 * the report writes "plain packaging requirements", and "foods associated
 * with increased risk of cancer" where it writes "with an increased risk".
 * What is voted is the report's text, so the span is located tolerantly —
 * the one window of the paragraph that differs from the quote by at most
 * `allowanceFor` words — and only when that window is the UNIQUE best one:
 * a quote that two windows fit equally well is not located at all. What is
 * shown is always the report's own words, and the row is flagged with the
 * words that differ (CITAZIONE_DIFFORME).
 */
function locateApprox(hay: string, quote: string): { at: number; end: number; diffs: QuoteDiff[] } | null {
  const q = wordsOf(quote);
  const h = wordsOf(hay);
  const cap = allowanceFor(q.length);
  if (cap === 0 || h.length === 0 || h.length > 4000) return null;
  const qk = q.map((w) => w.key);
  let best = cap + 1;
  let at = -1;
  let len = 0;
  let ties = 0;
  for (let i = 0; i < h.length; i++) {
    for (let l = Math.max(1, q.length - cap); l <= q.length + cap && i + l <= h.length; l++) {
      const d = wordDistance(qk, h.slice(i, i + l).map((w) => w.key), Math.min(cap, best));
      if (d > cap) continue;
      if (d < best) {
        best = d;
        at = i;
        len = l;
        ties = 1;
      } else if (d === best) ties++;
    }
  }
  // Two windows that fit equally well: which one the request means is written
  // nowhere, so nothing is located.
  if (at < 0 || ties !== 1) return null;
  const win = h.slice(at, at + len);
  const diffs = wordDiffs(q, win);
  // Punctuation the report carries and the quote does not ("… of cancer," for
  // "… of cancer") belongs to the paragraph, not to the words voted.
  const edge = (hayWord: string, quoteWord: string, re: RegExp): number => {
    const hayPunct = re.exec(hayWord)?.[0] ?? "";
    const quotePunct = re.exec(quoteWord)?.[0] ?? "";
    return hayPunct && hayPunct !== quotePunct ? hayPunct.length : 0;
  };
  const first = win[0]!;
  const last = win[win.length - 1]!;
  const from = first.at + edge(first.text, q[0]!.text, OUTER_PUNCT_START);
  const to = last.end - edge(last.text, q[q.length - 1]!.text, OUTER_PUNCT_END);
  if (to <= from) return null;
  return { at: from, end: to, diffs };
}

/**
 * One fragment of a quote, as a span of `hay`: its literal occurrence when
 * there is exactly one, else the tolerant location above.
 */
function locatePiece(
  hay: string,
  piece: string,
  tolerant: boolean,
): { at: number; end: number; diffs: QuoteDiff[] } | { error: { code: string; detail: string } } {
  let p = piece;
  // The request quotes the words with its own closing punctuation ("…
  // policies,") where the paragraph has another ("… policies;"): the words
  // are what is voted, so drop a trailing comma/semicolon that is not there.
  if (occurrences(hay, p) === 0 && /[,;.]$/.test(p) && occurrences(hay, p.slice(0, -1)) === 1) p = p.slice(0, -1);
  const n = occurrences(hay, p);
  if (n === 1) {
    const at = hay.indexOf(p);
    return { at, end: at + p.length, diffs: [] };
  }
  if (n > 1) return { error: { code: "TERMINI_AMBIGUI", detail: `"${p.slice(0, 60)}…" occurs ${n} times in the subject text` } };
  const approx = tolerant ? locateApprox(hay, p) : null;
  if (approx) return approx;
  return { error: { code: "TERMINI_NON_TROVATI", detail: `"${p.slice(0, 60)}…" is not in the subject text` } };
}

/**
 * The literal span of `hay` that a request's quote names.
 *
 * "emphasises that unpaid … labour market policies," → from the first
 * fragment to the end of the last one. Each fragment must be located exactly
 * once, in order. `diffs` is empty when the quote is the paragraph's own
 * words, and names the words that differ when `tolerant` located them.
 */
export function locateQuote(
  hay: string,
  quote: string,
  tolerant: boolean,
): { text: string; diffs: QuoteDiff[] } | { error: { code: string; detail: string } } {
  const pieces = quote.split(/\s*(?:…|\.\.\.)\s*/).map((p) => p.trim()).filter(Boolean);
  if (pieces.length === 0) return { error: { code: "TERMINI_NON_TROVATI", detail: "the request quotes no words" } };
  let from = -1;
  let to = -1;
  const diffs: QuoteDiff[] = [];
  for (const piece of pieces) {
    const got = locatePiece(hay, piece, tolerant);
    if ("error" in got) return { error: got.error };
    if (got.at < to) return { error: { code: "TERMINI_NON_TROVATI", detail: "the abbreviated quote's fragments are not in order in the subject text" } };
    if (from < 0) from = got.at;
    to = got.end;
    diffs.push(...got.diffs);
  }
  return { text: hay.slice(from, to), diffs };
}

/** Count non-overlapping occurrences of `needle` in `hay`. */
export function occurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}
