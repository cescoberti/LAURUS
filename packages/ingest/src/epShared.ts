/**
 * Shared helpers for the EP → Supabase ingest scripts (sync, syncAgenda, …).
 *
 * Pure/stateless utilities plus the admin Supabase client factory. Extracted so
 * the past-votes ingest (`sync.ts`) and the forward draft-agenda ingest
 * (`syncAgenda.ts`) resolve committees, rapporteurs and part-sessions the same
 * way. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the env.
 */
import { createClient } from "@supabase/supabase-js";

export const BASE = "https://data.europarl.europa.eu";
export const UA = process.env.EP_USER_AGENT ?? "LAURUS/0.1 (+mailto:francesco.berti.liv@gmail.com)";

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
