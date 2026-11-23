/**
 * Shared helpers for the EP → Supabase ingest scripts (sync, syncAgenda, …).
 *
 * Pure/stateless utilities plus the admin Supabase client factory. Extracted so
 * the past-votes ingest (`sync.ts`) and the forward draft-agenda ingest
 * (`syncAgenda.ts`) resolve committees, rapporteurs and part-sessions the same
 * way. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the env.
 */
import { createClient } from "@supabase/supabase-js";
import { reportRefsFromWork } from "@laurus/parser/tabled-report-api";
import { getDocument, getPlenaryDocument, type WorkDocument } from "./epApi.ts";

export const BASE = "https://data.europarl.europa.eu";
export const UA = process.env.EP_USER_AGENT ?? "LAURUS/0.1 (+mailto:francesco.berti.liv@gmail.com)";

/** Pause, for the pacing every EP fetch loop here does. */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Service-role client scoped to the `laurus` schema. */
export function makeAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    db: { schema: "laurus" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Part-sessions: group consecutive sitting days
// ---------------------------------------------------------------------------

export interface SessionRow {
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

/** Group plenary sitting days into part-sessions ('Feb', 'Feb II', …). */
export function groupSessions(dates: string[]): SessionRow[] {
  const days = [...dates].filter(Boolean).sort();

  const groups: string[][] = [];
  for (const day of days) {
    const current = groups[groups.length - 1];
    // Part-sessions run Mon–Thu, so any gap larger than one calendar day
    // starts a new part-session.
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
      // ≥4 sitting days ⇒ Strasbourg; shorter ⇒ Brussels mini-session. Heuristic.
      location: g.length >= 4 ? "STR" : "BXL",
    };
  });
}

// ---------------------------------------------------------------------------
// Document code display + committee/rapporteur resolution
// ---------------------------------------------------------------------------

/** 'A-10-2026-0136' → 'A10-0136/2026' (same for B/C/RC prefixes). */
export function displayCode(identifier: string): string {
  const m = identifier.match(/^([A-Z]+)-(\d+)-(\d{4})-(\d+)$/);
  if (!m) return identifier;
  const [, prefix, term, year, num] = m;
  return `${prefix}${term}-${num}/${year}`;
}

/**
 * EP standing/special committee codes — B-motions carry the tabling political
 * group (RENEW, ECR, …) as creator org instead, which must not end up in the
 * committee column.
 */
export const COMMITTEES = new Set([
  "AFET", "DEVE", "INTA", "BUDG", "CONT", "ECON", "EMPL", "ENVI", "ITRE",
  "IMCO", "TRAN", "REGI", "AGRI", "PECH", "CULT", "JURI", "LIBE", "AFCO",
  "FEMM", "PETI", "DROI", "SEDE", "FISC", "SANT", "LEGI", "HOUS", "EUDS",
]);

const personCache = new Map<string, string | undefined>();

