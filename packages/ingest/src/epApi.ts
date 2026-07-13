/**
 * Client for the European Parliament Open Data API v2.
 *
 * Verified 2026-07-12 against https://data.europarl.europa.eu/api/v2 :
 *   - open, no auth, returns JSON-LD (HTTP 200)
 *   - documents follow the ELI/FRBR model:
 *       Work  ── is_realized_by ──▶ Expression (one per language)
 *                                     └─ is_embodied_by ──▶ Manifestation (one per format)
 *                                          └─ is_exemplified_by: distribution path
 *   - one payload carries all 24 language labels
 *
 * Raw DOCEO files (www.europarl.europa.eu/doceo/document/...) are bot-gated
 * (HTTP 202, empty body to non-browser clients). Prefer resolving files through
 * the manifestation paths returned here; treat direct DOCEO fetch as fallback.
 */

const BASE = process.env.EP_API_BASE ?? "https://data.europarl.europa.eu/api/v2";
const UA = process.env.EP_USER_AGENT ?? "LAURUS/0.1 (+mailto:francesco.berti.liv@gmail.com)";
const JSON_LD = "application/ld+json";

export interface Manifestation {
  id: string;
  media_type?: string;
  format?: string;
  issued?: string;
  byteSize?: string;
  /** distribution path, relative to the DOCEO/CDN download root */
  is_exemplified_by?: string;
}

export interface Expression {
  id: string;
  /** language code is the last path segment of the expression id, e.g. `.../it` */
  is_embodied_by?: Manifestation[];
}

export interface WorkDocument {
  id: string;
  identifier?: string;      // 'A10-0136/2026'
  work_type?: string;       // 'def/ep-document-types/REPORT_PLENARY'
  label?: string;
  document_date?: string;
  is_realized_by?: Expression[];
}

export interface Meeting {
  activity_id: string;              // 'MTG-PL-2026-06-17'
  activity_date: string;
  activity_start_date?: string;
  activity_end_date?: string;
  activity_label?: Record<string, string>;   // per-language
  had_activity_type?: string;
  consists_of?: string[];           // agenda-item event ids
  documented_by_a_realization_of?: string[]; // OJ agenda doc ids
}

async function get<T = unknown>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const url = new URL(path.startsWith("http") ? path : `${BASE}${path}`);
  url.searchParams.set("format", JSON_LD);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: JSON_LD } });
  if (!res.ok) throw new Error(`EP API ${res.status} for ${url.pathname}${url.search}`);
  const body = (await res.json()) as { data?: T[] };
  return body.data ?? [];
}

/** Plenary sittings for a year (all 24-language labels included). */
export function listMeetings(year: number, params: Record<string, string> = {}): Promise<Meeting[]> {
  return get<Meeting>("/meetings", { year: String(year), ...params });
}

/** Plenary documents (reports, amendments, voting lists) for a year. */
export function listPlenaryDocuments(
  year: number,
  workType?: string,
  params: Record<string, string> = {},
): Promise<WorkDocument[]> {
  return get<WorkDocument>("/plenary-documents", {
    year: String(year),
    ...(workType ? { "work-type": workType } : {}),
    ...params,
  });
}

/** Full ELI/FRBR tree for a single document id, e.g. 'A-10-2026-0136'. */
export async function getDocument(id: string): Promise<WorkDocument | undefined> {
  const rows = await get<WorkDocument>(`/documents/${encodeURIComponent(id)}`);
  return rows[0];
}

/** Change feed (~30-day window) — poll this for Feature 3 versioning. */
export function feed(resource: string, params: Record<string, string> = {}): Promise<unknown[]> {
  return get(`/${resource}/feed`, params);
}

/** Extract every (language, format) file reference from a Work's FRBR tree. */
export function fileRefs(doc: WorkDocument): Array<{
  language: string;
  format?: string;
  mediaType?: string;
  path?: string;
  issued?: string;
  byteSize?: number;
}> {
  const out: ReturnType<typeof fileRefs> = [];
  for (const expr of doc.is_realized_by ?? []) {
    const language = expr.id.split("/").pop() ?? "";
    for (const man of expr.is_embodied_by ?? []) {
      out.push({
        language,
        format: man.format,
        mediaType: man.media_type,
        path: man.is_exemplified_by,
        issued: man.issued,
        byteSize: man.byteSize ? Number(man.byteSize) : undefined,
      });
    }
  }
  return out;
}
