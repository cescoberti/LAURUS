import type { ItemFile } from "@/lib/data";
import { DOCUMENT_LANGUAGE_CODES } from "@/lib/languages";

const TYPE_LABEL: Record<ItemFile["type"], string> = {
  report: "Report",
  amendment: "Amendments",
  voting_list: "Voting list",
  split: "Split votes",
  rcv: "Roll-call",
};

// The order an advisor opens them in, not the order the enum declares them.
const TYPE_ORDER: Array<ItemFile["type"]> = ["amendment", "voting_list", "report", "split", "rcv"];

function extensionOf(url: string): string {
  return /\.(docx?|pdf|xml|html?)(?:$|[?#])/i.exec(url)?.[1]?.toUpperCase() ?? "FILE";
}

function size(bytes: number | null): string | null {
  if (!bytes) return null;
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const LANGS = DOCUMENT_LANGUAGE_CODES as readonly string[];

/**
 * Every document the EP published for this file: each one on its own, or the
 * lot in one zip. They are served through LAURUS, because the EP's document
 * host turns a plain browser away — the link to the EP site is kept next to
 * each one anyway, for the record.
 */
export function ItemFiles({ code, files }: { code: string; files: ItemFile[] }) {
  // Only the languages the interface offers, newest version of each.
  const offered = files.filter((f) => LANGS.includes(f.language));
  const seen = new Set<string>();
  const latest = offered.filter((f) => {
    const key = `${f.type}:${f.language}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const groups = TYPE_ORDER.map((type) => ({
    type,
    rows: latest
      .filter((f) => f.type === type)
      .sort((a, b) => LANGS.indexOf(a.language) - LANGS.indexOf(b.language)),
  })).filter((g) => g.rows.length > 0);

  const zip = (lang?: string) => `/api/item-files?code=${encodeURIComponent(code)}${lang ? `&lang=${lang}` : ""}`;
  const langsPresent = LANGS.filter((l) => latest.some((f) => f.language === l));

  if (groups.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-ink-300">
        The EP has published no document for this file in IT, EN or NL yet.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <h2 className="text-sm font-bold text-ink-900">Files from the EP</h2>
        <span className="text-xs text-ink-300">
          {latest.length} document{latest.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {langsPresent.length > 1 &&
            langsPresent.map((l) => (
              <a
                key={l}
                href={zip(l)}
                className="press rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-semibold uppercase text-ink-500 hover:border-eu-200 hover:bg-eu-50 hover:text-eu-900"
                title={`Every ${l.toUpperCase()} document for this file, in one zip`}
              >
                ↓ {l}
              </a>
            ))}
          <a
            href={zip()}
            className="press rounded-lg bg-eu-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-eu-800"
            title="Every document for this file, in one zip"
          >
            ↓ Download all <span className="font-medium text-white/60">.zip</span>
          </a>
        </div>
      </header>

      <div className="divide-y divide-slate-100">
        {groups.map((g) => (
          <div key={g.type} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="w-[7.5rem] shrink-0 text-[13px] font-semibold text-ink-900">{TYPE_LABEL[g.type]}</div>
            <div className="flex flex-wrap items-center gap-2">
              {g.rows.map((f) => (
                <span key={f.id} className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200">
                  <a
                    href={`/api/item-files?code=${encodeURIComponent(code)}&doc=${f.id}`}
                    className="press flex items-baseline gap-1.5 px-2.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-eu-50 hover:text-eu-900"
                    title={`Download the ${f.language.toUpperCase()} ${TYPE_LABEL[g.type].toLowerCase()}`}
                  >
                    <span className="uppercase">{f.language}</span>
                    <span className="text-[10px] font-medium text-ink-300">{extensionOf(f.source_url)}</span>
                    {size(f.byte_size) && <span className="text-[10px] font-medium text-ink-300">{size(f.byte_size)}</span>}
                  </a>
                  <a
                    href={f.source_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open on the EP site"
                    className="border-l border-slate-200 px-1.5 py-1.5 text-ink-300 hover:bg-slate-50 hover:text-eu-700"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <path d="M15 3h6v6M10 14 21 3" />
                    </svg>
                  </a>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
