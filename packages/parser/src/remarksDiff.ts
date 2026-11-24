/**
 * Build the Remarks text for a voting-list row in the advisor convention
 * observed in real Tabling Service lists (STREIT fixture):
 *
 *   - text an amendment ADDS is bold;
 *   - text it DELETES stays visible but struck through;
 *   - untouched text is plain (the whole column renders italic anyway).
 *
 * The published EP amendment gives the "present" and "amended" column texts;
 * a word-level LCS diff between them yields exactly which words were added or
 * removed. Deterministic — no interpretation, no invented text.
 *
 * Output is light HTML using only <b> and <s> (input rich runs are reduced to
 * plain words first so the diff, not the EP bold-italic markers, decides the
 * styling — the two conventions overlap but the diff is the source of truth).
 */

function words(s: string): string[] {
  // Split keeping punctuation attached to words; newlines are word boundaries
  // but preserved as explicit tokens so paragraph structure survives.
  return s
    .replace(/<[^>]+>/g, "")
    .split(/(\n)|\s+/)
    .filter((w): w is string => !!w);
}

type Op = { op: "same" | "add" | "del"; token: string };

/** Word-level diff via LCS (fine for amendment-sized texts). */
function diffWords(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // LCS table (n and m are amendment-paragraph sized; hard cap for safety)
  if (n * m > 4_000_000) {
    // Degenerate fallback: full replace.
    return [...a.map((t) => ({ op: "del" as const, token: t })), ...b.map((t) => ({ op: "add" as const, token: t }))];
  }
  const dp = new Uint32Array((n + 1) * (m + 1));
  const idx = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[idx(i, j)] = a[i] === b[j] ? dp[idx(i + 1, j + 1)]! + 1 : Math.max(dp[idx(i + 1, j)]!, dp[idx(i, j + 1)]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: "same", token: a[i]! });
      i++;
      j++;
    } else if (dp[idx(i + 1, j)]! >= dp[idx(i, j + 1)]!) {
      ops.push({ op: "del", token: a[i]! });
      i++;
    } else {
      ops.push({ op: "add", token: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ op: "del", token: a[i++]! });
  while (j < m) ops.push({ op: "add", token: b[j++]! });
  return ops;
}

function render(ops: Op[]): string {
  // Group consecutive same-op tokens, then wrap each group once.
  const groups: Array<{ op: Op["op"] | "break"; tokens: string[] }> = [];
  for (const { op, token } of ops) {
    if (token === "\n") {
      groups.push({ op: "break", tokens: [] });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.op === op) last.tokens.push(token);
    else groups.push({ op, tokens: [token] });
  }

  return groups
    .map((g) => {
      if (g.op === "break") return "\n";
      const text = g.tokens.join(" ");
      if (g.op === "add") return `<b>${text}</b>`;
      if (g.op === "del") return `<s>${text}</s>`;
      return text;
    })
    .join(" ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/ +/g, " ")
    .trim();
}

/**
 * Remarks for one amendment.
 *  - pure addition (no original): whole text bold;
 *  - pure deletion (no amended): whole original struck through;
 *  - modification: word diff (deleted → <s>, added → <b>).
 */
export function remarksFor(originalText?: string | null, amendedText?: string | null): string {
  const orig = (originalText ?? "").trim();
  const amend = (amendedText ?? "").trim();
  if (!orig && !amend) return "";
  if (!orig) return `<b>${words(amend).join(" ").replace(/\n /g, "\n")}</b>`;
  if (!amend) return `<s>${words(orig).join(" ").replace(/\n /g, "\n")}</s>`;
  return render(diffWords(words(orig), words(amend)));
}

// ---------------------------------------------------------------------------
// The two columns, quoted as they are
// ---------------------------------------------------------------------------

/** How the Remarks column quotes an amendment. */
export type RemarksStyle = "columns" | "diff";

/** The published amendment as the Remarks column needs it. */
export interface AmendmentColumns {
  originalText?: string | null;
  amendedText?: string | null;
  /** The same two columns with the EP's own inline formatting (<b>/<i>/<s>). */
  originalRich?: string | null;
  amendedRich?: string | null;
  /** The EP's own headings over the two columns, in the document's language. */
  originalHeader?: string | null;
  amendedHeader?: string | null;
}

/** One side of a diff: its own words, the ones it does not share in bold. */
function side(ops: Op[], mine: "del" | "add"): string {
  const groups: Array<{ op: "bold" | "plain" | "break"; tokens: string[] }> = [];
  for (const { op, token } of ops) {
    if (op !== "same" && op !== mine) continue; // a word of the other column
    if (token === "\n") {
      groups.push({ op: "break", tokens: [] });
      continue;
    }
    const here = op === mine ? "bold" : "plain";
    const last = groups[groups.length - 1];
    if (last && last.op === here) last.tokens.push(token);
    else groups.push({ op: here, tokens: [token] });
  }
  return groups
    .map((g) => (g.op === "break" ? "\n" : g.op === "bold" ? `<b>${g.tokens.join(" ")}</b>` : g.tokens.join(" ")))
    .join(" ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/ +/g, " ")
    .trim();
}

/** `header` over `text`, as the published amendment prints the column. */
function headed(header: string | null | undefined, text: string): string {
  const h = (header ?? "").trim();
  return h ? `<u>${h}</u>\n${text}` : text;
}

/**
 * Remarks as the two columns of the published amendment, one under the other:
 *
 *     Proposta di risoluzione
 *     2. prende atto … delle ammende **in materia di concorrenza** …
 *
 *     Emendamento
 *     2. prende atto … delle ammende **definitive e delle penalità di mora** …
 *
 * The amendment copied, not re-written: each column is the EP's own text under
 * the EP's own heading, so an advisor reads in the voting list exactly what the
 * amendment file shows, in the same order and the same words.
 *
 * The words the amendment touches are bold, which is how the template prints
 * them. Where the file's own runs were kept (`…Rich`) they are used as they
 * are; where only the plain text is held, the bold is derived from the word
 * diff — the EP marks exactly what changes, so the two agree.
 *
 * A column the amendment leaves empty — a new paragraph has no present text —
 * is left out, as the file leaves it blank.
 */
export function remarksColumns(columns: AmendmentColumns): string {
  const origRich = (columns.originalRich ?? "").trim();
  const amendRich = (columns.amendedRich ?? "").trim();
  const orig = words((columns.originalText ?? "").trim());
  const amend = words((columns.amendedText ?? "").trim());

  // Only diffed when a column's own runs are missing; one side can be the
  // file's and the other derived.
  const ops = origRich && amendRich ? null : diffWords(orig, amend);
  const left = origRich || (orig.length ? (ops ? side(ops, "del") : "") : "");
  const right = amendRich || (amend.length ? (ops ? side(ops, "add") : "") : "");

  const blocks: string[] = [];
  if (left) blocks.push(headed(columns.originalHeader, left));
  if (right) blocks.push(headed(columns.amendedHeader, right));
  return blocks.join("\n\n");
}

/**
 * Remarks in the style the member asked for: the two columns quoted one under
 * the other (the default), or the single merged text where what the amendment
 * removes is struck through and what it adds is bold.
 */
export function remarksIn(style: RemarksStyle, columns: AmendmentColumns): string {
  return style === "diff"
    ? remarksFor(columns.originalText, columns.amendedText)
    : remarksColumns(columns);
}
