import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { ItemTabs } from "@/components/ItemTabs";
import { ItemFiles } from "@/components/ItemFiles";
import { RequestVerifiedVl } from "@/components/RequestVerifiedVl";
import { FollowButton } from "@/components/FollowButton";
import { CommitteeChip } from "@/components/badges";
import { plenaryFileUrl } from "@laurus/parser";
import { rapporteurLabel } from "@/lib/rapporteur";
import { getItemByCode, getItemAmendments, getItemVotRequests, getItemOfficialVl, getItemFiles } from "@/lib/data";
import { hasAnnotatedVl } from "@/lib/annotatedVl";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LANGUAGES, DOCUMENT_LANGUAGE_SET } from "@/lib/languages";

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
  const files = item ? await getItemFiles(item.id) : [];

  // The member's working languages drive which VL downloads are offered.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("languages").eq("id", user.id).single()
    : { data: null };
  const stored: string[] = profile?.languages?.length ? profile.languages : DEFAULT_LANGUAGES;
  // Only what the interface offers today (IT · EN · NL), never an empty set.
  const userLangs: string[] = stored.filter((l) => DOCUMENT_LANGUAGE_SET.has(l));
  if (userLangs.length === 0) userLangs.push("it");
  // English is always on offer for the verified list, whatever the member set
  // as their own: it is the language the amendments are tabled in, so it is
  // the one you reach for to check a wording against the original.
  const vlLangs: string[] = [...new Set([...userLangs, "en"])];
  // The EP's own page for this file, in the reader's language.
  const epFileUrl = plenaryFileUrl(code, userLangs[0] ?? "en");

  // Is this member following the file, and on which channels?
  const { data: subs } =
    user && item
      ? await supabase.from("subscriptions").select("channel").eq("user_id", user.id).eq("scope", "item").eq("target_id", item.id)
      : { data: null };
  const followChannels = (subs ?? []).map((s) => s.channel as string);

  // The EP's own list, or real amendments in DB → VL generated from EP data;
  // else static registry.
  const annotatedVlAvailable = officialVl !== null || amendments.length > 0 || hasAnnotatedVl(code);

  return (
    <div className="min-h-screen">
      <TopNav />

      <main className="mx-auto max-w-5xl px-8 py-16 lg:px-12 lg:py-20">
        <Link
          href="/"
          className="press -ml-3 mb-10 inline-flex items-center gap-2 rounded-full px-3 py-2 text-[0.8125rem] font-semibold text-ink-400 hover:bg-ink-900/[0.04] hover:text-eu-900"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          All votes
        </Link>

        <div className="mb-12 flex flex-wrap items-start justify-between gap-x-10 gap-y-7">
          <div>
          {item?.rapporteur && (
            <h1 className="display text-display-md font-bold uppercase tracking-[-0.02em] text-eu-900">{rapporteurLabel(item.rapporteur)}</h1>
          )}
          <p className={`${item?.rapporteur ? "mt-4 text-[1.1875rem] font-semibold" : "display text-display-sm font-bold"} max-w-[46rem] leading-snug text-ink-900`}>
            {item?.title.en || item?.title.it || "Item not found"}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-[0.875rem] font-medium text-ink-400">
            {/* The code is the handle people already read, so it is the thing
                to make clickable: the EP's own page for the file, where the
                text and the amendments sit together. */}
            {epFileUrl ? (
              <a
                href={epFileUrl}
                target="_blank"
                rel="noreferrer"
                title={`Open ${code} on europarl.europa.eu — text and amendments`}
                className="group inline-flex items-center gap-1 font-mono text-eu-700 hover:text-eu-900"
              >
                <span className="group-hover:underline">{code}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="opacity-50 group-hover:opacity-100">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </a>
            ) : (
              <span className="font-mono text-eu-700">{code}</span>
            )}
            {(item?.committees?.length ? item.committees : item?.committee ? [item.committee] : []).map((c) => (
              <CommitteeChip key={c} code={c} />
            ))}
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
          </div>
          {/* Where the list comes from: the EP's own, with its version, or
              a LAURUS draft until the EP publishes one. */}
          <p className="mt-5 max-w-[46rem] text-[0.8125rem] leading-relaxed text-ink-400">
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

          <div className="flex shrink-0 flex-col items-end gap-3">
            {item && user && (
              <FollowButton itemId={item.id} code={code} following={followChannels.length > 0} channels={followChannels} />
            )}
          {annotatedVlAvailable && (
            <>
              <RequestVerifiedVl code={code} lang={vlLangs[0] ?? "it"} />
              {vlLangs.slice(1).map((l) => (
                <RequestVerifiedVl key={l} code={code} lang={l} secondary />
              ))}

              {/* The instant file skips both verification passes, so it is
                  offered as a draft and labelled as one, in the filename too. */}
              <details className="text-right">
                <summary className="cursor-pointer text-[0.75rem] font-medium text-ink-300 transition-colors hover:text-ink-500">
                  or download an unverified draft
                </summary>
                <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
                  {userLangs.map((l) => (
                    <a
                      key={l}
                      href={`/api/annotated-vl?code=${encodeURIComponent(code)}&lang=${l}`}
                      className="btn-secondary px-3.5 py-1.5 text-[0.6875rem] uppercase tracking-[0.1em] text-ink-500 hover:text-eu-900"
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

        <div className="mb-14">
          <ItemFiles code={code} files={files} langs={userLangs} amendmentCount={amendments.length} />
        </div>

        <ItemTabs code={code} amendments={amendments} languages={languages} votRequests={votRequests} />
      </main>
    </div>
  );
}
