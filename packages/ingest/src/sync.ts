/**
 * One-shot sync of a plenary year from the EP Open Data API into Supabase
 * (laurus schema). Idempotent — upserts on natural keys, safe to re-run.
 *
 *   npm run sync -- 2026
 *
 * What it writes:
 *   sessions   one row per part-session (consecutive sitting days grouped)
 *   items      one row per adopted text, dated by the actual vote
 *   documents  report PDF references (en + it) resolved via the FRBR tree
 *
 * Deliberately M1-scoped: no amendments, no voting lists, no notifications.
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the env
 * (pass apps/web/.env.local via --env-file).
 */
import { createClient } from "@supabase/supabase-js";
import { listMeetings, getDocument, fileRefs, type Meeting, type WorkDocument } from "./epApi.ts";

const YEAR = Number(process.argv[2] ?? new Date().getFullYear());
const BASE = "https://data.europarl.europa.eu";
const UA = process.env.EP_USER_AGENT ?? "LAURUS/0.1 (+mailto:francesco.berti.liv@gmail.com)";
const ITEM_LANGS = ["en", "it"] as const;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: "laurus" },
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Sessions: group consecutive sitting days into part-sessions
// ---------------------------------------------------------------------------

interface SessionRow {
  ep_meeting_id: string;
  month_label: string;
  start_date: string;
  end_date: string;
  location: "BXL" | "STR";
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function groupSessions(meetings: Meeting[]): SessionRow[] {
  const days = meetings
    .map((m) => m.activity_date)
    .filter(Boolean)
    .sort();

  const groups: string[][] = [];
  for (const day of days) {
    const current = groups[groups.length - 1];
    // A weekend inside a part-session never happens (Mon–Thu), so any gap
    // larger than one calendar day starts a new part-session.
    if (current && daysBetween(current[current.length - 1], day) <= 1) current.push(day);
    else groups.push([day]);
  }

  const seenPerMonth = new Map<string, number>();
  return groups.map((g) => {
    const start = g[0];
    const end = g[g.length - 1];
    const month = MONTHS_EN[new Date(start).getUTCMonth()];
    const nth = (seenPerMonth.get(month) ?? 0) + 1;
    seenPerMonth.set(month, nth);
    return {
      ep_meeting_id: `PS-${start}`,
      month_label: nth > 1 ? `${month} ${"I".repeat(nth)}` : month,
      start_date: start,
      end_date: end,
      // Strasbourg part-sessions run Mon–Thu (4 sitting days); shorter ones
      // are Brussels mini-sessions. Heuristic, revisit if the API grows a
      // proper location field.
      location: g.length >= 4 ? "STR" : "BXL",
    };
  });
}

// ---------------------------------------------------------------------------
// Adopted texts: the vote ↔ report linkage
// ---------------------------------------------------------------------------

interface AdoptedText {
  identifier?: string; // 'TA-10-2026-0136'
  document_date?: string; // vote date
  adopts?: string[]; // ['eli/dl/doc/A-10-2026-0087']
  title_dcterms?: Record<string, string>;
}

async function listAdoptedTexts(year: number): Promise<AdoptedText[]> {
  const out: AdoptedText[] = [];
  for (let offset = 0; ; offset += 500) {
    const url = new URL(`${BASE}/api/v2/adopted-texts`);
    url.searchParams.set("year", String(year));
    url.searchParams.set("format", "application/ld+json");
    url.searchParams.set("limit", "500");
    url.searchParams.set("offset", String(offset));
    const res = await fetch(url, { headers: { Accept: "application/ld+json", "User-Agent": UA } });
    if (!res.ok) throw new Error(`adopted-texts ${res.status}`);
    const rows = ((await res.json()) as { data?: AdoptedText[] }).data ?? [];
    out.push(...rows);
    if (rows.length < 500) return out;
  }
}

/** 'A-10-2026-0136' → 'A10-0136/2026' (same for B/C/RC prefixes). */
function displayCode(identifier: string): string {
  const m = identifier.match(/^([A-Z]+)-(\d+)-(\d{4})-(\d+)$/);
  if (!m) return identifier;
  const [, prefix, term, year, num] = m;
  return `${prefix}${term}-${num}/${year}`;
}

// ---------------------------------------------------------------------------
// Person (rapporteur) name lookup, cached
// ---------------------------------------------------------------------------

/**
 * EP standing/special committee codes — B-motions carry the tabling political
 * group (RENEW, ECR, …) as creator org instead, which must not end up in the
 * committee column.
 */
const COMMITTEES = new Set([
  "AFET", "DEVE", "INTA", "BUDG", "CONT", "ECON", "EMPL", "ENVI", "ITRE",
  "IMCO", "TRAN", "REGI", "AGRI", "PECH", "CULT", "JURI", "LIBE", "AFCO",
  "FEMM", "PETI", "DROI", "SEDE", "FISC", "SANT", "LEGI", "HOUS",
]);

const personCache = new Map<string, string | undefined>();

async function personName(personRef: string): Promise<string | undefined> {
  const id = personRef.split("/").pop()!;
  if (personCache.has(id)) return personCache.get(id);
  let name: string | undefined;
  try {
    const res = await fetch(`${BASE}/person/${id}`, {
      headers: { Accept: "application/ld+json", "User-Agent": UA },
    });
    if (res.ok) {
      const graph = ((await res.json()) as { "@graph"?: Array<Record<string, unknown>> })["@graph"] ?? [];
      const node = graph.find((n) => typeof n.givenName === "string" && typeof n.familyName === "string");
      if (node) name = `${node.givenName} ${node.familyName}`;
    }
  } catch {
    // leave undefined — a missing rapporteur name is not fatal
  }
  personCache.set(id, name);
  return name;
}

// ---------------------------------------------------------------------------
// Bounded-concurrency helper
// ---------------------------------------------------------------------------

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { data: run } = await supabase
    .from("ingestion_runs")
    .insert({ source: `ep-api:sync:${YEAR}` })
    .select("id")
    .single();

