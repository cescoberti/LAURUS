import { TopNav } from "@/components/TopNav";
import { ItemTabs } from "@/components/ItemTabs";
import { CommitteeChip } from "@/components/badges";
import { getItemByCode, getItemAmendments } from "@/lib/data";
import { hasAnnotatedVl } from "@/lib/annotatedVl";

export const dynamic = "force-dynamic";

export default async function ItemDetail({ params }: { params: Promise<{ code: string[] }> }) {
  const { code: codeSegments } = await params;
  const code = decodeURIComponent(codeSegments.join("/"));
  const item = await getItemByCode(code);
  const { amendments, languages } = item
    ? await getItemAmendments(item.id)
    : { amendments: [], languages: [] };

  const reportEn = item?.documents.find((d) => d.type === "report" && d.language === "en");
  const reportIt = item?.documents.find((d) => d.type === "report" && d.language === "it");
  // Real amendments in DB → VL generated from EP data; else static registry.
  const annotatedVlAvailable = amendments.length > 0 || hasAnnotatedVl(code);

  return (
    <div className="min-h-screen">
      <TopNav />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
          <p className="font-mono text-sm text-laurel-700">{code}</p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">
            {item?.title.en || item?.title.it || "Item not found"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-500">
            {item?.committee && <CommitteeChip code={item.committee} />}
            {item?.rapporteur && <span>{item.rapporteur}</span>}
            {item?.vote_date && (
              <span>
                Voted{" "}
                {new Date(`${item.vote_date}T12:00:00Z`).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            )}
            {reportEn && (
              <a href={reportEn.source_url} target="_blank" rel="noreferrer" className="font-medium text-laurel-600 hover:underline">
                Report (EN)
              </a>
            )}
            {reportIt && (
              <a href={reportIt.source_url} target="_blank" rel="noreferrer" className="font-medium text-laurel-600 hover:underline">
                Report (IT)
              </a>
            )}
          </div>
          </div>

          {annotatedVlAvailable && (
            <a
              href={`/api/annotated-vl?code=${encodeURIComponent(code)}`}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-laurel-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-laurel-900"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download annotated VL
            </a>
          )}
        </div>

        <ItemTabs amendments={amendments} languages={languages} />
      </main>
    </div>
  );
}
