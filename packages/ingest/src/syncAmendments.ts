/**
 * Plenary-amendment ingestion (the Remarks source for the annotated VL).
 *
 *   npm run sync-amendments -- 2026            # it + en (default)
 *   npm run sync-amendments -- 2026 it,en,fr   # explicit language set
 *
 * Plenary amendments are published per report in AMENDMENT_LIST blocks
 * ("A-10-2026-0170-AM-006-010" = Am 6–10). We enumerate them from
 * `/api/v2/documents?work-type=AMENDMENT_LIST`, build the distribution path
 * directly (`distribution/reds_iPlRp_Amd/{ID}/{ID}_{lang}.docx`), download the
 * DOCX and parse the EP two-column template with @laurus/parser.
 *
 * Two hard-won transport facts (do not "simplify" them away):
 *   - bytes MUST be fetched with node:https (fetchBytes) — the EP WAF rejects
 *     Node's undici fetch at the TLS level with HTTP 500;
 *   - the host rate-limits bursts host-wide (403), so everything is
 *     sequential with a small delay and backoff.
 *
 * Idempotent: upserts on (item_id, number, language).
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the env.
 */
import { createClient } from "@supabase/supabase-js";
import { parseAmendmentsDocx } from "@laurus/parser/amendments-docx";
import { fetchBytes } from "./httpFetch.ts";

const YEAR = Number(process.argv[2] ?? new Date().getFullYear());
const LANGS = (process.argv[3] ?? "it,en").split(",").map((s) => s.trim()).filter(Boolean);
const BASE = "https://data.europarl.europa.eu";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "laurus" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Enumerate AMENDMENT_LIST documents for the year
// ---------------------------------------------------------------------------

interface AmendmentListDoc {
  identifier: string; // 'A-10-2026-0170-AM-006-010'
}

async function listAmendmentDocs(year: number): Promise<AmendmentListDoc[]> {
  const out: AmendmentListDoc[] = [];
  for (let offset = 0; ; offset += 500) {
    const url =
      `${BASE}/api/v2/documents?year=${year}&work-type=AMENDMENT_LIST` +
      `&limit=500&offset=${offset}&format=application%2Fld%2Bjson`;
    const { status, body } = await fetchBytes(url);
    if (status === 403 || status === 429) {
      console.warn(`  API throttled (${status}) — backing off 30s`);
      await sleep(30_000);
      offset -= 500;
      continue;
    }
    if (status !== 200) throw new Error(`documents list HTTP ${status}`);
    const rows = (JSON.parse(body.toString("utf8")) as { data?: AmendmentListDoc[] }).data ?? [];
    out.push(...rows);
    if (rows.length < 500) return out;
    await sleep(500);
  }
}

/** 'A-10-2026-0170-AM-006-010' → report code 'A10-0170/2026' (also B/RC docs). */
function itemCodeOf(identifier: string): string | null {
  const m = identifier.match(/^([A-Z]+)-(\d+)-(\d{4})-(\d+)-AM-/);
  if (!m) return null;
  const [, prefix, term, year, num] = m;
  return `${prefix}${term}-${num}/${year}`;
}

// ---------------------------------------------------------------------------
// Fetch one block's DOCX with backoff
// ---------------------------------------------------------------------------

