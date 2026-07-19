/**
 * Ingest the official per-sitting "Results of votes" XML (VOT) and store, per
 * item and language, the vote-request data group advisors need:
 *
 *   - split-vote requests WITH THE FULL TEXT of each part (partValue),
 *   - separate-vote requests,
 *   - roll-call requests,
 *
 * all localised (the _it.xml carries Italian subjects and part texts).
 *
 *   npm run sync-vot -- 2026            # languages = union of member prefs
 *   npm run sync-vot -- 2026 it,en      # explicit
 *
 * Source: deterministic distribution path
 *   https://data.europarl.europa.eu/distribution/doc/PV-10-YYYY-MM-DD-VOT_<lang>.xml
 * (missing days → 404 → skipped). Items are matched by the report code(s)
 * cited in each <vote> label. Idempotent: upsert on (item_id, language).
 */
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";
import { fetchBytes } from "./httpFetch.ts";

const YEAR = Number(process.argv[2] ?? new Date().getFullYear());
const LANGS_ARG = (process.argv[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const BASE = "https://data.europarl.europa.eu";
const TERM = 10;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "laurus" },
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const arr = <T>(v: T[] | T | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function groupLabel(b: XmlGroupBlock): string {
  return (b.politicalGroups?.label ?? b.title ?? "").replace(/:\s*$/, "").trim();
}

/** Extract the structured payload from one parsed <vote> element. */
function payloadFromVote(vote: Record<string, unknown>): VotPayload | null {
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
function codesFromLabel(label: string): string[] {
  return [...label.matchAll(/\b([A-Z]+\d+-\d+\/\d{4})\b/g)].map((m) => m[1]!);
}

async function main() {
  const { data: run } = await supabase
    .from("ingestion_runs")
    .insert({ source: `ep-api:vot:${YEAR}` })
    .select("id")
    .single();

  try {
    let LANGS = LANGS_ARG;
    if (LANGS.length === 0) {
      const { data: userLangs } = await supabase.from("users").select("languages");
      LANGS = [...new Set((userLangs ?? []).flatMap((u) => (u.languages as string[]) ?? []))];
      if (LANGS.length === 0) LANGS = ["it", "en"];
    }

    // Sitting days = every day inside the year's part-sessions.
    const { data: sessions, error: sessErr } = await supabase
      .from("sessions")
      .select("start_date, end_date")
      .gte("start_date", `${YEAR}-01-01`)
      .lte("start_date", `${YEAR}-12-31`);
    if (sessErr || !sessions) throw new Error(`sessions read: ${sessErr?.message}`);
    const days: string[] = [];
    for (const s of sessions) {
      for (let t = Date.parse(s.start_date); t <= Date.parse(s.end_date); t += 86_400_000) {
        days.push(new Date(t).toISOString().slice(0, 10));
      }
    }
    days.sort();

    // Items lookup by code.
    const { data: items, error: itemErr } = await supabase.from("items").select("id, code");
    if (itemErr || !items) throw new Error(`items read: ${itemErr?.message}`);
    const itemByCode = new Map(items.map((i) => [i.code, i.id]));

    const parser = new XMLParser({ ignoreAttributes: false, trimValues: false });
    let stored = 0;
    let daysWithVot = 0;

    for (const day of days) {
      for (const lang of LANGS) {
        const url = `${BASE}/distribution/doc/PV-${TERM}-${day}-VOT_${lang}.xml`;
        let res;
        try {
          res = await fetchBytes(url);
        } catch {
          continue;
        }
        if (res.status !== 200) continue;
        daysWithVot++;

        let doc: Record<string, unknown>;
        try {
          doc = parser.parse(res.body.toString("utf8"));
        } catch (err) {
          console.warn(`  ${day} ${lang}: XML parse failed — ${err}`);
          continue;
        }
        const votes = arr(
          ((doc.file as Record<string, unknown>)?.sitting as Record<string, unknown> | undefined)?.votes
            ? (((doc.file as Record<string, unknown>).sitting as Record<string, unknown>).votes as Record<string, unknown>).vote
            : undefined,
        ) as Array<Record<string, unknown>>;

        const rows: Array<Record<string, unknown>> = [];
        for (const vote of votes) {
          const label = String(vote.label ?? "");
          const payload = payloadFromVote(vote);
          if (!payload) continue;
          const codes = codesFromLabel(label);
          const itemId = codes.map((c) => itemByCode.get(c)).find(Boolean);
          if (!itemId) continue;
          rows.push({ item_id: itemId, language: lang, source_url: url, payload });
        }
        if (rows.length) {
          // One VOT file can cite the same item once only; still de-dupe defensively.
          const unique = [...new Map(rows.map((r) => [`${r.item_id}|${r.language}`, r])).values()];
          const { error } = await supabase.from("vot_requests").upsert(unique, { onConflict: "item_id,language" });
          if (error) console.warn(`  ${day} ${lang}: upsert failed — ${error.message}`);
          else {
            stored += unique.length;
            console.log(`  ${day} ${lang}: ${unique.length} items with vote requests`);
          }
        }
        await sleep(400);
      }
    }

    console.log(`\ndone: ${stored} vot_requests rows (${daysWithVot} VOT files found).`);
    if (run) {
      await supabase
        .from("ingestion_runs")
        .update({
          status: "ok",
          finished_at: new Date().toISOString(),
          found: { days_scanned: days.length, vot_files: daysWithVot, rows: stored },
        })
        .eq("id", run.id);
    }
  } catch (err) {
    if (run) {
      await supabase
        .from("ingestion_runs")
        .update({ status: "error", finished_at: new Date().toISOString(), error: String(err) })
        .eq("id", run.id);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error("sync-vot failed:", err);
  process.exit(1);
});
