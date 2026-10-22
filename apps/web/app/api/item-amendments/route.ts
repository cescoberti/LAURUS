import { NextResponse } from "next/server";
import JSZip from "jszip";
import { amendmentBlockUrl } from "@laurus/parser";
import { sessionUser } from "@/lib/supabase/server";
import { getItemByCode } from "@/lib/data";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import { DOCUMENT_LANGUAGE_SET } from "@/lib/languages";
import { amendmentBlockIds } from "@/lib/vlVerify";
import { logEvent } from "@/lib/track";
import { fileStem } from "@/lib/rapporteur";
import { errorPage } from "@/lib/site";

export const runtime = "nodejs";
// A report's amendments come in blocks of five, each a separate fetch from a
// WAF that wants to be asked slowly.
export const maxDuration = 60;

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
  let blocks: string[] | null = null;
  try {
    ({ blocks } = await amendmentBlockIds(code, year, null));
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
  for (const id of blocks) {
    const bytes = await fetchBytesWithBackoff(amendmentBlockUrl(id, lang));
    // A block not yet translated answers with something that is not a DOCX;
    // "PK" is how a real one starts, and skipping the rest keeps the zip
    // honest instead of filling it with error pages.
    if (!bytes || bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      missing.push(id);
      continue;
    }
    zip.file(`${safeCode}_${id.replace(/^.*-AM-/, "AM-")}_${lang.toUpperCase()}.docx`, bytes);
    packed++;
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

  void logEvent("item_amendments_download", {
    userId: user.id,
    itemCode: code,
    meta: { lang, blocks: blocks.length, packed, missing: missing.length },
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
