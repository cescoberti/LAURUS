/**
 * The split agent: the Italian (or other-language) version of a split request
 * that the plain cut could not produce. SERVER ONLY.
 *
 * A split is tabled and printed in English: the footer of the EP's list says
 * "1st part: Text as a whole excluding the words “…”". The list LAURUS hands
 * back is in the member's language, so each part has to be rendered there, and
 * an English notation in an Italian list is no use to anyone.
 *
 * `expandSplits.ts` does the exact cut when it can (cut on the English
 * paragraph, recomposition checked) and uses `alignQuotes` to find the Italian
 * words. This agent takes over exactly the rows that path leaves behind — the
 * quote does not match the paragraph word for word, the Italian splits one
 * quote across two places, the report text could not be read — and its job is
 * only the Italian side: which words of the Italian paragraph are the ones the
 * English request names.
 *
 * Two outcomes, and the difference is never hidden:
 *
 *   located     the words are copied from the Italian paragraph. Held to a hard
 *               check before they are accepted: every run occurs exactly once
 *               in the paragraph, none overlaps another. The agent is shown
 *               what failed and tries again, up to three times. The text on the
 *               list is therefore the EP's own; only the selection is automatic.
 *   translated  nothing could be pinned down, so the notation itself is put
 *               into Italian. That is a translation, not the report's text, and
 *               it is reported as such. It is the one place LAURUS writes words
 *               the EP did not publish, and the only reason is that a split
 *               request exists in English alone.
 *
 * Needs ANTHROPIC_API_KEY; without it the function returns null and the caller
 * keeps its own result.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";
const ATTEMPTS = 3;

export function splitAgentAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface SplitAgentInput {
  /** `§ 42`, `Recital E`, `Am 7` — for the agent's orientation only. */
  subject: string;
  /** Language code of the list: `it`. */
  language: string;
  /** The notation of every part as the EP's list prints it, English, part 1 first. */
  notationEn: string[];
  /** The English text the split cuts, when it could be read. */
  paraEn: string | null;
  /** The same text in the list's language, when it could be read. */
  paraLang: string | null;
}

/** A stretch of the target paragraph: where it starts, and whether the same words occur elsewhere too. */
export interface LocatedRun {
  text: string;
  at: number;
  /** The words occur more than once in the paragraph; which one is meant is the agent's reading. */
  repeated: boolean;
}

export type SplitAgentResult =
  /** One list of verbatim runs per part after the first, in part order. */
  | { kind: "located"; runs: LocatedRun[][]; attempts: number }
  /** The notation of every part, part 1 included, in the list's language. */
  | { kind: "translated"; texts: string[] };

const SYSTEM = `You prepare the version, in the language of a voting list, of a split-vote request of the European Parliament.
A split divides one paragraph, recital or amendment into parts voted separately. The request exists in English only. Part 1 is "the text as a whole excluding the words X" (or the text without them); each later part is the excluded words, or "these words". A part may also carry a tag such as [ROLL-CALL VOTE] — it is not part of the words, ignore it.
You are given the notation of every part in English, the English paragraph, and the same paragraph in the target language.
YOUR JOB: for each part AFTER THE FIRST, return the words of the TARGET-LANGUAGE paragraph that correspond to the words the English notation names.
Rules:
- Each run is copied VERBATIM from the target-language paragraph: its exact spelling, punctuation and spacing. Never paraphrase, never translate yourself, never merge, never shorten.
- A run is a string, normally one that occurs exactly once in the target paragraph. When the quoted words occur SEVERAL times in the paragraph (a clause that ends "… the Union budget;" twice), give an object instead: {"text": "...", "occurrence": N} with N the 1-based position of the occurrence the request means, counting in the paragraph. Choose it from the English: the same words occur in the English paragraph in the same order, so the N-th English occurrence the request points to is the N-th in the target. When the English is just as ambiguous, take the LAST occurrence and say nothing more: the list will flag it.
- A quote abbreviated with "…" ("emphasises that unpaid … labour market policies,") is ONE contiguous run in the target paragraph, from the equivalent of its first words to the equivalent of its last.
- If the target language renders one English quote in two separate places, give those runs in the order of the paragraph, in the same part's list.
- Runs of different parts must not overlap.
- A quote may differ slightly from the English paragraph (punctuation, a dropped word): the paragraph is the reference for what is meant.
Answer with ONE JSON object and nothing else:
{"runs": [["run" | {"text": "...", "occurrence": N}, ...], ...]}   one list per part after the first, in part order
If, and only if, there is no target-language paragraph, or you are told the words cannot be located, answer instead:
{"translations": ["...", ...]}   the notation of EVERY part (part 1 included) translated into the target language, one string per part, keeping the quoted words in quotation marks; do not add or drop anything.`;

