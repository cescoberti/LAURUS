"use client";

import { useState, type ReactNode } from "react";
import { remarksFor } from "@laurus/parser";
import type { ConsolidatedAmendment, VotPayload } from "@/lib/data";

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

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await copyRich(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-ink-500 transition-colors hover:bg-laurel-50 hover:text-laurel-800"
      title="Copy (formatting included) to paste into the VL"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

const TABS = ["Amendments", "Split & Separate"] as const;
type Tab = (typeof TABS)[number];

const LANG_LABEL: Record<string, string> = { en: "EN", it: "IT", fr: "FR", de: "DE", es: "ES" };

export function ItemTabs({
  amendments,
  languages,
  votRequests,
}: {
  amendments: ConsolidatedAmendment[];
  languages: string[];
  votRequests: Record<string, VotPayload>;
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
      {tab === "Split & Separate" && <SplitSeparateView votRequests={votRequests} />}
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
        No two-column amendments for this report — or not ingested yet.
        <br />
        Amendments are extracted from the report DOCX via{" "}
        <code className="font-mono">npm run sync-amendments</code>.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-500">
          <span className="font-semibold text-ink-900">{amendments.length}</span> amendments —{" "}
          <strong className="font-semibold">additions in bold</strong>,{" "}
          <s className="text-red-700/80">deletions struck through</s>.
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
                  <span className="text-[11px] text-ink-300">(text not available in {LANG_LABEL[lang] ?? lang})</span>
                )}
                <span className="ml-auto">
                  <CopyButton value={remarks} label="Copy remarks" />
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
// Split & Separate — real per-item data from the official VOT XML
// ---------------------------------------------------------------------------

interface FlatVotRow {
  type: "split" | "separate";
  subject: string;
  group: string;
  part: string | null;
  text: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  split: "Split",
  separate: "Separate",
};

// Only split and separate votes belong here — roll-call requests (p.rollCalls)
// are already flagged on the voting list itself, so they are intentionally left out.
function flattenVot(p: VotPayload): FlatVotRow[] {
  const rows: FlatVotRow[] = [];
  for (const sv of p.splitVotes) {
    for (const part of sv.parts) {
      rows.push({ type: "split", subject: sv.subject, group: sv.group, part: part.section, text: part.text });
    }
  }
  for (const s of p.separateVotes) rows.push({ type: "separate", subject: s.targets, group: s.group, part: null, text: null });
  return rows;
}

// The table stays scannable; the full official partValue is kept in the CSV
// export and on hover (title attribute).
function shortText(t: string, max = 80): string {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function votCsv(rows: FlatVotRow[]): string {
  const esc = (v: string | null) => {
    const s = v ?? "";
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    "Type,Subject,Group,Part,Text",
    ...rows.map((r) => [TYPE_LABEL[r.type], r.subject, r.group, r.part, r.text].map(esc).join(",")),
  ].join("\n");
}

function SplitSeparateView({ votRequests }: { votRequests: Record<string, VotPayload> }) {
  const langs = Object.keys(votRequests).sort();
  const [lang, setLang] = useState<string>(langs.includes("it") ? "it" : langs[0] ?? "it");
  const [copied, setCopied] = useState(false);
  const payload = votRequests[lang];
  const rows = payload ? flattenVot(payload) : [];

  if (!payload || rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center text-sm text-ink-300">
        No vote requests recorded for this report — they appear once the official VOT for the
        voting day is published.
      </div>
    );
  }

  const csv = votCsv(rows);
  const download = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `split-separate-${lang}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-ink-500">
          <span className="font-semibold text-ink-900">{rows.length}</span> split &amp; separate requests
          from the official VOT — full text in the CSV export and on hover.
        </p>
        <div className="flex items-center gap-2">
          {langs.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              {langs.map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
                    lang === l ? "bg-white text-laurel-800 shadow-sm" : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={copy}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-slate-50"
          >
            {copied ? "Copied ✓" : "Copy CSV"}
          </button>
          <button
            onClick={download}
            className="rounded-lg bg-laurel-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-laurel-900"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-card">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {["Type", "Subject", "Group", "Part", "Text"].map((h) => (
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
                    className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      r.type === "split" ? "bg-laurel-100 text-laurel-800" : "bg-gold-500/15 text-gold-600"
                    }`}
                  >
                    {TYPE_LABEL[r.type]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-sm text-ink-900">{r.subject}</td>
                <td className="px-4 py-3 align-top text-sm text-ink-700">{r.group}</td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-ink-500">{r.part ?? "–"}</td>
                <td className="px-4 py-3 align-top text-sm leading-relaxed text-ink-700" title={r.text ?? undefined}>
                  {r.text ? shortText(r.text) : <span className="text-ink-300">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
