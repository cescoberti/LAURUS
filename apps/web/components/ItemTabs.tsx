"use client";

import { useState, type ReactNode } from "react";
import { remarksFor, signatoryLabel } from "@laurus/parser";
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
      className="btn-secondary px-3.5 py-1.5 text-[0.6875rem] text-ink-500 hover:text-eu-900"
      title="Copy (formatting included) to paste into the VL"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

const TABS = ["Amendments", "Split & Separate"] as const;
type Tab = (typeof TABS)[number];

const LANG_LABEL: Record<string, string> = { it: "IT", en: "EN", nl: "NL" };

export function ItemTabs({
  code,
  amendments,
  languages,
  votRequests,
}: {
  code: string;
  amendments: ConsolidatedAmendment[];
  languages: string[];
  votRequests: Record<string, VotPayload>;
}) {
  const [tab, setTab] = useState<Tab>(amendments.length ? "Amendments" : "Split & Separate");

  return (
    <div>
      {/* A segmented control in a glass track: the tab bar is a single
          object, not two labels sitting on a rule. */}
      <div className="mb-10 inline-flex gap-1 rounded-full bg-white/60 p-1.5 backdrop-blur shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(20,26,43,0.06)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`press flex items-center gap-2 rounded-full px-5 py-2.5 text-[0.9375rem] ${
              tab === t
                ? "bg-white font-semibold text-eu-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_0_1px_rgba(20,26,43,0.06),0_6px_16px_-8px_rgba(20,26,43,0.2)]"
                : "font-medium text-ink-400 hover:text-ink-900"
            }`}
          >
            {t}
            {t === "Amendments" && amendments.length > 0 && (
              <span className="rounded-full bg-eu-900/[0.07] px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-eu-700">
                {amendments.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "Amendments" && <AmendmentsView code={code} amendments={amendments} languages={languages} />}
      {tab === "Split & Separate" && <SplitSeparateView votRequests={votRequests} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Amendments — real, consolidated across languages
// ---------------------------------------------------------------------------

function AmendmentsView({
  code,
  amendments,
  languages,
}: {
  code: string;
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
        {/* Nothing ingested here does not mean nothing published there: the
            EP's own blocks are still worth offering, and this is the case
            where they are most wanted. */}
        <div className="mt-4 flex justify-center gap-2">
          {(languages.length ? languages : ["it", "en"]).map((l) => (
            <a
              key={l}
              href={`/api/item-amendments?code=${encodeURIComponent(code)}&lang=${l}`}
              className="btn-secondary px-3.5 py-1.5 text-xs text-ink-500 hover:text-eu-900"
            >
              Try the EP files · {l.toUpperCase()}
            </a>
          ))}
        </div>
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
        <div className="flex items-center gap-2">
          {/* The EP's own amendment DOCX, in the language on screen: what you
              read the Remarks against when checking the list before a vote. */}
          <a
            href={`/api/item-amendments?code=${encodeURIComponent(code)}&lang=${lang}`}
            className="btn-secondary px-3.5 py-1.5 text-xs text-ink-500 hover:text-eu-900"
            title={`Every amendment block the EP published for this report, in ${lang.toUpperCase()}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download all · {lang.toUpperCase()}
          </a>
          {languages.length > 1 && (
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              {languages.map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    lang === l ? "bg-white text-eu-900 shadow-sm" : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  {LANG_LABEL[l] ?? l.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {amendments.map((a) => {
          const target = a.target[lang] ?? Object.values(a.target)[0];
          const original = a.originalText[lang] ?? "";
          const amended = a.amendedText[lang] ?? "";
          const remarks = remarksFor(original || null, amended || null);
          const signatory = signatoryLabel(a.tabledMembers, a.tabledGroup);
          return (
            <div key={a.number} className="card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-ink-900/[0.055] bg-slate-50/60 px-4 py-2.5">
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-eu-900 px-1.5 text-xs font-bold text-white">
                  {a.number}
                </span>
                <span className="text-sm font-medium text-ink-900">{target}</span>
                {signatory && (
                  <span
                    className="min-w-0 truncate text-[0.8125rem] text-ink-500"
                    title={a.tabledMembers?.length ? `${a.tabledMembers.join(", ")}${a.tabledGroup ? ` — ${a.tabledGroup}` : ""}` : undefined}
                  >
                    {signatory}
                  </span>
                )}
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
                    lang === l ? "bg-white text-eu-900 shadow-sm" : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={copy}
            className="btn-secondary px-4 py-2 text-xs text-ink-700"
          >
            {copied ? "Copied ✓" : "Copy CSV"}
          </button>
          <button
            onClick={download}
            className="btn-primary px-4 py-2 text-xs"
          >
            Download CSV
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-ink-900/[0.055] bg-slate-50/60">
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
                      r.type === "split" ? "bg-eu-100 text-eu-900" : "bg-gold-500/15 text-gold-600"
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
