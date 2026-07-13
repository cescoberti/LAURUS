import { ItemTable } from "@/components/ItemTable";
import { TopNav } from "@/components/TopNav";
import { JUNE_2026, MONTHS } from "@/lib/seed";

const session = JUNE_2026;

export default function Dashboard() {
  return (
    <div className="min-h-screen">
      <TopNav active="All Votes" />

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Month tabs */}
        <div className="mb-5 flex items-center gap-1 overflow-x-auto">
          {MONTHS.map((m) => (
            <button
              key={m}
              className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                m === "Jun"
                  ? "bg-laurel-800 text-white shadow-sm"
                  : "text-ink-500 hover:bg-slate-100 hover:text-ink-900"
              }`}
            >
              {m}
            </button>
          ))}
          <span className="ml-auto text-sm text-ink-300">{session.votes} votes</span>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            placeholder="Search code, title, rapporteur, committee…"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-card outline-none placeholder:text-ink-300 focus:border-laurel-600 focus:ring-2 focus:ring-laurel-600/15"
          />
        </div>

        {/* Session header */}
        <div className="mb-8 rounded-2xl border border-laurel-100 bg-gradient-to-br from-laurel-50/70 to-white p-6 shadow-card">
          <h1 className="text-3xl font-bold tracking-tight text-laurel-950">{session.month}</h1>
          <p className="mt-1 text-sm text-ink-500">{session.subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-6">
            <Stat value={session.votes} label="votes" accent />
            <Stat value={session.allocated} label="allocated" />
            <Stat value={session.withVl} label="with VL" />
          </div>
        </div>

        {/* Day groups */}
        {session.days.map((g) => (
          <ItemTable key={g.day} group={g} />
        ))}

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
