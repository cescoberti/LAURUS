import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ADMIN_DAILY_VL_LIMIT, DAILY_VL_LIMIT, dailyLimitFor } from "@/lib/limits";
import { SPLIT_EVENT, eventUsd } from "@/lib/agents";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
// Highlight anyone who hit the daily cap, or generated a lot over the month.
const MONTH_ALERT = 60;

interface Row {
  email: string;
  isAdmin: boolean;
  today: number;
  week: number;
  month: number;
  /** Model spend of the lists this user asked for, in US dollars. */
  usdToday: number;
  usdMonth: number;
}

const usd = (n: number) => (n === 0 ? "—" : n < 0.01 ? "< $0.01" : `$${n.toFixed(2)}`);

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
}

export default async function UtilizzoPage() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * DAY).toISOString();

  const { data: events } = await supabase
    .from("events")
    .select("user_id, type, created_at")
    .in("type", ["vl_download", "vl_generate"])
    .gte("created_at", since);
  // One event per list the model agents worked on: who asked, which list, what it cost.
  const { data: costEvents } = await supabase
    .from("events")
    .select("user_id, item_code, created_at, meta")
    .eq("type", SPLIT_EVENT)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  const { data: users } = await supabase.from("users").select("id, email, role");

  const emailById = new Map((users ?? []).map((u) => [u.id as string, u.email as string]));
  const adminById = new Map((users ?? []).map((u) => [u.id as string, u.role === "admin"]));
  const now = Date.now();
  const byUser = new Map<string, Row>();
  const rowOf = (id: string): Row => {
    let row = byUser.get(id);
    if (!row) {
      row = { email: emailById.get(id) ?? "—", isAdmin: adminById.get(id) ?? false, today: 0, week: 0, month: 0, usdToday: 0, usdMonth: 0 };
      byUser.set(id, row);
    }
    return row;
  };
  for (const e of events ?? []) {
    const id = e.user_id as string | null;
    if (!id) continue;
    const row = rowOf(id);
    const age = now - Date.parse(e.created_at as string);
    row.month++;
    if (age <= 7 * DAY) row.week++;
    if (age <= DAY) row.today++;
  }
  const lists = (costEvents ?? []).map((e) => ({
    userId: e.user_id as string | null,
    code: e.item_code as string | null,
    at: e.created_at as string,
    usd: eventUsd(e.meta as Record<string, unknown>),
    language: String((e.meta as { language?: string } | null)?.language ?? ""),
    calls: Object.values(((e.meta as { spend?: Record<string, { calls?: number }> } | null)?.spend ?? {})).reduce((n, s) => n + (Number(s?.calls) || 0), 0),
  }));
  let totalUsd = 0;
  for (const l of lists) {
    totalUsd += l.usd;
    if (!l.userId) continue;
    const row = rowOf(l.userId);
    row.usdMonth += l.usd;
    if (now - Date.parse(l.at) <= DAY) row.usdToday += l.usd;
  }

  const rows = [...byUser.values()].sort((a, b) => b.usdMonth - a.usdMonth || b.month - a.month);
  const totalMonth = rows.reduce((s, r) => s + r.month, 0);
  const activeUsers = rows.length;

  return (
    <div className="min-h-screen">
      <TopNav active="admin" />
      <main className="mx-auto max-w-5xl px-8 py-16 lg:px-12 lg:py-20">
        <h1 className="display text-display-md font-bold text-eu-900">Usage</h1>
        <p className="lede mt-5">
          Voting lists produced per user (generations and downloads), and what the model agents cost for them.
          Read-only — meant to spot unusual consumption. Building a list is deterministic; only the split
          agents call a model, so a list with no split costs nothing.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="VLs in the last 30 days" value={totalMonth} />
          <Stat label="Active users (30 days)" value={activeUsers} />
          <Stat label="Model cost (30 days)" value={usd(totalUsd)} />
          <Stat label="Daily limit" value={`${DAILY_VL_LIMIT} / ${ADMIN_DAILY_VL_LIMIT} admin`} />
        </div>

        <div className="card mt-8 overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-900/[0.055] bg-slate-50/60">
                {["User", "Today", "7 days", "30 days", "Cost today", "Cost 30 d"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-300">
                    No voting lists produced in the last 30 days.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const cap = dailyLimitFor(r.isAdmin);
                  const alert = r.today >= cap || r.month >= MONTH_ALERT;
                  return (
                    <tr key={r.email} className={`border-b border-slate-50 ${alert ? "bg-red-50/60" : ""}`}>
                      <td className="px-4 py-3 text-sm text-ink-900">
                        {r.email}
                        {r.isAdmin && <span className="ml-2 rounded bg-eu-100 px-1.5 py-0.5 text-[10px] font-semibold text-eu-900">admin</span>}
                      </td>
                      <td className={`px-4 py-3 text-sm ${r.today >= cap ? "font-bold text-red-700" : "text-ink-700"}`}>
                        {r.today}/{cap}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-700">{r.week}</td>
                      <td className={`px-4 py-3 text-sm ${r.month >= MONTH_ALERT ? "font-bold text-red-700" : "text-ink-700"}`}>
                        {r.month}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-700">{usd(r.usdToday)}</td>
                      <td className="px-4 py-3 text-sm text-ink-700">{usd(r.usdMonth)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <h2 className="mt-12 text-xl font-bold text-ink-900">Cost per voting list</h2>
        <p className="mt-2 text-sm text-ink-500">
          The latest lists on which a split agent ran: who asked for it, and what its model calls cost. The cost of a list is the quote aligner and the split agent together.
        </p>
        <div className="card mt-4 overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-900/[0.055] bg-slate-50/60">
                {["When", "List", "Asked by", "Lang", "Calls", "Cost"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lists.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-300">
                    No list with a split in the last 30 days.
                  </td>
                </tr>
              ) : (
                lists.slice(0, 50).map((l, i) => (
                  <tr key={`${l.code}-${l.at}-${i}`} className="border-b border-slate-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-300">{when(l.at)}</td>
                    <td className="px-4 py-2.5 text-sm">
                      {l.code ? (
                        <Link href={`/items/${encodeURIComponent(l.code)}`} className="font-medium text-eu-700 hover:underline">
                          {l.code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-ink-700">{l.userId ? (emailById.get(l.userId) ?? "—") : "—"}</td>
                    <td className="px-4 py-2.5 text-xs uppercase text-ink-500">{l.language}</td>
                    <td className="px-4 py-2.5 text-sm text-ink-700">{l.calls}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-ink-900">{usd(l.usd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-2xl font-bold text-eu-700">{value}</p>
      <p className="text-xs text-ink-500">{label}</p>
    </div>
  );
}