async function fetchBlockDocx(identifier: string, lang: string): Promise<Buffer | null> {
  const url = `${BASE}/distribution/reds_iPlRp_Amd/${identifier}/${identifier}_${lang}.docx`;
  let delay = 10_000;
  for (let attempt = 0; attempt < 8; attempt++) {
    let status: number, body: Buffer;
    try {
      ({ status, body } = await fetchBytes(url));
    } catch (err) {
      // Transient network failure (ETIMEDOUT, ECONNRESET…) — retry like a 429.
      console.warn(`    network error (${(err as Error).message}) — backing off ${delay / 1000}s`);
      await sleep(delay);
      delay = Math.min(delay * 2, 120_000);
      continue;
    }
    // The EP host rate-limits with 429 (sometimes 403). Anything else non-200
    // means the language/block genuinely isn't published.
    if (status === 429 || status === 403) {
      console.warn(`    throttled (${status}) — backing off ${delay / 1000}s`);
      await sleep(delay);
      delay = Math.min(delay * 2, 120_000);
      continue;
    }
    if (status !== 200) return null; // language not published, or no such block
    if (body.length < 4 || body[0] !== 0x50 || body[1] !== 0x4b) return null; // not a zip
    return body;
  }
  throw new Error(`still throttled after retries: ${identifier}_${lang}`); // don't silently skip
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { data: run } = await supabase
    .from("ingestion_runs")
    .insert({ source: `ep-api:plenary-amendments:${YEAR}` })
    .select("id")
    .single();

  try {
    const docs = await listAmendmentDocs(YEAR);
    console.log(`AMENDMENT_LIST docs ${YEAR}: ${docs.length}, languages: ${LANGS.join("+")}`);

    // Group blocks per item code and map to item ids.
    const blocksByCode = new Map<string, string[]>();
    for (const d of docs) {
      const code = itemCodeOf(d.identifier);
      if (!code) continue;
      const arr = blocksByCode.get(code) ?? [];
      arr.push(d.identifier);
      blocksByCode.set(code, arr);
    }

    const { data: items, error: itemErr } = await supabase
      .from("items")
      .select("id, code")
      .in("code", [...blocksByCode.keys()]);
    if (itemErr || !items) throw new Error(`items read: ${itemErr?.message}`);
    const itemIdByCode = new Map(items.map((i) => [i.code as string, i.id as string]));
    console.log(`matched items in DB: ${itemIdByCode.size}/${blocksByCode.size} report codes`);

    // Skip items that already have amendments (idempotent rerun after a
    // throttle abort shouldn't burn the rate budget refetching them).
    const { data: doneRows } = await supabase.from("amendments").select("item_id");
    const alreadyDone = new Set((doneRows ?? []).map((r) => r.item_id as string));

    let itemsDone = 0;
    let totalRows = 0;

    for (const [code, blocks] of blocksByCode) {
      const itemId = itemIdByCode.get(code);
      if (!itemId) continue; // report not on any synced session (different year / not voted)
      if (alreadyDone.has(itemId)) continue;

      const numbersSeen = new Set<number>();
      const amRows: Array<Record<string, unknown>> = [];
      for (const identifier of blocks.sort()) {
        for (const lang of LANGS) {
          const buf = await fetchBlockDocx(identifier, lang);
          if (!buf) continue;
          let parsed;
          try {
            parsed = await parseAmendmentsDocx(buf, lang);
          } catch {
            continue;
          }
          for (const a of parsed) {
            numbersSeen.add(a.number);
            amRows.push({
              item_id: itemId,
              number: a.number,
              language: lang,
              target: a.target ?? null,
              tabled_by: a.tabledBy ?? null,
              original_text: a.originalText ?? null,
              amended_text: a.amendedText ?? null,
              kind: a.kind,
            });
          }
          await sleep(800);
        }
      }

      if (amRows.length === 0) continue;

      // The same number can appear in two blocks (re-issued/corrigendum block)
      // — keep one row per conflict key or the batch upsert rejects itself.
      const uniqueRows = [
        ...new Map(amRows.map((r) => [`${r.item_id}|${r.number}|${r.language}`, r])).values(),
      ];
      const { error: upErr } = await supabase
        .from("amendments")
        .upsert(uniqueRows, { onConflict: "item_id,number,language" });
      if (upErr) {
        console.warn(`  ${code}: upsert failed — ${upErr.message}`);
        continue;
      }
      await supabase.from("items").update({ am_count: numbersSeen.size }).eq("id", itemId);

      itemsDone++;
      totalRows += uniqueRows.length;
      console.log(`  ${code}: ${numbersSeen.size} amendments (${uniqueRows.length} lang-rows, ${blocks.length} blocks)`);
    }

    console.log(`\ndone: ${itemsDone} items, ${totalRows} amendment rows.`);
    if (run) {
      await supabase
        .from("ingestion_runs")
        .update({
          status: "ok",
          finished_at: new Date().toISOString(),
          found: { amendment_list_docs: docs.length, report_codes: blocksByCode.size, items_ingested: itemsDone, amendment_rows: totalRows },
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
  console.error("sync-amendments failed:", err);
  process.exit(1);
});
