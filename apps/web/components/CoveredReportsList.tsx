"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CommitteeChip } from "@/components/badges";

export interface CoveredReport {
  code: string;
  title: { en?: string; it?: string };
  rapporteur: string | null;
  committee: string | null;
  am_count: number;
}

/** Searchable list of reports with ingested amendments (VL Generator page). */
export function CoveredReportsList({ reports }: { reports: CoveredReport[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return reports;
    return reports.filter((r) =>
      [r.rapporteur, r.code, r.committee, r.title.en, r.title.it]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle)),
    );
  }, [q, reports]);

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cerca per relatore, codice, commissione o titolo…"
        className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 focus:border-laurel-400 focus:outline-none"
      />
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-ink-300">
          Nessuna relazione trovata per “{q}”.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li key={r.code}>
              <Link
                href={`/items/${r.code}`}
                className="block rounded-lg border border-slate-200/70 bg-white px-4 py-3 transition-colors hover:border-laurel-200 hover:bg-laurel-50/40"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-semibold text-ink-900">
                    {r.rapporteur ?? "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right text-sm text-ink-700">
                    {r.title.en || r.title.it || ""}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-4">
                  <span className="font-mono text-xs text-laurel-700">{r.code}</span>
                  <span className="flex items-center gap-2">
                    {r.committee && <CommitteeChip code={r.committee} />}
                    <span className="rounded-full bg-laurel-100 px-2 text-xs font-semibold text-laurel-800">
                      {r.am_count} em.
                    </span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
