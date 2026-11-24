/**
 * What the model calls of one voting list cost, written down. SERVER ONLY.
 *
 * Every route that expands splits runs the quote aligner and the split agent,
 * so every route records what they used — one event per list, with the user and
 * the item, which is what the admin's Usage and Agents pages add up. A route
 * that ran the agents and did not record it would leave a hole in the cost.
 */
import { SPLIT_EVENT, SPLIT_MODEL, addSpend, costUsd, emptySpend, type SpendKey, type TokenUse } from "@/lib/agents";
import { logEvent } from "@/lib/track";
import type { SplitExpansionNote } from "./expandSplits";

/** Which door the list went out through. */
export type SplitVia = "email" | "download" | "bundle";

export function startSplitSpend() {
  const spend = emptySpend();
  return { spend, onUsage: (agent: SpendKey, u: TokenUse) => addSpend(spend, agent, u) };
}

export async function recordSplitRun(opts: {
  userId: string;
  itemCode: string;
  language: string;
  via: SplitVia;
  notes: SplitExpansionNote[];
  spend: ReturnType<typeof emptySpend>;
}): Promise<void> {
  const { spend, notes } = opts;
  const calls = spend["quote-aligner"].calls + spend["split-agent"].calls;
  if (!notes.length && !calls) return;
  const n = (c: string) => notes.filter((x) => x.code === c).length;
  await logEvent(SPLIT_EVENT, {
    userId: opts.userId,
    itemCode: opts.itemCode,
    meta: {
      language: opts.language,
      via: opts.via,
      aligned: n("RESA_AUTOMATICA"),
      agent: n("SPLIT_AGENTE"),
      repeated: n("SPLIT_AGENTE_OCCORRENZA"),
      translated: n("SPLIT_TRADOTTO"),
      errors: notes.filter((x) => x.level === "error").length,
      // What the model calls of this list used and cost: the Agents and Usage pages add it up.
      spend,
      model: SPLIT_MODEL,
      usd: costUsd(
        SPLIT_MODEL,
        spend["quote-aligner"].input + spend["split-agent"].input,
        spend["quote-aligner"].output + spend["split-agent"].output,
      ),
    },
  });
}
