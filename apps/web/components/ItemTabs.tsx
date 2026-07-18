"use client";

import { useMemo, useState, type ReactNode } from "react";
import { remarksFor } from "@laurus/parser";
import type { ConsolidatedAmendment } from "@/lib/data";
import { annotate, sampleVlRows, REASON_LABEL, type AnnotatedRow } from "@/lib/sampleAnnotation";
import { sampleSplitSeparateRows, sampleSplitSeparateCsv } from "@/lib/sampleSplitSeparate";

/** Render light HTML (<b>/<i>/<s> from the remarks diff) as React nodes. */
function RichText({ value }: { value: string }) {
  const nodes: ReactNode[] = [];
  const stack: Array<"b" | "i" | "s"> = [];
  let key = 0;
  const wrap = (text: string): ReactNode => {
    let node: ReactNode = text;
    for (const tag of [...stack].reverse()) {
      if (tag === "b") node = <strong key={key++}>{node}</strong>;
      else if (tag === "i") node = <em key={key++}>{node}</em>;
      else node = <s key={key++} className="text-red-700/80">{node}</s>;
    }
    return <span key={key++}>{node}</span>;
  };
  for (const piece of value.split(/(<\/?[bis]>|\n)/)) {
    if (!piece) continue;
    if (piece === "\n") {
      nodes.push(<br key={key++} />);
      continue;
    }
    const tag = /^<(\/?)([bis])>$/.exec(piece);
    if (tag) {
      if (tag[1]) {
        const idx = stack.lastIndexOf(tag[2] as "b" | "i" | "s");
        if (idx >= 0) stack.splice(idx, 1);
      } else {
        stack.push(tag[2] as "b" | "i" | "s");
      }
      continue;
    }
    nodes.push(wrap(piece));
  }
  return <>{nodes}</>;
}

/** Copy rich text to the clipboard so pasting into Word keeps bold/strike. */
async function copyRich(lightHtml: string) {
  const html = lightHtml.replace(/\n/g, "<br>");
  const plain = lightHtml.replace(/<[^>]+>/g, "");
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(plain); // fallback: plain only
  }
}