/** Resolve an EP `person/{id}` reference to a display name, cached. */
export async function personName(personRef: string): Promise<string | undefined> {
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

/** One rapporteur of a report, ready for `item_rapporteurs`. */
export interface ReportLeadRow {
  personId: string;
  name: string;
  committee: string | null;
  group: string | null;
  precedence: number | null;
  role: "RAPPORTEUR" | "RAPPORTEUR_CO";
}

/** Who is responsible for a report, in the Parliament's own order. */
export interface ReportDetails {
  /** Every rapporteur's name in order, joined by ", " — the `items.rapporteur` string. */
  rapporteur: string | undefined;
  /** The first committee: the column that has always held the lead. */
  committee: string | undefined;
  /** All responsible committees, in the Parliament's order. */
  committees: string[];
  leads: ReportLeadRow[];
}

/**
 * Committees and rapporteurs of a report, ALL of them, in the order the
 * Parliament gives them.
 *
 * The old way — first `person/` and first `org/` of the `creator` array — was
 * wrong for any report with more than one committee, because that array has no
 * order: Omnibus IV (A10-0034/2026) came out as VIGENIN/LIBE when the file is
 * ECON → VIVALDINI, LIBE → VIGENIN. The order lives in the participations:
 * `precedenceOrder` ascending is also the order OEIL prints.
 *
 * `plenary-documents/{id}` carries those participations; `/documents/{id}`
 * (what `fallback` is, when the caller already fetched it) may not, and a
 * B-/RC- document has none, so those still go through `creator`, as before.
 *
 * `rapporteur` is left undefined when any one name fails to resolve: a list
 * missing a co-rapporteur is worse than no list, and the caller keeps what the
 * row already holds.
 */
export async function reportDetails(identifier: string, fallback?: WorkDocument): Promise<ReportDetails | undefined> {
  try {
    const work = await getPlenaryDocument(identifier);
    const refs = work ? reportRefsFromWork(work) : null;
    if (refs && (refs.leads.length || refs.committees.length)) {
      const names = await Promise.all(refs.leads.map((l) => personName(l.personId)));
      const leads: ReportLeadRow[] = refs.leads.flatMap((l, i) =>
        names[i] ? [{ ...l, name: names[i]!, committee: l.committee && COMMITTEES.has(l.committee) ? l.committee : null }] : [],
      );
      const committees = refs.committees.filter((c) => COMMITTEES.has(c));
      return {
        rapporteur: leads.length && leads.length === refs.leads.length ? leads.map((l) => l.name).join(", ") : undefined,
        committee: committees[0],
        committees,
        leads,
      };
    }
  } catch {
    // the plenary endpoint is the less reliable of the two; fall through
  }

  let doc = fallback;
  if (!doc) {
    try {
      doc = await getDocument(identifier);
    } catch {
      return undefined;
    }
  }
  if (!doc) return undefined;
  const creator = (doc as unknown as { creator?: string[] }).creator ?? [];
  const committees = creator.filter((c) => c.startsWith("org/")).map((c) => c.slice(4)).filter((c) => COMMITTEES.has(c));
  const person = creator.find((c) => c.startsWith("person/"));
  const name = person ? await personName(person) : undefined;
  return { rapporteur: name, committee: committees[0], committees, leads: [] };
}

type AdminClient = ReturnType<typeof makeAdminClient>;

let leadsTableMissing = false;

/**
 * Upsert amendment rows. The author columns (`tabled_members`, `tabled_group`)
 * come with migration 0017; if it has not been applied yet the rows go in
 * without them, rather than every amendment ingest failing on a column.
 */
export async function upsertAmendments(supabase: AdminClient, rows: Array<Record<string, unknown>>): Promise<{ message: string } | null> {
  const onConflict = "item_id,number,language";
  const first = await supabase.from("amendments").upsert(rows, { onConflict });
  if (!first.error) return null;
  if (!/tabled_(members|group)/.test(first.error.message)) return first.error;
  const plain = rows.map((r) => {
    const { tabled_members: _m, tabled_group: _g, ...rest } = r;
    return rest;
  });
  const retry = await supabase.from("amendments").upsert(plain, { onConflict });
  return retry.error;
}

/**
 * Make `item_rapporteurs` say what the Parliament says for one file: write the
 * leads, drop the rows of anyone no longer on it. Nothing to write (details
 * unresolved this run) leaves the table alone rather than emptying it.
 */
export async function saveLeads(supabase: AdminClient, itemId: string, leads: ReportLeadRow[]): Promise<void> {
  if (!leads.length) return;
  if (leadsTableMissing) return;
  const { error } = await supabase.from("item_rapporteurs").upsert(
    leads.map((l) => ({
      item_id: itemId,
      person_id: l.personId,
      name: l.name,
      committee: l.committee,
      political_group: l.group,
      precedence: l.precedence,
      role: l.role,
    })),
    { onConflict: "item_id,person_id" },
  );
  if (error) {
    // The table comes with migration 0017. A sync that runs before it is
    // applied must still do its real work, so this is said once and skipped.
    if (/item_rapporteurs/.test(error.message)) {
      leadsTableMissing = true;
      console.warn("item_rapporteurs is not there yet (migration 0017) — rapporteur rows skipped for this run");
      return;
    }
    throw new Error(`item_rapporteurs upsert: ${error.message}`);
  }
  const { error: delErr } = await supabase
    .from("item_rapporteurs")
    .delete()
    .eq("item_id", itemId)
    .not("person_id", "in", `(${leads.map((l) => l.personId).join(",")})`);
  if (delErr) throw new Error(`item_rapporteurs cleanup: ${delErr.message}`);
}

// ---------------------------------------------------------------------------
// Bounded-concurrency helper
// ---------------------------------------------------------------------------

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
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
// Draft agenda (foreseen-activities) helpers
// ---------------------------------------------------------------------------

export interface ForeseenActivity {
  activity_id: string;
  activity_date?: string;
  activity_label?: Record<string, string>;
  based_on_a_realization_of?: string[];
  had_activity_type?: string;
}

/** GET a sitting's draft agenda; tolerate the not-yet-published 404/empty case. */
export async function foreseenActivities(meetingId: string): Promise<ForeseenActivity[]> {
  const url = new URL(`${BASE}/api/v2/meetings/${meetingId}/foreseen-activities`);
  url.searchParams.set("format", "application/ld+json");
  url.searchParams.set("limit", "300");
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/ld+json", "User-Agent": UA } });
      // Not published yet: 404 on an unknown sitting, 204 + empty body on a
      // sitting that exists but has no agenda. Never assume a body: this API
      // answers 2xx-with-nothing more often than it 404s.
      if (res.status === 404 || res.status === 204) return [];
      if (!res.ok) throw new Error(`foreseen-activities ${meetingId} ${res.status}`);
      const body = (await res.text()).trim();
      if (!body) return [];
      return (JSON.parse(body) as { data?: ForeseenActivity[] }).data ?? [];
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

/** Pick the committee report (A/B/RC) a foreseen file item is based on, if any. */
export function reportRef(item: ForeseenActivity): string | undefined {
  return (item.based_on_a_realization_of ?? [])
    .map((ref) => ref.split("/").pop()!)
    .find((id) => /^(A|B|RC)-\d+-\d{4}-\d+$/.test(id));
}
