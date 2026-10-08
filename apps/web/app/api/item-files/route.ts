import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { getItemByCode, getItemFiles, type ItemFile } from "@/lib/data";
import { fetchBytesWithBackoff } from "@/lib/epFetch";
import { DOCUMENT_LANGUAGE_SET } from "@/lib/languages";
import { logEvent } from "@/lib/track";

// A zip of a dozen EP documents is a dozen sequential fetches behind a WAF
// that wants to be asked slowly.
export const maxDuration = 60;

const EXT = /\.(docx?|pdf|xml|html?)(?:$|[?#])/i;

/** The EP's own extension, so Word opens what Word should open. */
function extensionOf(url: string): string {
  return EXT.exec(url)?.[1]?.toLowerCase() ?? "pdf";
}

const TYPE_SLUG: Record<ItemFile["type"], string> = {
  report: "report",
  amendment: "amendments",
  voting_list: "voting-list",
  split: "split-votes",
  rcv: "roll-call",
};

/** "A10-0241-2026_amendments_IT.docx" — sorts and reads the same way twice. */
function nameFor(code: string, f: ItemFile): string {
  const safeCode = code.replace(/[^\w.-]+/g, "-");
  const version = f.version > 1 ? `-v${f.version}` : "";
  return `${safeCode}_${TYPE_SLUG[f.type]}_${f.language.toUpperCase()}${version}.${extensionOf(f.source_url)}`;
}

function page(status: number, title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#141a2b">
<h1 style="color:#003399;font-size:1.25rem">${title}</h1><p>${body}</p>
<p><a href="javascript:history.back()" style="color:#5d667a">← Go back</a></p></div>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
};

/**
 * The EP's own files for one item, served through LAURUS because the EP's
 * document host turns plain browsers away.
 *
 *   GET /api/item-files?code=A10-0241/2026&doc=<uuid>   one file
 *   GET /api/item-files?code=A10-0241/2026&lang=it      every IT file, zipped
 *   GET /api/item-files?code=A10-0241/2026              every file, zipped
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  if (!code) return page(400, "Which file?", "This link needs a report code.");

  const item = await getItemByCode(code);
  if (!item) return page(404, "Not found", `No file with code ${code}.`);

  const all = await getItemFiles(item.id);
  if (all.length === 0) {
    return page(404, "Nothing published yet", "The EP has published no document for this file so far.");
  }

  // ---- one document -------------------------------------------------------
  const docId = url.searchParams.get("doc");
  if (docId) {
    const file = all.find((f) => f.id === docId);
    if (!file) return page(404, "Not found", "That document does not belong to this file.");
    const bytes = await fetchBytesWithBackoff(file.source_url);
    if (!bytes) {
      return page(
        502,
        "The EP did not serve it",
        `The document is listed but its host did not return it. <a href="${file.source_url}" style="color:#003399">Try the EP site directly</a>.`,
      );
    }
    void logEvent("item_file_download", { userId: user.id, itemCode: code, meta: { doc: file.id, type: file.type, lang: file.language } });
    const ext = extensionOf(file.source_url);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${nameFor(code, file)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // ---- everything, zipped -------------------------------------------------
  const langParam = (url.searchParams.get("lang") ?? "").toLowerCase();
  const offered = DOCUMENT_LANGUAGE_SET.has(langParam)
    ? all.filter((f) => f.language === langParam)
    : all.filter((f) => DOCUMENT_LANGUAGE_SET.has(f.language));
  // The newest version of each document, which is what the page lists: the
  // envelope should hold what the member was shown, not every revision.
  const seen = new Set<string>();
  const wanted = offered.filter((f) => {
    const key = `${f.type}:${f.language}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (wanted.length === 0) {
    return page(404, "Nothing in that language", "The EP has not published these documents in that language yet.");
  }

  const zip = new JSZip();
  const missing: string[] = [];
  let packed = 0;
  for (const f of wanted) {
    const bytes = await fetchBytesWithBackoff(f.source_url);
    if (!bytes) {
      missing.push(nameFor(code, f));
      continue;
    }
    zip.file(nameFor(code, f), bytes);
    packed++;
  }
  if (packed === 0) {
    return page(502, "The EP did not serve them", "None of the documents came back from the EP host. Try again in a minute.");
  }
  // Say out loud what is not in the envelope, rather than letting it be missed.
  if (missing.length > 0) {
    zip.file(
      "MISSING.txt",
      `These documents are listed by the EP but its host did not return them:\n\n${missing.join("\n")}\n\nTry again later, or open them on the EP site.\n`,
    );
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  void logEvent("item_files_zip", { userId: user.id, itemCode: code, meta: { lang: langParam || "all", count: packed } });

  const suffix = DOCUMENT_LANGUAGE_SET.has(langParam) ? `-${langParam.toUpperCase()}` : "";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${code.replace(/[^\w.-]+/g, "-")}${suffix}-files.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
