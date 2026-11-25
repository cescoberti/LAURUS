/**
 * Oral amendments: the words the Tabling Service prints under "Miscellaneous"
 * go into the table row that only says "oral amendment", in the list's
 * language. SERVER ONLY.
 *
 * The EP announces an oral amendment in English, in a footer paragraph, with
 * its changes marked (<b> added, <s> deleted). The row it belongs to has an
 * empty Remarks cell. So the text is copied across as printed and, when the
 * list is not English, translated — the one place besides the split agent
 * where LAURUS writes words the EP did not publish, and it says so in the
 * report: a translation is something to read, not the EP's text.
 *
 * Without ANTHROPIC_API_KEY, or if the translation does not pass its check,
 * the English text is put in the cell anyway and reported as an error: the
 * advisor has the words and knows they are not yet in their language.
 */
import Anthropic from "@anthropic-ai/sdk";
import { oralAmendmentsFromNotes, subjectKey, noteText, type AnnotatedVotingList } from "@laurus/parser/voting-list-docx";
import { SPLIT_MODEL } from "../agents";
import type { SplitExpansionNote } from "./expandSplits";

const LANGUAGE_NAME: Record<string, string> = { it: "Italian", en: "English", nl: "Dutch", fr: "French", de: "German", es: "Spanish" };

const SYSTEM = `You translate an oral amendment of the European Parliament into the language of a voting list.
The text carries its changes as light markup: <b>…</b> is text the amendment adds, <s>…</s> is text it deletes, <i>…</i> is italics.
Rules:
- Translate faithfully, in the register of an official EU legal text. Do not improve, correct or explain anything, even an apparent slip in the original.
- Keep every <b>, </b>, <s>, </s>, <i>, </i> tag, around the words that translate what it surrounded. The number of each tag in your answer must equal the number in the original.
- Answer with the translated text only: no quotation marks around it, no comment.`;

const TAGS = /<\/?[bis]>/g;

/** The tags of a text, counted per kind — a translation must carry exactly as many. */
function tagCounts(t: string): string {
  const c: Record<string, number> = {};
  for (const m of t.match(TAGS) ?? []) c[m] = (c[m] ?? 0) + 1;
  return JSON.stringify(Object.entries(c).sort());
}

async function translate(
  text: string,
  language: string,
  onUsage?: (agent: "split-agent", u: { input_tokens: number; output_tokens: number }) => void,
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  const target = LANGUAGE_NAME[language] ?? language;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: SPLIT_MODEL,
        max_tokens: 16000,
        output_config: { effort: "high" },
        system: SYSTEM,
        messages: [{ role: "user", content: `Target language: ${target}\n\n${text}` }],
      });
      onUsage?.("split-agent", response.usage);
      if (response.stop_reason !== "end_turn") continue;
      let out = "";
      for (const block of response.content) if (block.type === "text") out += block.text;
      out = out.trim();
      if (out && tagCounts(out) === tagCounts(text)) return out;
    } catch {
      // try once more, then give up to the English text
    }
  }
  return null;
}

/** Put every announced oral amendment into its row, in the list's language. */
export async function fillOralAmendments(
  vl: AnnotatedVotingList,
  opts: {
    language: string;
    onUsage?: (agent: "split-agent", u: { input_tokens: number; output_tokens: number }) => void;
  },
): Promise<SplitExpansionNote[]> {
  const notes: SplitExpansionNote[] = [];
  const oral = oralAmendmentsFromNotes(vl.notes);
  if (oral.length === 0) return notes;

  for (const req of oral) {
    const key = subjectKey(req.subject);
    const row = vl.rows.find((r) => subjectKey(r.subject) === key && /oral amendment/i.test([r.remarks, r.amNo, r.author, r.voteType].map((c) => noteText(c ?? "")).join(" ")));
    if (!row) {
      notes.push({
        subject: req.subject,
        level: "warning",
        code: "ORALE_RIGA_NON_TROVATA",
        detail: `The list announces an oral amendment by ${req.mep} to ${req.subject}, but no row of the table is marked as one: the text was not placed.`,
      });
      continue;
    }
    if (opts.language === "en") {
      row.remarks = req.text;
      continue;
    }
    // Wherever the list prints the words "oral amendment" (the Remarks cell or
    // a column to its left), the cell that gets the text is Remarks.
    const translated = await translate(req.text, opts.language, opts.onUsage);
    if (translated) {
      row.remarks = translated;
      notes.push({
        subject: row.subject,
        level: "warning",
        code: "ORALE_TRADOTTO",
        detail: `Oral amendment by ${req.mep}: the EP prints it in English only; this is LAURUS's translation into ${opts.language.toUpperCase()}, not an official text. Read it before you rely on it.`,
      });
    } else {
      row.remarks = req.text;
      notes.push({
        subject: row.subject,
        level: "error",
        code: "ORALE_NON_TRADOTTO",
        detail: `Oral amendment by ${req.mep}: the translation into ${opts.language.toUpperCase()} could not be made (or did not pass its check), so the English text of the EP is in the cell.`,
      });
    }
  }
  return notes;
}
