/**
 * The agents LAURUS runs, in one place — what the admin's Agents panel shows.
 *
 * An "agent" here is anything that puts a model between a source and the
 * product. The list is kept by hand: an agent added to the code is added here
 * too, or it is invisible to the one person who is accountable for it. Each
 * entry says what the agent may do ALONE and what the code checks on its
 * behalf, because those two are what decide whether a mistake reaches a member.
 */

export type Autonomy =
  /** The agent fills a form; a person's click is what makes anything happen. */
  | "proposes"
  /** The agent's output goes into the product, but only after the code has checked it. */
  | "acts-checked";

export interface AgentInfo {
  id: string;
  name: string;
  /** One sentence: what it is for. */
  purpose: string;
  model: string;
  /** What starts it. */
  trigger: string;
  autonomy: Autonomy;
  /** What it may do. */
  does: string[];
  /** What stops a wrong answer. */
  guards: string[];
  /** What happens when it gives nothing (no key, a failed call, a refused check). */
  fallback: string;
  /** Where it lives, for whoever has to change it. */
  source: string;
  /** Where its work can be looked at, when there is such a place. */
  workAt?: { label: string; href: string };
}

export const AGENTS: AgentInfo[] = [
  {
    id: "inbox-triage",
    name: "Inbox triage",
    purpose: "Reads the email that arrives at inbox@ and hello@ and turns it into one request, ready for your approval.",
    model: "claude-opus-5",
    trigger: "An email received (Resend webhook).",
    autonomy: "proposes",
    does: [
      "Classifies the message: document, request or other, with a one-line summary and the language.",
      "Extracts name, group, committees, voting-list language and file codes when the sender states them.",
      "Proposes ONE action: create an invite, update a member's committees, file a document, or note that a reply is needed.",
    ],
    guards: [
      "It never acts: an email can be forged, so an invite goes out only on your click, and you can correct the form first.",
      "Committees and languages are cut down to the codes the app knows; names and addresses are never invented (null when not stated).",
    ],
    fallback: "Without the key, or if the call fails, the message waits in the queue untriaged.",
    source: "lib/inbox/triage.ts",
    workAt: { label: "Open the inbox", href: "/admin/inbox" },
  },
  {
    id: "split-agent",
    name: "Split agent",
    purpose:
      "Gives a split request its version in the list's language when the exact cut cannot finish it — a list is never left with English notation in it.",
    model: "claude-opus-5",
    trigger: "Every voting list generated, for each split row the plain cut could not complete or would leave in English.",
    autonomy: "acts-checked",
    does: [
      "Finds, in the report's own Italian paragraph, the words the English request names, and returns them copied verbatim.",
      "For a quote that occurs more than once in the paragraph, names which occurrence the request means.",
      "As a last resort, puts the notation into Italian — reported as a translation, never as report text.",
    ],
    guards: [
      "Every run must exist in the Italian paragraph word for word; a repeated quote needs its occurrence named; no run may overlap another.",
      "A failed check is read back to the agent, which tries again (three tries).",
      "Whatever it does is a note on the VL report: a located run is a warning to review, a repeated quote asks you to check the occurrence, a translation is an error.",
    ],
    fallback: "With no answer, the row keeps the result of the plain cut, as before the agent existed.",
    source: "lib/annotatedVl/splitAgent.ts",
  },
  {
    id: "quote-aligner",
    name: "Quote aligner",
    purpose: "Before the vote, locates the Italian words that a split's English quote refers to, so the parts can be struck in the Italian paragraph.",
    model: "claude-opus-5",
    trigger: "Every split row the plain cut can resolve on the English side.",
    autonomy: "acts-checked",
    does: ["Returns, for each English quote, one run of the translated paragraph."],
    guards: [
      "A run must be one contiguous stretch of the translated paragraph, occurring exactly once, or it is discarded.",
      "The text on the list is always the report's own: only the selection is automatic, and the report flags it (RESA_AUTOMATICA).",
    ],
    fallback: "A run that cannot be pinned down hands the row to the split agent.",
    source: "lib/annotatedVl/alignQuotes.ts",
  },
];

/** The event the VL route writes after it has expanded the splits of a list. */
export const SPLIT_EVENT = "agent_split";
