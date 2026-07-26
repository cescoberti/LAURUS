/**
 * Parser for the official per-sitting "Results of votes" XML (VOT).
 *
 * Extracted from the ingest so that BOTH the ingest and the voting-list
 * verifier parse the source the same way — the verifier re-downloads the same
 * file and re-derives the requests independently, then compares.
 *
 * Source: https://data.europarl.europa.eu/distribution/doc/PV-10-YYYY-MM-DD-VOT_<lang>.xml
 *
 * Server-only (pulls in fast-xml-parser): import from "@laurus/parser/vot-xml",
 * never from the client-safe barrel.
 */
import { XMLParser } from "fast-xml-parser";

// ---------------------------------------------------------------------------
// XML shapes (only what we read; fast-xml-parser output)
// ---------------------------------------------------------------------------

interface XmlGroupBlock {
  title?: string;
  politicalGroups?: { label?: string };
  translation?: string;
}

interface XmlSplitItem {
  title?: string;
  parts?: { part?: Array<{ partSection?: string; partValue?: string }> | { partSection?: string; partValue?: string } };
}

interface XmlRemark {
  remarkRollCalls?: { RemarkRollCallSeparated?: XmlGroupBlock[] | XmlGroupBlock };
  remarkSeparateds?: { RemarkRollCallSeparated?: XmlGroupBlock[] | XmlGroupBlock };
  remarkSplitVotes?: {
    remarkSplitVote?:
      | Array<{ politicalGroups?: { label?: string }; items?: { item?: XmlSplitItem[] | XmlSplitItem } }>
      | { politicalGroups?: { label?: string }; items?: { item?: XmlSplitItem[] | XmlSplitItem } };
  };
}

export interface VotSplitRequestFull {
  group: string;
  subject: string;
  parts: Array<{ section: string; text: string }>;
}

export interface VotPayload {
  itemTitle?: string;
  splitVotes: VotSplitRequestFull[];
  separateVotes: Array<{ group: string; targets: string }>;
  rollCalls: Array<{ group: string; targets: string }>;
}

/** One parsed `<vote>`: the report code(s) it cites and its request payload. */
export interface VotVote {
  label: string;
  codes: string[];
  payload: VotPayload;
}

const arr = <T>(v: T[] | T | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function groupLabel(b: XmlGroupBlock): string {
  return (b.politicalGroups?.label ?? b.title ?? "").replace(/:\s*$/, "").trim();
}

/** Extract the structured payload from one parsed `<vote>` element. */
export function payloadFromVote(vote: Record<string, unknown>): VotPayload | null {
  const remarks = (vote.remarks as { remark?: XmlRemark[] | XmlRemark } | undefined)?.remark;
  const out: VotPayload = { splitVotes: [], separateVotes: [], rollCalls: [] };
  const title = (vote.title as string | undefined) ?? undefined;
  if (title) out.itemTitle = String(title);

  for (const remark of arr(remarks)) {
    for (const rc of arr(remark.remarkRollCalls?.RemarkRollCallSeparated)) {
      const g = groupLabel(rc);
      if (g && rc.translation) out.rollCalls.push({ group: g, targets: String(rc.translation).trim() });
    }
    for (const sep of arr(remark.remarkSeparateds?.RemarkRollCallSeparated)) {
      const g = groupLabel(sep);
      if (g && sep.translation) out.separateVotes.push({ group: g, targets: String(sep.translation).trim() });
    }
    for (const sv of arr(remark.remarkSplitVotes?.remarkSplitVote)) {
      const g = (sv.politicalGroups?.label ?? "").replace(/:\s*$/, "").trim();
      for (const item of arr(sv.items?.item)) {
        const parts = arr(item.parts?.part)
          .map((p) => ({
            section: String(p.partSection ?? "").trim(),
            text: String(p.partValue ?? "").trim().replace(/^"|"$/g, ""),
          }))
          .filter((p) => p.text);
        if (parts.length) {
          out.splitVotes.push({ group: g || "—", subject: String(item.title ?? "").trim(), parts });
        }
      }
    }
  }

  if (!out.splitVotes.length && !out.separateVotes.length && !out.rollCalls.length) return null;
  return out;
}

/** All report codes cited in a vote label, e.g. "Relazione: X (A10-0170/2026)". */
export function codesFromLabel(label: string): string[] {
  return [...label.matchAll(/\b([A-Z]+\d+-\d+\/\d{4})\b/g)].map((m) => m[1]!);
}

/** Parse a whole VOT XML file into the votes that carry vote requests. */
export function parseVotXml(xml: string): VotVote[] {
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: false });
  const doc = parser.parse(xml) as Record<string, unknown>;
  const sitting = (doc.file as Record<string, unknown> | undefined)?.sitting as Record<string, unknown> | undefined;
  const votes = arr((sitting?.votes as Record<string, unknown> | undefined)?.vote) as Array<Record<string, unknown>>;

  const out: VotVote[] = [];
  for (const vote of votes) {
    const payload = payloadFromVote(vote);
    if (!payload) continue;
    const label = String(vote.label ?? "");
    out.push({ label, codes: codesFromLabel(label), payload });
  }
  return out;
}
