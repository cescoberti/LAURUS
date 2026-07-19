import { TopNav } from "@/components/TopNav";
import { createClient } from "@/lib/supabase/server";
import { DAILY_VL_LIMIT } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
// Highlight anyone who hit the daily cap, or generated a lot over the month.
const MONTH_ALERT = 60;

interface Row {
  email: string;
  today: number;
  week: number;
  month: number;
}

export default async function UtilizzoPage() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * DAY).toISOString();

  const { data: events } = await supabase
    .from("events")
    .select("user_id, type, created_at")
    .in("type", ["vl_download", "vl_generate"])
    .gte("created_at", since);
  const { data: users } = await supabase.from("users").select("id, email");

  const emailById = new Map((users ?? []).map((u) => [u.id as string, u.email as string]));
  const now = Date.now();
  const byUser = new Map<string, Row>();
  for (const e of events ?? []) {
    const id = e.user_id as string | null;
    if (!id) continue;
    const email = emailById.get(id) ?? "—";
    const row = byUser.get(id) ?? { email, today: 0, week: 0, month: 0 };
    const age = now - Date.parse(e.created_at as string);
    row.month++;
    if (age <= 7 * DAY) row.week++;
    if (age <= DAY) row.today++;
    byUser.set(id, row);
  }

  const rows = [...byUser.values()].sort((a, b) => b.month - a.month);
  const totalMonth = rows.reduce((s, r) => s + r.month, 0);
  const activeUsers = rows.length;

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold text-ink-900">Utilizzo</h1>
        <p className="mt-1 text-sm text-ink-500">
          Liste di voto prodotte per utente (generazioni e download). Solo lettura — serve a individuare
          consumi anomali. La generazione è deterministica: nessun costo in token.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="VL negli ultimi 30 gg" value={totalMonth} />
          <Stat label="Utenti attivi (30 gg)" value={activeUsers} />
          <Stat label="Limite giornaliero" value={`${DAILY_VL_LIMIT}/utente`} />
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {["Utente", "Oggi", "7 gg", "30 gg"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-ink-300">
                    Nessuna VL prodotta negli ultimi 30 giorni.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const alert = r.today >= DAILY_VL_LIMIT || r.month >= MONTH_ALERT;
                  return (
                    <tr key={r.email} className={`border-b border-slate-50 ${alert ? "bg-red-50/60" : ""}`}>
                      <td className="px-4 py-3 text-sm text-ink-900">{r.email}</td>
                      <td className={`px-4 py-3 text-sm ${r.today >= DAILY_VL_LIMIT ? "font-bold text-red-700" : "text-ink-700"}`}>
                        {r.today}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-700">{r.week}</td>
                      <td className={`px-4 py-3 text-sm ${r.month >= MONTH_ALERT ? "font-bold text-red-700" : "text-ink-700"}`}>
                        {r.month}
                      </td>
                    </tr>
                  );
                })
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
    <div className="rounded-xl border border-slate-200/70 bg-white px-4 py-3">
      <p className="text-2xl font-bold text-laurel-700">{value}</p>
      <p className="text-xs text-ink-500">{label}</p>
    </div>
  );
}
