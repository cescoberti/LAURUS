import { TopNav } from "@/components/TopNav";
import { ItemTabs } from "@/components/ItemTabs";
import { RequestVerifiedVl } from "@/components/RequestVerifiedVl";
import { FollowButton } from "@/components/FollowButton";
import { CommitteeChip } from "@/components/badges";
import { rapporteurLabel } from "@/lib/rapporteur";
import { getItemByCode, getItemAmendments, getItemVotRequests, getItemOfficialVl } from "@/lib/data";
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
  const officialVl = item ? await getItemOfficialVl(item.id) : null;

  // The member's working languages drive which VL downloads are offered.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("languages").eq("id", user.id).single()
    : { data: null };
  const userLangs: string[] = profile?.languages?.length ? profile.languages : DEFAULT_LANGUAGES;

  // Is this member following the file, and on which channels?
  const { data: subs } =
    user && item
      ? await supabase.from("subscriptions").select("channel").eq("user_id", user.id).eq("scope", "item").eq("target_id", item.id)
      : { data: null };
  const followChannels = (subs ?? []).map((s) => s.channel as string);

  const reportEn = item?.documents.find((d) => d.type === "report" && d.language === "en");
  const reportIt = item?.documents.find((d) => d.type === "report" && d.language === "it");
  // The EP's own list, or real amendments in DB → VL generated from EP data;
  // else static registry.
  const annotatedVlAvailable = officialVl !== null || amendments.length > 0 || hasAnnotatedVl(code);

  return (
    <div className="min-h-screen">
      <TopNav />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
          {item?.rapporteur && (
            <h1 className="display text-[1.75rem] font-extrabold uppercase text-eu-900">{rapporteurLabel(item.rapporteur)}</h1>
          )}
          <p className={`${item?.rapporteur ? "mt-1 text-lg font-semibold" : "text-2xl font-bold"} leading-snug text-ink-900`}>
            {item?.title.en || item?.title.it || "Item not found"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-500">
            <span className="font-mono text-eu-700">{code}</span>
            {item?.committee && <CommitteeChip code={item.committee} />}
            {item?.vote_date && (
              <span>
                {item.vote_date >= new Date().toISOString().slice(0, 10) ? "Vote on" : "Voted"}{" "}
                {new Date(`${item.vote_date}T12:00:00Z`).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            )}
            {reportEn && (
              <a href={reportEn.source_url} target="_blank" rel="noreferrer" className="font-medium text-eu-600 hover:underline">
                Report (EN)
              </a>
            )}
            {reportIt && (
              <a href={reportIt.source_url} target="_blank" rel="noreferrer" className="font-medium text-eu-600 hover:underline">
                Report (IT)
              </a>
            )}
          </div>
          {/* Where the list comes from: the EP's own, with its version, or
              a LAURUS draft until the EP publishes one. */}
          <p className="mt-2 text-xs text-ink-500">
            {officialVl ? (
              <>
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
                  <span className={`h-[7px] w-[7px] rounded-full ${/final/i.test(officialVl.version_label) ? "bg-laurel-600" : "bg-amber-500"}`} />
                  Official voting list · {officialVl.version_label}
                </span>
                {" · "}
                <a href={officialVl.source_url} target="_blank" rel="noreferrer" className="text-eu-600 hover:underline">
                  EP source
                </a>
                {" · fetched "}
                {new Date(officialVl.fetched_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </>
            ) : amendments.length > 0 ? (
              <span>No official voting list from the EP yet — the download is a LAURUS draft built from the amendments.</span>
            ) : null}
          </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            {item && user && (
              <FollowButton itemId={item.id} code={code} following={followChannels.length > 0} channels={followChannels} />
            )}
          {annotatedVlAvailable && (
            <>
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
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold uppercase text-ink-500 transition-colors hover:border-eu-200 hover:text-eu-900"
                      title={`Unverified draft in ${l.toUpperCase()}`}
                    >
                      {l}
                    </a>
                  ))}
                </div>
              </details>
            </>
          )}
          </div>
        </div>

        <ItemTabs amendments={amendments} languages={languages} votRequests={votRequests} />
      </main>
    </div>
  );
}
