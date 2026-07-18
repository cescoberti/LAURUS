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