/** Count non-overlapping occurrences of `needle` in `hay`. */
function occurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** The check every located run must pass; returns what failed, in words the agent can act on. */
function verifyRuns(paraLang: string, runs: unknown, parts: number): { ok: true; runs: LocatedRun[][] } | { ok: false; problems: string[] } {
  if (!Array.isArray(runs) || runs.length !== parts - 1) {
    return { ok: false, problems: [`expected ${parts - 1} list(s) of runs (one per part after the first), got ${Array.isArray(runs) ? runs.length : "something else"}`] };
  }
  const problems: string[] = [];
  const clean: LocatedRun[][] = [];
  runs.forEach((list, i) => {
    const label = `part ${i + 2}`;
    if (!Array.isArray(list) || list.length === 0) {
      problems.push(`${label}: needs a non-empty list`);
      clean.push([]);
      return;
    }
    const these: LocatedRun[] = [];
    for (const r of list as unknown[]) {
      const text = (typeof r === "string" ? r : (r as { text?: unknown } | null)?.text);
      const want = typeof r === "string" ? null : Number((r as { occurrence?: unknown } | null)?.occurrence);
      if (typeof text !== "string" || !text.trim()) {
        problems.push(`${label}: a run must be a string or {"text", "occurrence"}`);
        continue;
      }
      const run = text.trim();
      const n = occurrences(paraLang, run);
      if (n === 0) {
        problems.push(`${label}: "${run.slice(0, 80)}" is not in the target paragraph word for word`);
        continue;
      }
      if (want === null && n > 1) {
        problems.push(`${label}: "${run.slice(0, 80)}" occurs ${n} times in the target paragraph — give {"text", "occurrence"} saying which`);
        continue;
      }
      const nth = want ?? 1;
      if (!Number.isInteger(nth) || nth < 1 || nth > n) {
        problems.push(`${label}: "${run.slice(0, 80)}" occurs ${n} time(s); occurrence ${want} does not exist`);
        continue;
      }
      let at = -1;
      for (let k = 0; k < nth; k++) at = paraLang.indexOf(run, at + 1);
      these.push({ text: run, at, repeated: n > 1 });
    }
    clean.push(these);
  });
  const spans = clean.flat().sort((a, b) => a.at - b.at);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i]!.at < spans[i - 1]!.at + spans[i - 1]!.text.length) {
      problems.push(`"${spans[i]!.text.slice(0, 60)}" overlaps "${spans[i - 1]!.text.slice(0, 60)}"`);
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, runs: clean };
}

function jsonOf(text: string): Record<string, unknown> | null {
  const raw = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The Italian version of one split row, or null when the service is not
 * configured or every call failed (the caller keeps what it had).
 */
export async function splitAgent(input: SplitAgentInput): Promise<SplitAgentResult | null> {
  if (!splitAgentAvailable() || input.notationEn.length < 2) return null;
  const client = new Anthropic();
  const parts = input.notationEn.length;

  type Msg = { role: "user" | "assistant"; content: string };
  const messages: Msg[] = [
    {
      role: "user",
      content:
        `Target language: ${input.language}\nSubject: ${input.subject}\n\n` +
        `Notation of the ${parts} parts (English, as the EP's list prints it):\n${input.notationEn.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\n` +
        `English paragraph:\n${input.paraEn ?? "(not available)"}\n\n` +
        `Target-language paragraph (${input.language}):\n${input.paraLang ?? "(not available)"}`,
    },
  ];

  async function ask(): Promise<string | null> {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 3000,
        output_config: { effort: "medium" },
        system: SYSTEM,
        messages,
      });
      if (response.stop_reason !== "end_turn") return null;
      let text = "";
      for (const block of response.content) if (block.type === "text") text += block.text;
      return text;
    } catch {
      return null;
    }
  }

  const translations = (obj: Record<string, unknown> | null): SplitAgentResult | null => {
    const t = obj?.translations;
    return Array.isArray(t) && t.length === parts && t.every((x) => typeof x === "string" && x.trim())
      ? { kind: "translated", texts: (t as string[]).map((x) => x.trim()) }
      : null;
  };

  // No target paragraph: nothing to locate, so the notation is translated.
  if (!input.paraLang) {
    const text = await ask();
    return text ? translations(jsonOf(text)) : null;
  }

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const text = await ask();
    if (text === null) return null;
    const obj = jsonOf(text);
    const verdict = verifyRuns(input.paraLang, obj?.runs, parts);
    if (verdict.ok) return { kind: "located", runs: verdict.runs, attempts: attempt };
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content:
        `The check failed:\n- ${verdict.problems.join("\n- ")}\n` +
        (attempt < ATTEMPTS
          ? `Correct only what is listed and answer again with the full JSON.`
          : `Answer once more with the full JSON. If the words cannot be located, answer with "translations" instead.`),
    });
  }
  // Last turn: it either located them on the third try (returned above) or was
  // given the way out. Take the translations it offers, if it offers them.
  const last = await ask();
  return last ? translations(jsonOf(last)) : null;
}