function CopyButton({ value, label = "Copia" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await copyRich(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-ink-500 transition-colors hover:bg-laurel-50 hover:text-laurel-800"
      title="Copia (formattazione inclusa) per incollare nella VL"
    >
      {copied ? "Copiato ✓" : label}
    </button>
  );
}

const TABS = ["Amendments", "Split & Separate", "Annotated VL"] as const;
type Tab = (typeof TABS)[number];

const LANG_LABEL: Record<string, string> = { en: "EN", it: "IT", fr: "FR", de: "DE", es: "ES" };

export function ItemTabs({
  amendments,
  languages,
}: {
  amendments: ConsolidatedAmendment[];
  languages: string[];
}) {
  const [tab, setTab] = useState<Tab>(amendments.length ? "Amendments" : "Split & Separate");

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-laurel-700 text-laurel-800"
                : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {t}
            {t === "Amendments" && amendments.length > 0 && (
              <span className="rounded-full bg-laurel-100 px-1.5 text-[11px] font-semibold text-laurel-700">
                {amendments.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "Amendments" && <AmendmentsView amendments={amendments} languages={languages} />}
      {tab === "Split & Separate" && <SplitSeparateView />}
      {tab === "Annotated VL" && <AnnotatedView />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Amendments — real, consolidated across languages
// ---------------------------------------------------------------------------

function AmendmentsView({
  amendments,
  languages,
}: {
  amendments: ConsolidatedAmendment[];
  languages: string[];
}) {
  const [lang, setLang] = useState<string>(languages.includes("it") ? "it" : languages[0] ?? "en");

  if (amendments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center text-sm text-ink-300">
        Nessun emendamento su due colonne in questa relazione — oppure non ancora estratto.
        <br />
        Gli emendamenti vengono estratti dal DOCX della relazione via{" "}
        <code className="font-mono">npm run sync-amendments</code>.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-500">
          <span className="font-semibold text-ink-900">{amendments.length}</span> emendamenti —{" "}
          <strong className="font-semibold">aggiunte in grassetto</strong>,{" "}
          <s className="text-red-700/80">soppressioni barrate</s>.
        </p>
        {languages.length > 1 && (
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {languages.map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  lang === l ? "bg-white text-laurel-800 shadow-sm" : "text-ink-500 hover:text-ink-900"
                }`}
              >
                {LANG_LABEL[l] ?? l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {amendments.map((a) => {
          const target = a.target[lang] ?? Object.values(a.target)[0];
          const original = a.originalText[lang] ?? "";
          const amended = a.amendedText[lang] ?? "";
          const remarks = remarksFor(original || null, amended || null);
          return (
            <div key={a.number} className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-laurel-800 px-1.5 text-xs font-bold text-white">
                  {a.number}
                </span>
                <span className="text-sm font-medium text-ink-900">{target}</span>
                {a.kind !== "standard" && (
                  <span className="rounded-md bg-gold-500/15 px-2 py-0.5 text-[11px] font-semibold text-gold-600 ring-1 ring-inset ring-gold-500/30">
                    {a.kind}
                  </span>
                )}
                {!a.languages.includes(lang) && (
                  <span className="text-[11px] text-ink-300">(testo non disponibile in {LANG_LABEL[lang] ?? lang})</span>
                )}
                <span className="ml-auto">
                  <CopyButton value={remarks} label="Copia remarks" />
                </span>
              </div>
              <div className="p-4">
                <p className="text-sm italic leading-relaxed text-ink-900">
                  <RichText value={remarks} />
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Split & Separate — real parser output over a captured VOT, with export
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = {
  split: "Split",
  separate: "Separata",
  rcv: "Appello nominale",
};

function SplitSeparateView() {
  const rows = sampleSplitSeparateRows;
  const [copied, setCopied] = useState(false);

  const download = () => {
    const blob = new Blob([sampleSplitSeparateCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "split-separate.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(sampleSplitSeparateCsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <p className="mb-4 rounded-lg bg-gold-500/10 px-3 py-2 text-xs text-ink-500 ring-1 ring-inset ring-gold-500/20">
        Estratto reale da una VOT catturata (item 6.1 Uganda) tramite{" "}
        <code className="font-mono">@laurus/parser</code> — l&apos;aggancio alla VOT live arriva con M3.
        L&apos;estrazione e l&apos;export qui sotto sono già il codice di produzione.
      </p>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink-500">
          <span className="font-semibold text-ink-900">{rows.length}</span> richieste di voto (split /
          separato / appello nominale)
        </p>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-slate-50"
          >
            {copied ? "Copiato ✓" : "Copia CSV"}
          </button>
          <button
            onClick={download}
            className="rounded-lg bg-laurel-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-laurel-900"
          >
            Scarica CSV
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {["Tipo", "Oggetto", "Gruppo", "Parte", "Confine (verbatim)"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="px-4 py-3 align-top">
                  <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      r.type === "split"
                        ? "bg-laurel-100 text-laurel-800"
                        : r.type === "separate"
                          ? "bg-gold-500/15 text-gold-600"
                          : "bg-slate-100 text-ink-500"
                    }`}
                  >
                    {TYPE_LABEL[r.type] ?? r.type}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-sm text-ink-900">{r.subject}</td>
                <td className="px-4 py-3 align-top text-sm text-ink-700">{r.group}</td>
                <td className="px-4 py-3 align-top text-xs text-ink-500">{r.partLabel ?? "–"}</td>
                <td className="max-w-[360px] px-4 py-3 align-top text-xs text-ink-700">{r.boundary ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Annotated VL — Feature 4 deterministic Remarks demo (unchanged sample)
// ---------------------------------------------------------------------------

function AnnotatedView() {
  const rows = useMemo(() => annotate(sampleVlRows), []);
  const anomalies = rows.filter((r) => r.status === "anomaly");
  const autoCount = rows.length - anomalies.length;
  const coverage = Math.round((autoCount / rows.length) * 100);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-laurel-100 bg-laurel-50/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-laurel-900">Feature 4 — Remarks auto-compilate (prototipo IT)</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Dati campione — matching deterministico via <code className="font-mono">@laurus/parser</code>.
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
            {rows.map((r: AnnotatedRow) => (
              <tr key={r.orderIndex} className={`border-b border-slate-50 ${r.status === "auto" ? "bg-laurel-50/30" : "bg-gold-500/5"}`}>
                <td className="px-4 py-3 align-top text-sm text-ink-300">{r.orderIndex}</td>
                <td className="px-4 py-3 align-top text-sm text-ink-900">{r.subject}</td>
                <td className="px-4 py-3 align-top font-mono text-xs text-ink-700">{r.amNo ?? "–"}</td>
                <td className="max-w-[380px] px-4 py-3 align-top text-sm text-ink-700">
                  {r.status === "auto" ? r.remarks : <span className="text-ink-300">—</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  {r.status === "auto" ? (
                    <span className="inline-flex rounded-md bg-laurel-800 px-2 py-0.5 text-xs font-semibold text-white">Compilata</span>
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
          <p className="mb-2 text-sm font-semibold text-ink-900">Report anomalie ({anomalies.length})</p>
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
