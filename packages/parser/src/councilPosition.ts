/**
 * The Council position at first reading — the text a SECOND READING votes on.
 *
 * In second reading Parliament does not vote on a motion of its own: it votes
 * on the act as the Council settled it, article by article. So a voting list
 * for a recommendation for second reading names its subjects that way —
 * "Article 5, § 1, point 31", "Article 180, § 4" — and neither the report
 * (which in an early-second-reading agreement says only "Approves the Council
 * position") nor the amendment store holds a single word of that text. Without
 * this module every such row is an empty Remarks cell and every split on it is
 * OGGETTO_NON_RISOLTO, which is what A10-0297/2026 (MONTSERRAT) did.
 *
 * The position itself is published by the Council, not by Parliament: the
 * report's own DocRef carries the document number — "(07106/2/2026 –
 * C10-0244/2026 – 2023/0132(COD))" — and the public register serves it as a
 * PDF per language. The caller fetches and extracts; everything here is text.
 */

export interface CouncilPositionRef {
  /** Council document number, e.g. 7106. */
  number: number;
  /** Revision, e.g. 2 in "07106/2/2026"; null for the original. */
  revision: number | null;
  year: number;
}

/**
 * The Council position a report is a recommendation on, read from its text.
 *
 * The shape is the EP's own reference line: the Council document, the C-number
 * under which Parliament received it, and the procedure file. The C-number is
 * what makes it unambiguous — "2023/0132(COD)" is also two numbers and a year,
 * and only the Council document is ever followed by one.
 */
export function councilPositionRef(reportText: string): CouncilPositionRef | null {
  const m = /\(\s*0*(\d{3,5})(?:\/(\d+))?\/(\d{4})\s*[–—-]\s*C\d/.exec(reportText);
  if (!m) return null;
  return { number: Number(m[1]), revision: m[2] ? Number(m[2]) : null, year: Number(m[3]) };
}

/** Where the Council's public register serves that position, in `language`. */
export function councilPositionUrl(ref: CouncilPositionRef, language: string): string {
  const version = ref.revision === null ? "INIT" : `REV-${ref.revision}`;
  return `https://data.consilium.europa.eu/doc/document/ST-${ref.number}-${ref.year}-${version}/${language.toLowerCase()}/pdf`;
}

// ---------------------------------------------------------------------------
// The text, as a tree of numbered things
// ---------------------------------------------------------------------------

export interface PositionNode {
  /** '5', '1', '31', 'b', 'ii' — as printed, without its brackets. */
  label: string;
  /** The node's own lines, not its children's. */
  own: string;
  children: PositionNode[];
}

export interface CouncilPosition {
  /** One per article, in document order. An article printed twice is dropped. */
  articles: Map<string, PositionNode>;
  /** Article numbers that appear as a heading more than once — never guessed at. */
  ambiguous: Set<string>;
}

/** The word that opens an article heading, in the languages LAURUS serves. */
const ARTICLE_WORD =
  /^(?:article|articolo|artikel|artículo|artigo|artikkel|artikla|άρθρο|статия|článek|artikkel|straipsnis|pants|artikolu|artykuł|articol|članak|člen|cikk|airteagal)\s+(\d+[a-z]?)$/i;

/**
 * A page's furniture: the Council stamp with its page number and the language
 * code beside it — which the PDF draws first, so they come out at the HEAD of
 * the page's text, not the foot — and the footnotes, which do sit at the end.
 * Left in, each would be read as the continuation of whatever sentence the
 * page break interrupted.
 */
const PAGE_STAMP = /^\d{3,6}\/.*\s\d{1,4}$/;
const PAGE_LANG = /^[A-Z]{2}$/;
const FOOTNOTE = /^\d{1,3}\s+[(\p{Lu}]/u;

/** One label at the head of a line, with the family it belongs to. */
type Family = "num-dot" | "num" | "letter" | "roman";
interface Labelled {
  family: Family;
  label: string;
  rest: string;
}

const ROMAN = /^[ivxl]{1,6}$/;

function labelOf(line: string): Labelled | null {
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,3})\.\s+(.*)$/.exec(line))) return { family: "num-dot", label: m[1]!, rest: m[2]! };
  // The brackets are a language habit: English prints "(31)" and "(b)", the
  // Italian of the same act "31)" and "b)". Only the closing one is reliable.
  if ((m = /^\(?(\d{1,3})\)\s+(.*)$/.exec(line))) return { family: "num", label: m[1]!, rest: m[2]! };
  if ((m = /^\(?([a-z]{1,2})\)\s+(.*)$/.exec(line))) {
    return { family: ROMAN.test(m[1]!) ? "roman" : "letter", label: m[1]!, rest: m[2]! };
  }
  return null;
}

/** The label that comes before `label` in its family, or null if it is the first. */
function predecessor(family: Family, label: string): string | null {
  if (family === "num-dot" || family === "num") {
    const n = Number(label);
    return n > 1 ? String(n - 1) : null;
  }
  if (family === "letter") {
    if (label.length === 1) return label === "a" ? null : String.fromCharCode(label.charCodeAt(0) - 1);
    // 'aa' follows 'z', 'ab' follows 'aa'.
    const last = label[label.length - 1]!;
    return last === "a" ? "z" : label.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) - 1);
  }
  const order = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
  const at = order.indexOf(label);
  return at > 0 ? order[at - 1]! : null;
}

