/** One-off harness: build the Serbia VL from live DB data and expand its splits. */
import { createClient } from "@supabase/supabase-js";
import { buildVlFromAmendments, type DbAmendment } from "../lib/annotatedVl/fromDb";
import { expandSplitRows } from "../lib/annotatedVl/expandSplits";
import type { VotPayload } from "@laurus/parser/vot-xml";

const CODE = process.argv[2] ?? "A10-0163/2026";
const LANG = process.argv[3] ?? "it";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "laurus" }, auth: { autoRefreshToken: false, persistSession: false },
});

const { data: item } = await db.from("items").select("id, code, title, rapporteur, committee, vote_date").eq("code", CODE).single();
if (!item) throw new Error("item not found");
const { data: amRows } = await db.from("amendments")
  .select("number, language, target, tabled_by, original_text, amended_text, kind")
  .eq("item_id", item.id).in("language", ["it", "en"]).order("number");
const { data: votRows } = await db.from("vot_requests").select("language, payload").eq("item_id", item.id).in("language", ["it", "en"]);
const votByLang = new Map((votRows ?? []).map((r) => [r.language, r.payload as VotPayload]));
const vot = votByLang.get(LANG) ?? votByLang.get("en") ?? null;

const vl = buildVlFromAmendments(item, (amRows ?? []) as DbAmendment[], vot, LANG);
const notes = await expandSplitRows(vl, {
  itemCode: CODE, language: LANG,
  votEn: votByLang.get("en") ?? null, votLang: vot,
  amendments: (amRows ?? []) as DbAmendment[],
});

console.log("=== NOTE ===", notes.length ? notes : "nessuna (tutto espanso)");
for (const row of vl.rows.filter((r) => r.voteType === "split")) {
  console.log(`\n=== SPLIT ${row.subject} (${row.author}) ===`);
  for (const p of row.splitParts) {
    console.log(`--- [${p.label}] notation: ${p.notation?.slice(0, 60)}…`);
    console.log(p.remarks);
  }
}
