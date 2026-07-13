import { TopNav } from "@/components/TopNav";
import { AnnotatedVlTab } from "@/components/AnnotatedVlTab";
import { CommitteeChip } from "@/components/badges";
import { getItemByCode } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ItemDetail({ params }: { params: Promise<{ code: string[] }> }) {
  const { code: codeSegments } = await params;
  const code = decodeURIComponent(codeSegments.join("/"));
  const item = await getItemByCode(code);

  const reportEn = item?.documents.find((d) => d.type === "report" && d.language === "en");
  const reportIt = item?.documents.find((d) => d.type === "report" && d.language === "it");

  return (
    <div className="min-h-screen">
      <TopNav />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
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

        <p className="mb-4 rounded-lg bg-gold-500/10 px-3 py-2 text-xs text-ink-500 ring-1 ring-inset ring-gold-500/20">
          Anteprima della VL annotata su dati d&apos;esempio — il collegamento alla voting list reale arriva con M2/M3.
        </p>
        <AnnotatedVlTab />
      </main>
    </div>
  );
}
