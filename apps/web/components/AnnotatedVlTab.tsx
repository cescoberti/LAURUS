"use client";

import { useMemo, useState } from "react";
import { annotate, sampleVlRows, REASON_LABEL, type AnnotatedRow } from "@/lib/sampleAnnotation";

const TABS = ["Amendments", "Voting list", "Split & Separate", "Annotated VL"] as const;
type Tab = (typeof TABS)[number];

export function AnnotatedVlTab() {
  const [tab, setTab] = useState<Tab>("Annotated VL");
  const rows = useMemo(() => annotate(sampleVlRows), []);
  const anomalies = rows.filter((r) => r.status === "anomaly");
  const autoCount = rows.length - anomalies.length;

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-laurel-700 text-laurel-800"
                : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Annotated VL" ? (
        <AnnotatedView rows={rows} autoCount={autoCount} anomalies={anomalies} />
      ) : (
        <EmptyTab label={tab} />
      )}
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center text-sm text-ink-300">
      {label} — populated once ingestion (M2/M3) is wired to this item's documents.
    </div>
  );
}

function AnnotatedView({
  rows,
  autoCount,
  anomalies,
}: {
  rows: AnnotatedRow[];
  autoCount: number;
  anomalies: AnnotatedRow[];
}) {
  const coverage = Math.round((autoCount / rows.length) * 100);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-laurel-100 bg-laurel-50/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-laurel-900">
            Feature 4 — Remarks auto-compilate (prototipo IT)
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            Dati campione, non da documento reale — vedi{" "}
            <code className="font-mono">apps/web/lib/sampleAnnotation.ts</code>. Matching
            deterministico via <code className="font-mono">@laurus/parser</code>.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-laurel-700">{coverage}%</p>
          <p className="text-xs text-ink-500">
            {autoCount}/{rows.length} righe compilate
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {["#", "Subject", "Am No", "Remarks", "Stato"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.orderIndex}
                className={`border-b border-slate-50 ${
                  r.status === "auto" ? "bg-laurel-50/30" : "bg-gold-500/5"
                }`}
              >
                <td className="px-4 py-3 align-top text-sm text-ink-300">{r.orderIndex}</td>
                <td className="px-4 py-3 align-top text-sm text-ink-900">{r.subject}</td>
                <td className="px-4 py-3 align-top font-mono text-xs text-ink-700">{r.amNo ?? "–"}</td>
                <td className="max-w-[380px] px-4 py-3 align-top text-sm text-ink-700">
                  {r.status === "auto" ? r.remarks : <span className="text-ink-300">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {r.status === "auto" ? (
                    <span className="inline-flex rounded-md bg-laurel-800 px-2 py-0.5 text-xs font-semibold text-white">
                      Compilata
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md bg-gold-500/15 px-2 py-0.5 text-xs font-semibold text-gold-600 ring-1 ring-inset ring-gold-500/30">
                      Da controllare
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {anomalies.length > 0 && (
        <div className="mt-6 rounded-xl border border-gold-500/25 bg-gold-500/5 p-4">
          <p className="mb-2 text-sm font-semibold text-ink-900">
            Report anomalie ({anomalies.length})
          </p>
          <ul className="space-y-1 text-sm text-ink-700">
            {anomalies.map((a) => (
              <li key={a.orderIndex} className="flex gap-2">
                <span className="font-mono text-xs text-ink-500">{a.subject}</span>
                <span className="text-ink-300">—</span>
                <span>{REASON_LABEL[a.reason ?? ""] ?? a.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
