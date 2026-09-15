/**
 * Read an inbound email and turn it into one structured request with the
 * action ready for the admin's approval. SERVER ONLY; needs ANTHROPIC_API_KEY,
 * without it the message waits in the queue untriaged.
 *
 * The model never acts: it fills a form. Whether an invite goes out is the
 * admin's click (an email can be forged), unless a later rule says otherwise.
 */
import Anthropic from "@anthropic-ai/sdk";
import { COMMITTEE_CODES } from "@/lib/committees";
import { EU_LANGUAGE_CODES } from "@/lib/languages";

const MODEL = "claude-opus-5";

export type InboxKind = "document" | "request" | "other";

export interface Analysis {
  kind: InboxKind;
  /** One line, in English, for the queue. */
  summary: string;
  /** Language the email is written in (ISO 639-1). */
  language: string;
  request?: {
    type: "access" | "committees" | "voting_list" | "bug" | "question" | "other";
    full_name?: string | null;
    ep_group?: string | null;
    committees?: string[];
    vl_language?: string | null;
    item_codes?: string[];
  };
  document?: {
    type: "agenda" | "voting_list" | "amendments" | "report" | "other";
    /** e.g. "October 2026 part-session", "A10-0224/2026" */
    about?: string | null;
  };
}

export type ProposedAction =
  | { type: "create_invite"; email: string; full_name: string | null; ep_group: string | null; committees: string[]; vl_language: string; language: string }
  | { type: "update_committees"; email: string; committees: string[] }
  | { type: "file_document"; document_type: NonNullable<Analysis["document"]>["type"]; about: string | null }
  | { type: "reply_needed"; reason: string }
  | { type: "none" };

const SYSTEM = `You triage emails arriving at LAURUS, an internal tool for political-group advisors at the European Parliament.
Two mailboxes: inbox@ receives documents (plenary agendas, voting lists, amendment packs, reports); hello@ receives people (beta testers asking for access, members changing the committees they follow, asking for a voting list, reporting a problem).
Read the email and answer with ONE JSON object and nothing else:
{
  "kind": "document" | "request" | "other",
  "summary": "<one English sentence>",
  "language": "<ISO 639-1 of the email's language>",
  "request": { "type": "access"|"committees"|"voting_list"|"bug"|"question"|"other", "full_name": string|null, "ep_group": string|null, "committees": [EP committee acronyms], "vl_language": ISO code|null, "item_codes": ["A10-0224/2026", ...] } — only when kind = "request",
  "document": { "type": "agenda"|"voting_list"|"amendments"|"report"|"other", "about": string|null } — only when kind = "document"
}
Committee acronyms are the EP's (ECON, CONT, BUDG, ENVI, ...); map names in any language to them ("bilancio" → BUDG, "controllo di bilancio" → CONT). A person who says they "follow" or "cover" committees and has no account is an access request. Never invent an email address, name or group: null when not stated.`;

export function triageAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function triage(input: {
  from: string;
  fromName: string | null;
  to: string;
  subject: string | null;
  text: string | null;
  attachments: Array<{ filename: string; content_type: string }>;
  routeKind: InboxKind;
}): Promise<Analysis | null> {
  if (!triageAvailable()) return null;
  const client = new Anthropic();
  const body = (input.text ?? "").slice(0, 12000);
  let text = "";
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `Mailbox: ${input.to} (routed as "${input.routeKind}")\n` +
            `From: ${input.fromName ? `${input.fromName} <${input.from}>` : input.from}\n` +
            `Subject: ${input.subject ?? "(none)"}\n` +
            `Attachments: ${input.attachments.length ? input.attachments.map((a) => `${a.filename} (${a.content_type})`).join(", ") : "none"}\n\n` +
            `Body:\n${body || "(empty)"}`,
        },
      ],
    });
    for (const block of response.content) if (block.type === "text") text += block.text;
  } catch {
    return null;
  }
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) return null;
  let parsed: Analysis;
  try {
    parsed = JSON.parse(json) as Analysis;
  } catch {
    return null;
  }
  // Keep only what the app knows how to use.
  if (parsed.request?.committees) parsed.request.committees = parsed.request.committees.map((c) => c.toUpperCase()).filter((c) => COMMITTEE_CODES.has(c));
  if (parsed.request?.vl_language && !EU_LANGUAGE_CODES.has(parsed.request.vl_language.toLowerCase())) parsed.request.vl_language = null;
  if (!["document", "request", "other"].includes(parsed.kind)) parsed.kind = input.routeKind;
  return parsed;
}

/** The action a triaged message proposes, given what we already know of the sender. */
export function proposeAction(analysis: Analysis | null, sender: { email: string; knownUser: boolean }): ProposedAction {
  if (!analysis) return { type: "none" };
  if (analysis.kind === "document" && analysis.document) {
    return { type: "file_document", document_type: analysis.document.type, about: analysis.document.about ?? null };
  }
  if (analysis.kind === "request" && analysis.request) {
    const r = analysis.request;
    const lang = (analysis.language || "en").toLowerCase();
    if ((r.type === "access" || r.type === "committees") && !sender.knownUser) {
      return {
        type: "create_invite",
        email: sender.email,
        full_name: r.full_name ?? null,
        ep_group: r.ep_group ?? null,
        committees: r.committees ?? [],
        vl_language: r.vl_language ?? (EU_LANGUAGE_CODES.has(lang) ? lang : "en"),
        language: lang,
      };
    }
    if (r.type === "committees" && sender.knownUser && r.committees?.length) {
      return { type: "update_committees", email: sender.email, committees: r.committees };
    }
    return { type: "reply_needed", reason: analysis.summary };
  }
  return { type: "none" };
}
