/**
 * Find, in the Italian (or other-language) paragraph, the words that an
 * English split request quotes. SERVER ONLY.
 *
 * Before the vote the Tabling Service publishes split requests in English
 * only ("excluding the words 'and fairly remunerated'"); the translated
 * request appears in the VOT after the vote. To strike the right words in the
 * translated paragraph beforehand, the correspondence has to be located —
 * a translation judgement, not a rule — so it is asked of Claude and then
 * held to a hard check: every answer must be one verbatim, contiguous run of
 * the translated paragraph occurring exactly once, or it is discarded and
 * the row keeps the official notation. The text on the list is therefore
 * always the report's own; only the *selection* is automatic, and the
 * verification report says so.
 *
 * Needs ANTHROPIC_API_KEY; without it the function returns null and the
 * caller falls back.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";

const SYSTEM = `You align split-vote requests of the European Parliament across languages.
You are given a paragraph in English, one or more runs of words quoted from it, and the official translation of the same paragraph in another language.
For each quoted English run, return the words of the translated paragraph that render it — copied VERBATIM and CONTIGUOUSLY from the translated paragraph, with its exact spelling, punctuation and spacing. Never paraphrase, never translate yourself, never merge or shorten.
If a run has no contiguous equivalent in the translation, return null for it.
Answer with a JSON array of strings or nulls, one entry per quoted run, in the same order, and nothing else.`;

export function quoteAlignmentAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Count non-overlapping occurrences of `needle` in `hay`. */
function occurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/**
 * One translated run per English quote, or null where none could be pinned
 * down. Returns null altogether when the service is not configured or fails.
 */
export async function alignQuotes(
  enParagraph: string,
  quotesEn: string[],
  langParagraph: string,
  language: string,
): Promise<Array<string | null> | null> {
  if (!quoteAlignmentAvailable() || quotesEn.length === 0) return null;
  const client = new Anthropic();
  let text = "";
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `English paragraph:\n${enParagraph}\n\n` +
            `Quoted runs (${quotesEn.length}):\n${quotesEn.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n` +
            `Translated paragraph (${language}):\n${langParagraph}`,
        },
      ],
    });
    if (response.stop_reason !== "end_turn") return null;
    for (const block of response.content) if (block.type === "text") text += block.text;
  } catch {
    return null;
  }

  const json = /\[[\s\S]*\]/.exec(text)?.[0];
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== quotesEn.length) return null;

  // The hard check: verbatim, contiguous, unique — or nothing.
  return parsed.map((v) => {
    if (typeof v !== "string") return null;
    const run = v.trim();
    return run && occurrences(langParagraph, run) === 1 ? run : null;
  });
}
