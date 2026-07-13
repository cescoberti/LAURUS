import Link from "next/link";
import { SessionBoard } from "@/components/SessionBoard";
import { TopNav } from "@/components/TopNav";
import { getSessions, getSessionItems, type SessionSummary } from "@/lib/data";
import type { DisplayItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const YEAR = 2026;

function pickDefault(sessions: SessionSummary[]): SessionSummary | undefined {
  const today = new Date().toISOString().slice(0, 10);
  return (
    sessions.find((s) => s.start_date <= today && today <= s.end_date) ??
    [...sessions].reverse().find((s) => s.end_date < today) ??
    sessions[0]
  );
}

function sessionSubtitle(s: SessionSummary): string {
  const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDate();
  const month = new Date(`${s.start_date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" });
  const place = s.location === "STR" ? "Strasbourg" : "Brussels";
  return `Plenary ${fmt(s.start_date)}–${fmt(s.end_date)} ${month} · ${place}`;
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await searchParams;
  const sessions = await getSessions(YEAR);
  const active = sessions.find((x) => x.id === s) ?? pickDefault(sessions);
  const rows = active ? await getSessionItems(active.id) : [];

  const items: DisplayItem[] = rows.map((r) => ({
    code: r.code,
    title: r.title.en || r.title.it || r.code,
    rapporteur: r.rapporteur ?? undefined,
    committee: r.committee ?? "TBD",
    voteDate: r.vote_date ?? undefined,
    vl: r.vl_status,
    fileUrl: r.documents.find((d) => d.type === "report" && d.language === "en")?.source_url,
  }));

  const monthName = active
    ? new Date(`${active.start_date}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long" })
    : "";
  const withFile = items.filter((i) => i.fileUrl).length;

  return (
    <div className="min-h-screen">
      <TopNav active="All Votes" />

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Part-session tabs */}
        <div className="mb-5 flex items-center gap-1 overflow-x-auto">
          {sessions.map((m) => (
            <Link
              key={m.id}
              href={`/?s=${m.id}`}
              className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                m.id === active?.id
                  ? "bg-laurel-800 text-white shadow-sm"
                  : "text-ink-500 hover:bg-slate-100 hover:text-ink-900"
              }`}
            >
              {m.month_label}
            </Link>
          ))}
          {active && <span className="ml-auto text-sm text-ink-300">{items.length} votes</span>}
        </div>

        {/* Session header */}
        {active && (
          <div className="mb-8 rounded-2xl border border-laurel-100 bg-gradient-to-br from-laurel-50/70 to-white p-6 shadow-card">
            <h1 className="text-3xl font-bold tracking-tight text-laurel-950">
              {monthName} {YEAR}
            </h1>
            <p className="mt-1 text-sm text-ink-500">{sessionSubtitle(active)}</p>
            <div className="mt-4 flex flex-wrap gap-6">
              <Stat value={items.length} label="votes" accent />
              <Stat value={0} label="allocated" />
              <Stat value={withFile} label="with file" />
            </div>
          </div>
        )}

        <SessionBoard items={items} />

        <footer className="mt-12 border-t border-slate-100 pt-6 text-center text-xs text-ink-300">
          LAURUS · Less paperwork. More wins. · Source: EP Open Data API v2
        </footer>
      </main>
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-2xl font-bold ${accent ? "text-laurel-700" : "text-ink-900"}`}>{value}</span>
      <span className="text-sm text-ink-500">{label}</span>
    </div>
  );
}