  try {
    // 1. Sessions
    const meetings = await listMeetings(YEAR, { limit: "500" });
    const sessions = groupSessions(meetings);
    const { error: sessErr } = await supabase
      .from("sessions")
      .upsert(sessions, { onConflict: "ep_meeting_id" });
    if (sessErr) throw new Error(`sessions upsert: ${sessErr.message}`);
    console.log(`sessions: ${sessions.length} upserted`);

    const { data: sessionRows, error: sessReadErr } = await supabase
      .from("sessions")
      .select("id, start_date, end_date")
      .gte("start_date", `${YEAR}-01-01`)
      .lte("start_date", `${YEAR}-12-31`);
    if (sessReadErr || !sessionRows) throw new Error(`sessions read: ${sessReadErr?.message}`);
    const sessionFor = (date: string) =>
      sessionRows.find((s) => s.start_date <= date && date <= s.end_date)?.id;

    // 2. Adopted texts → items
    const tas = await listAdoptedTexts(YEAR);
    console.log(`adopted texts: ${tas.length} fetched`);

    let skippedNoSession = 0;
    const prepared = tas.flatMap((ta) => {
      const voteDate = ta.document_date;
      const adoptedRef = ta.adopts?.[0];
      if (!voteDate) return [];
      const sessionId = sessionFor(voteDate);
      if (!sessionId) {
        skippedNoSession++;
        return [];
      }
      const workId = adoptedRef ?? `eli/dl/doc/${ta.identifier}`;
      const identifier = workId.split("/").pop()!;
      return [
        {
          sessionId,
          voteDate,
          identifier,
          code: displayCode(identifier),
          title: {
            en: ta.title_dcterms?.en ?? ta.identifier ?? identifier,
            it: ta.title_dcterms?.it ?? "",
          },
          ep_work_id: workId,
        },
      ];
    });
    if (skippedNoSession) console.log(`skipped (vote date outside any session): ${skippedNoSession}`);

    // 3. Report details → committee, rapporteur, file refs (bounded fan-out)
    let detailsOk = 0;
    const enriched = await mapLimit(prepared, 6, async (p) => {
      let committee: string | undefined;
      let rapporteur: string | undefined;
      let doc: WorkDocument | undefined;
      if (/^(A|B|RC)-/.test(p.identifier)) {
        try {
          doc = await getDocument(p.identifier);
        } catch {
          doc = undefined;
        }
      }
      if (doc) {
        detailsOk++;
        const creator = (doc as unknown as { creator?: string[] }).creator ?? [];
        committee = creator
          .filter((c) => c.startsWith("org/"))
          .map((c) => c.slice(4))
          .find((code) => COMMITTEES.has(code));
        const person = creator.find((c) => c.startsWith("person/"));
        if (person) rapporteur = await personName(person);
      }
      return { ...p, committee, rapporteur, doc };
    });
    console.log(`report details resolved: ${detailsOk}/${prepared.length}`);

    // 4. Upsert items
    const itemRows = enriched.map((e) => ({
      session_id: e.sessionId,
      code: e.code,
      ep_work_id: e.ep_work_id,
      title: e.title,
      rapporteur: e.rapporteur ?? null,
      committee: e.committee ?? null,
      vote_date: e.voteDate,
    }));
    const { data: upsertedItems, error: itemErr } = await supabase
      .from("items")
      .upsert(itemRows, { onConflict: "session_id,code" })
      .select("id, code, session_id");
    if (itemErr || !upsertedItems) throw new Error(`items upsert: ${itemErr?.message}`);
    console.log(`items: ${upsertedItems.length} upserted`);
    const itemIdByCode = new Map(upsertedItems.map((i) => [i.code, i.id]));

    // 5. Documents: report PDFs for en/it
    const docRows = enriched.flatMap((e) => {
      const itemId = itemIdByCode.get(e.code);
      if (!itemId || !e.doc) return [];
      return fileRefs(e.doc)
        .filter(
          (r) =>
            (ITEM_LANGS as readonly string[]).includes(r.language) &&
            r.format?.endsWith("/PDF") &&
            r.path,
        )
        .map((r) => ({
          item_id: itemId,
          type: "report" as const,
          language: r.language,
          version: 1,
          source_url: `${BASE}/${r.path}`,
          published_at: r.issued ?? null,
          byte_size: r.byteSize ?? null,
        }));
    });
    // Two adopted texts can adopt the same report (same item) — keep one row
    // per (item, type, language, version) or the batch upsert rejects itself.
    const uniqueDocRows = [
      ...new Map(docRows.map((d) => [`${d.item_id}|${d.type}|${d.language}|${d.version}`, d])).values(),
    ];
    const { error: docErr } = await supabase
      .from("documents")
      .upsert(uniqueDocRows, { onConflict: "item_id,type,language,version" });
    if (docErr) throw new Error(`documents upsert: ${docErr.message}`);
    console.log(`documents: ${uniqueDocRows.length} upserted`);

    // 6. Refresh per-session vote counts
    for (const s of sessionRows) {
      const { count } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("session_id", s.id);
      await supabase.from("sessions").update({ vote_count: count ?? 0 }).eq("id", s.id);
    }

    if (run) {
      await supabase
        .from("ingestion_runs")
        .update({
          status: "ok",
          finished_at: new Date().toISOString(),
          found: { sessions: sessions.length, adopted_texts: tas.length, items: upsertedItems.length, documents: docRows.length },
        })
        .eq("id", run.id);
    }
    console.log("sync done.");
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
  console.error("sync failed:", err);
  process.exit(1);
});
