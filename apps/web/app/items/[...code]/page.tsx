import { TopNav } from "@/components/TopNav";
import { ItemTabs } from "@/components/ItemTabs";
import { RequestVerifiedVl } from "@/components/RequestVerifiedVl";
import { CommitteeChip } from "@/components/badges";
import { rapporteurLabel } from "@/lib/rapporteur";
import { getItemByCode, getItemAmendments, getItemVotRequests } from "@/lib/data";
import { hasAnnotatedVl } from "@/lib/annotatedVl";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LANGUAGES } from "@/lib/languages";

export const dynamic = "force-dynamic";

export default async function ItemDetail({ params }: { params: Promise<{ code: string[] }> }) {
  const { code: codeSegments } = await params;
  const code = decodeURIComponent(codeSegments.join("/"));
  const item = await getItemByCode(code);
  const { amendments, languages } = item
    ? await getItemAmendments(item.id)
    : { amendments: [], languages: [] };
  const votRequests = item ? await getItemVotRequests(item.id) : {};

  // The member's working languages drive which VL downloads are offered.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("languages").eq("id", user.id).single()
    : { data: null };
  const userLangs: string[] = profile?.languages?.length ? profile.languages : DEFAULT_LANGUAGES;

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
          {item?.rapporteur && (
            <p className="text-sm font-semibold uppercase tracking-wide text-laurel-800">{rapporteurLabel(item.rapporteur)}</p>
          )}
          <h1 className="mt-1 text-2xl font-bold text-ink-900">
            {item?.title.en || item?.title.it || "Item not found"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-500">
            <span className="font-mono text-laurel-700">{code}</span>
            {item?.committee && <CommitteeChip code={item.committee} />}
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
            <div className="flex shrink-0 flex-col items-end gap-2">
              <RequestVerifiedVl code={code} lang={userLangs[0] ?? "it"} />

              {/* The instant file skips both verification passes, so it is
                  offered as a draft and labelled as one, in the filename too. */}
              <details className="text-right">
                <summary className="cursor-pointer text-xs text-ink-300 hover:text-ink-500">
                  or download an unverified draft
                </summary>
                <div className="mt-1.5 flex flex-wrap justify-end gap-1">
                  {userLangs.map((l) => (
                    <a
                      key={l}
                      href={`/api/annotated-vl?code=${encodeURIComponent(code)}&lang=${l}`}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold uppercase text-ink-500 transition-colors hover:border-laurel-300 hover:text-laurel-800"
                      title={`Unverified draft in ${l.toUpperCase()}`}
                    >
                      {l}
                    </a>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>

        <ItemTabs amendments={amendments} languages={languages} votRequests={votRequests} />
      </main>
    </div>
  );
}
