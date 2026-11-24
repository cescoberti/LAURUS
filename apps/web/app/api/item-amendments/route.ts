import { NextResponse } from "next/server";
import JSZip from "jszip";
import { amendmentBlockUrl } from "@laurus/parser";
import { sessionUser } from "@/lib/supabase/server";
import { getItemByCode } from "@/lib/data";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import { DOCUMENT_LANGUAGE_SET } from "@/lib/languages";
import { amendmentBlockIds } from "@/lib/epAmendments";
import { logEvent } from "@/lib/track";
import { createAdminClient } from "@/lib/supabase/admin";
import { fileStem } from "@/lib/rapporteur";
import { errorPage } from "@/lib/site";

export const runtime = "nodejs";
// A report's amendments come in blocks of five, each a separate fetch from a
// WAF that wants to be asked slowly.
export const maxDuration = 60;

/** Stop asking the EP this long after the request began, so the zip is built and sent before the platform's own 60 s cut. */
const BUDGET_MS = 48_000;
/** The EP's index of amendment blocks is the slow part; reuse it for this long. */
const INDEX_MAX_AGE_MS = 3 * 3_600_000;
/** In flight at once: the WAF wants to be asked slowly, but not one at a time. */
const PARALLEL = 3;

/**
 * Every amendment block the EP published for one report, zipped.
 *
 *   GET /api/item-amendments?code=A10-0274/2026&lang=it
 *
 * This is the EP's own DOCX, untouched — the thing to read the generated
 * Remarks against when checking a voting list before the vote. It does NOT
 * go through `documents`: that table holds what the per-file panel lists,
 * and it is routinely empty for a report whose amendments LAURUS has already
 * ingested, which is exactly when the check is wanted. The block ids are
 * resolved from the EP's AMENDMENT_LIST index instead, the same way the
 * voting-list verifier resolves them.
 */

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { user } = await sessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  if (!code) return errorPage(400, "Which file?", "This link needs a report code.");

  const lang = (url.searchParams.get("lang") ?? "it").toLowerCase();
  if (!DOCUMENT_LANGUAGE_SET.has(lang)) return errorPage(400, "Which language?", `LAURUS does not offer ${lang.toUpperCase()}.`);

  const item = await getItemByCode(code);
  if (!item) return errorPage(404, "Not found", `No file with code ${code}.`);

  const year = Number(code.slice(-4));
  // The index of every amendment block of the year is what took the time: a
  // dozen sequential pages from the EP, on every click. The copy the VL flow
  // keeps in ep_doc_index is used when it is recent and knows this report;
  // otherwise it is fetched, and kept for the next click.
  const admin = createAdminClient();
  const { data: idx } = await admin
    .from("ep_doc_index")
    .select("identifiers, fetched_at")
    .eq("year", year)
    .eq("work_type", "AMENDMENT_LIST")
    .maybeSingle();
  const cachedIndex =
    idx && Date.parse(idx.fetched_at as string) > Date.now() - INDEX_MAX_AGE_MS ? (idx.identifiers as string[]) : null;

  let blocks: string[] | null = null;
  try {
    let found = await amendmentBlockIds(code, year, cachedIndex);
    // A cached index that has nothing for this report may simply predate it.
    if (cachedIndex && !found.blocks?.length) found = await amendmentBlockIds(code, year, null);
    blocks = found.blocks;
    if (found.freshIndex) {
      await admin
        .from("ep_doc_index")
        .upsert(
          { year, work_type: "AMENDMENT_LIST", identifiers: found.freshIndex, fetched_at: new Date().toISOString() },
          { onConflict: "year,work_type" },
        );
    }
  } catch (err) {
    return errorPage(502, "The EP index did not answer", (err as Error).message);
  }
  if (!blocks || blocks.length === 0) {
    return errorPage(404, "No amendment blocks", "The EP has published no amendments for this report yet.");
  }

  const zip = new JSZip();
  const safeCode = code.replace(/[^\w.-]+/g, "-");
  const missing: string[] = [];
  let packed = 0;
  const late: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, blocks.length) }, async () => {
      while (next < blocks.length) {
        const id = blocks[next++]!;
        // Out of time: say so rather than let the platform cut the response.
        if (Date.now() - startedAt > BUDGET_MS) {
          late.push(id);
          continue;
        }
        let bytes: Buffer | null = null;
        try {
          bytes = await fetchBytesWithBackoff(amendmentBlockUrl(id, lang), 2);
        } catch {
          late.push(id); // still throttled: a retry may get it, which "missing" would not suggest
          continue;
        }
        // A block not yet translated answers with something that is not a DOCX;
        // "PK" is how a real one starts, and skipping the rest keeps the zip
        // honest instead of filling it with error pages.
        if (!bytes || bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
          missing.push(id);
          continue;
        }
        // The EP's own bytes, exactly as served: nothing here reads or rewrites them.
        zip.file(`${safeCode}_${id.replace(/^.*-AM-/, "AM-")}_${lang.toUpperCase()}.docx`, bytes);
        packed++;
      }
    }),
  );
  missing.sort();
  late.sort();

  if (packed === 0 && late.length) {
    return errorPage(
      504,
      "The EP is answering slowly",
      `None of the ${blocks.length} amendment block${blocks.length === 1 ? "" : "s"} could be fetched in time. Try again in a minute: the list of blocks is now remembered, so the next attempt goes straight to the files.`,
    );
  }
  if (packed === 0) {
    return errorPage(
      404,
      `Nothing in ${lang.toUpperCase()} yet`,
      `The EP lists ${blocks.length} amendment block${blocks.length === 1 ? "" : "s"} for this report, but none of them is published in ${lang.toUpperCase()} so far.`,
    );
  }
  // Say what is not in the envelope, inside the envelope.
  if (missing.length) {
    zip.file(
      "MISSING.txt",
      `These blocks are listed by the EP but were not available in ${lang.toUpperCase()} when this zip was built:\n\n${missing.join("\n")}\n`,
    );
  }

  if (late.length) {
    zip.file(
      "NOT-FETCHED.txt",
      `These blocks exist but could not be fetched in time (the EP was slow or throttling). This zip is INCOMPLETE; download again to get the rest:\n\n${late.join("\n")}\n`,
    );
  }

  void logEvent("item_amendments_download", {
    userId: user.id,
    itemCode: code,
    meta: { lang, blocks: blocks.length, packed, missing: missing.length, late: late.length, ms: Date.now() - startedAt },
  });

  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileStem(item.rapporteur, lang, code)} (EP amendments).zip"`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
