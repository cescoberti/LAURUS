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
import { listMeetings, getDocument, fileRefs, type WorkDocument } from "./epApi.ts";
import { BASE, UA, makeAdminClient, groupSessions, displayCode, COMMITTEES, personName, mapLimit } from "./epShared.ts";

const YEAR = Number(process.argv[2] ?? new Date().getFullYear());
const ITEM_LANGS = ["en", "it"] as const;

const supabase = makeAdminClient();

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
    const sessions = groupSessions(meetings.map((m) => m.activity_date));
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
