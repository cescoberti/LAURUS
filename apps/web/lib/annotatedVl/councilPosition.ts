/**
 * The Council position behind a recommendation for second reading. SERVER ONLY.
 *
 * Second reading votes on the Council's text, article by article, and that
 * text is published by the Council, not by Parliament: nothing in the EP's
 * report, amendment or VOT stores holds it. This fetches it — the report says
 * which document it is, the Council's public register serves it as a PDF per
 * language — and hands back the parsed article index for the languages asked
 * for, so the Remarks fill and the split expansion both work off one copy.
 *
 * Returns null for everything that is not a second reading, which is nearly
 * every file: no Council document reference in the report, no fetch.
 */
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import {
  councilPositionRef,
  councilPositionUrl,
  parseCouncilPosition,
  type CouncilPosition,
  type CouncilPositionRef,
} from "@laurus/parser/council-position";
import { documentTextUrl } from "@laurus/parser";
import { fetchBytesWithBackoff } from "@/lib/epFetch";

export interface LoadedCouncilPosition {
  ref: CouncilPositionRef;
  /** Parsed article index per language code; a language missing is a language the register did not serve. */
  byLang: Map<string, CouncilPosition>;
}

/** 'eli/dl/doc/A-10-2026-0297' or 'A10-0297/2026' → 'A-10-2026-0297'. */
function docId(epWorkId: string | null, code: string): string | null {
  const fromWorkId = epWorkId?.split("/").pop();
  if (fromWorkId) return fromWorkId;
  const m = code.match(/^([A-Z]+)(\d+)-(\d+)\/(\d{4})$/);
  return m ? `${m[1]}-${m[2]}-${m[4]}-${m[3]!.padStart(4, "0")}` : null;
}

/** The report's own text, as mammoth reads it — where the DocRef lives. */
async function reportText(id: string): Promise<string | null> {
  const buf = await fetchBytesWithBackoff(documentTextUrl(id, "en"));
  if (!buf || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) return null;
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}

/** One language of the position, fetched from the register and indexed. */
async function positionIn(ref: CouncilPositionRef, language: string): Promise<CouncilPosition | null> {
  const buf = await fetchBytesWithBackoff(councilPositionUrl(ref, language));
  if (!buf || buf.length < 5 || buf.subarray(0, 4).toString("latin1") !== "%PDF") return null;
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  const position = parseCouncilPosition(text as string[]);
  return position.articles.size > 0 ? position : null;
}

/**
 * The Council position for a file, in `languages`, or null when the file is
 * not a second reading (or the register does not serve it).
 */
export async function loadCouncilPosition(
  epWorkId: string | null,
  code: string,
  languages: string[],
): Promise<LoadedCouncilPosition | null> {
  const id = docId(epWorkId, code);
  if (!id) return null;
  let ref: CouncilPositionRef | null = null;
  try {
    const text = await reportText(id);
    ref = text ? councilPositionRef(text) : null;
  } catch {
    return null;
  }
  if (!ref) return null;

  const wanted = [...new Set(languages.map((l) => l.toLowerCase()))];
  const byLang = new Map<string, CouncilPosition>();
  const loaded = await Promise.all(
    wanted.map(async (l) => {
      try {
        return [l, await positionIn(ref!, l)] as const;
      } catch {
        return [l, null] as const;
      }
    }),
  );
  for (const [l, position] of loaded) if (position) byLang.set(l, position);
  return byLang.size > 0 ? { ref, byLang } : null;
}