/**
 * Index a Council position's extracted text by article, paragraph and point.
 *
 * Nesting is read from the numbering itself, not from indentation (which a PDF
 * text extractor does not keep): a label that continues a sequence is a
 * sibling of what it continues, and a label that opens one is a child of
 * whatever is open. That is also what settles "(i)" — it is the letter after
 * "(h)" where a letter sequence is running, and the first roman otherwise.
 *
 * `pages` is the document one string per page, so each page's footnotes and
 * stamp can be taken off before the lines are joined across the break.
 */
export function parseCouncilPosition(pages: string[]): CouncilPosition {
  const position: CouncilPosition = { articles: new Map(), ambiguous: new Set() };

  const lines: string[] = [];
  for (const page of pages) {
    const pageLines = page.split("\n").map((l) => l.replace(/\s+/g, " ").trim());
    // Off the top: the stamp and its language code. Off the end: the footnotes
    // — from the first of them, so the lines they run over go with them.
    let start = 0;
    while (start < pageLines.length && (!pageLines[start] || PAGE_STAMP.test(pageLines[start]!) || PAGE_LANG.test(pageLines[start]!))) start++;
    let end = pageLines.length;
    for (let i = Math.max(start, end - 12); i < end; i++) {
      if (FOOTNOTE.test(pageLines[i]!)) {
        end = i;
        break;
      }
    }
    for (const l of pageLines.slice(start, end)) if (l) lines.push(l);
  }

  // Deepest-first stack of open nodes; the article is its root.
  let stack: Array<{ node: PositionNode; family: Family | null; lastChild: string | null }> = [];
  let article: PositionNode | null = null;

  const close = () => {
    if (!article) return;
    if (position.articles.has(article.label)) position.ambiguous.add(article.label);
    else position.articles.set(article.label, article);
  };

  for (const line of lines) {
    const heading = ARTICLE_WORD.exec(line);
    if (heading) {
      close();
      article = { label: heading[1]!.toLowerCase(), own: "", children: [] };
      stack = [{ node: article, family: null, lastChild: null }];
      continue;
    }
    if (!article) continue;

    const lab = labelOf(line);
    if (!lab) {
      // A continuation of whatever is open — the article's title included.
      const top = stack[stack.length - 1]!;
      top.node.own = top.node.own ? `${top.node.own} ${line}` : line;
      continue;
    }

    // Where it belongs: the deepest open node that this label continues,
    // otherwise a new level under the deepest one.
    const pred = predecessor(lab.family, lab.label);
    let at = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]!.family === lab.family && stack[i]!.lastChild === pred) {
        at = i;
        break;
      }
    }
    if (at < 0 && pred !== null) {
      // A gap in the numbering (or a label that opens nothing): keep it under
      // the deepest node that already holds that family, else the deepest one.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.family === lab.family) {
          at = i;
          break;
        }
      }
    }
    if (at < 0) at = stack.length - 1;

    stack = stack.slice(0, at + 1);
    const parent = stack[at]!;
    const node: PositionNode = { label: lab.label, own: lab.rest, children: [] };
    parent.node.children.push(node);
    parent.family = lab.family;
    parent.lastChild = lab.label;
    stack.push({ node, family: null, lastChild: null });
  }
  close();

  return position;
}

// ---------------------------------------------------------------------------
// Addressing it the way a voting list does
// ---------------------------------------------------------------------------

/** The node's own words plus everything under it, as the act prints it. */
function fullText(node: PositionNode, label = true): string {
  const head = label && node.label ? `${node.label}) ${node.own}`.trim() : node.own;
  const parts = [head, ...node.children.map((c) => fullText(c))];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The text a voting-list subject points at, or null when it cannot be pinned
 * down to exactly one piece of the act — never a guess.
 *
 * Reads the subject as a path: "Article 5, § 1, point 32, point b" walks
 * article 5, paragraph 1, point 32, point b, and the EP's "introductory part"
 * (the table abbreviates it "intro") asks for a node's own words without the
 * points hanging under it.
 */
export function articleTextFor(subject: string, position: CouncilPosition): string | null {
  const parts = subject
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const head = ARTICLE_WORD.exec(parts[0]?.replace(/[.;]$/, "") ?? "");
  if (!head) return null;
  const number = head[1]!.toLowerCase();
  if (position.ambiguous.has(number)) return null;
  const root = position.articles.get(number);
  if (!root) return null;
  let node: PositionNode = root;

  let introOnly = false;
  for (const step of parts.slice(1)) {
    if (/^(intro|introductory part|chapeau|alinea|parte introduttiva)$/i.test(step)) {
      introOnly = true;
      continue;
    }
    if (introOnly) return null; // nothing comes after the chapeau
    const m = /^(?:§+|paragraph|paragrafo|par\.?|point|points?|punto|letter|lettera|sub-?point|sub-?§)?\s*\(?([0-9]{1,3}|[a-z]{1,3})\)?$/i.exec(step);
    if (!m) return null;
    const label = m[1]!.toLowerCase();
    const matches = node.children.filter((c) => c.label === label);
    if (matches.length !== 1) return null;
    node = matches[0]!;
  }

  const text = introOnly ? node.own.replace(/\s+/g, " ").trim() : fullText(node, false);
  return text || null;
}
