/**
 * THE source of items.rapporteur and items.committee.
 *
 *   npm run sync-texts-tabled                      # shows what it would write
 *   npm run sync-texts-tabled -- --write           # writes it
 *   npm run sync-texts-tabled -- saved-page.html   # read a saved page instead
 *   npm run sync-texts-tabled -- --check          # what the site shows vs open data
 *
 * Who the rapporteur is on a report that has been tabled and not yet voted —
 * the week LAURUS exists for. Two sources for the same facts:
 *
 * The EP Open Data API, by default. `plenary-documents/{id}` carries a tabled
 * report's participations from the day it is tabled: RAPPORTEUR / RAPPORTEUR_CO
 * as persistent person ids, the responsible committees as AUTHOR organisations.
 * The script asks about exactly the items that are missing a name, which is
 * also how it reaches the reports that have scrolled off the web page — the
 * page shows the latest ten, and on 27/10/2026 three of the items waiting for a
 * rapporteur (A10-0275, A10-0271, A10-0268) were already past it.
 *
 * A saved copy of "Texts tabled → Reports", when a file is passed. The page
 * cannot be fetched: www.europarl.europa.eu answers an HTTP client with 403 —
 * checked from a residential address and from a datacenter one — so a copy has
 * to be saved out of a browser (⌘S). It prints the same names, and it stays
 * here as the way to check the API against what a human sees:
 *   https://www.europarl.europa.eu/plenary/en/texts-submitted.html
 *
 * --check does the other direction: instead of filling what is empty, it holds
 * what the site is already showing against open data. The column is filled by
 * whichever sync reaches the row first — the draft agenda, the votes page, this
 * one — and they write different forms of the same name, so the comparison is
 * made on the label the site renders (surnames, upper case): "STAĶIS" and
 * "Mārtiņš STAĶIS" read the same to anyone, a missing co-rapporteur does not.
 *
 * `sync-rapporteurs` reads these names out of the per-sitting VOT XML, but that
 * is published after the vote, so it can say nothing about the files anyone is
 * actually preparing; it is a backfill for past part-sessions and nothing more.
 *
 * Writes only where the column is NULL; nothing at all without --write.
 */
import { readFileSync } from "node:fs";
import { parseTextsTabled } from "@laurus/parser/texts-tabled";
import { reportCodeToWorkId, reportRefsFromWork } from "@laurus/parser/tabled-report-api";
import { rapporteurLabel } from "@laurus/parser/rapporteur-name";
import { getPlenaryDocument, listMembers } from "./epApi.ts";
import { makeAdminClient, sleep } from "./epShared.ts";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
/** Compare what is already there instead of filling what is not. */
const CHECK = args.includes("--check");
/** How many documents one run may ask the API about; it is one call each. */
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.slice("--limit=".length) ?? 60);
const file = args.find((a) => !a.startsWith("--"));

interface Item {
  id: string;
  code: string;
  rapporteur: string | null;
  committee: string | null;
}

/** A report's names, whichever source they came from. */
interface Names {
  code: string;
  rapporteurs: string[];
  committees: string[];
}

type Client = ReturnType<typeof makeAdminClient>;

interface Patch {
  id: string;
  code: string;
  patch: Record<string, string>;
}

async function readItems(supabase: Client, codes: string[]): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id, code, rapporteur, committee")
    .in("code", codes);
  if (error || !data) throw new Error(`items read: ${error?.message}`);
  return data as Item[];
}

/** Report items with a hole in them, newest report first. */
async function itemsMissingNames(supabase: Client): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id, code, rapporteur, committee")
    .like("code", "A%")
    .or("rapporteur.is.null,committee.is.null");
  if (error || !data) throw new Error(`items read: ${error?.message}`);
  // Newest first: the week ahead is what anyone is preparing, and --limit cuts
  // from the far end. The code's year sorts before its number — A10-0248/2025
  // is older than A10-0092/2026 however the strings compare.
  const rank = (code: string) => {
    const m = /^[A-Z]+\d+-(\d+)\/(\d{4})$/.exec(code);
    return m ? Number(m[2]) * 10_000 + Number(m[1]) : 0;
  };
  return (data as Item[]).sort((a, b) => rank(b.code) - rank(a.code));
}

/**
 * Ask the API about each code in turn.
 *
 * A 404 is the normal state of affairs, not a failure: the agenda announces a
 * report's number before the report is deposited, so an item for the sitting
 * ahead carries a code the API will only answer for on the day it is tabled.
 * That is the whole reason this runs daily. Anything else the API says is
 * reported as a failure, because a rate limit or a 500 means names are missing
 * that should have been there.
 *
 * A person id that is in no members list leaves that row's name alone rather
 * than writing an id into a column a member reads.
 */
async function fromApi(codes: string[]): Promise<Names[]> {
  const members = new Map((await listMembers()).map((m) => [m.id, m.label ?? ""]));
  console.log(`${members.size} members in the term, asking the API about ${codes.length} report(s)`);

  const out: Names[] = [];
  const notTabled: string[] = [];
  const failed: string[] = [];
  for (const code of codes) {
    const id = reportCodeToWorkId(code);
    if (!id) continue;
    let refs;
    try {
      const work = await getPlenaryDocument(id);
      refs = work ? reportRefsFromWork(work) : null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/EP API 404\b/.test(msg)) notTabled.push(code);
      else failed.push(`${code} (${msg})`);
      continue;
    }
    if (!refs) {
      failed.push(`${code} (no report participations in the payload)`);
      continue;
    }
    if (refs.code !== code) console.warn(`  ${code}: the API labels this document ${refs.code}`);
    const names = refs.rapporteurIds.map((pid) => members.get(pid) || "");
    const unknown = refs.rapporteurIds.filter((_, i) => !names[i]);
    if (unknown.length) console.warn(`  ${code}: unknown person id ${unknown.join(", ")} — leaving the name alone`);
    out.push({ code, rapporteurs: unknown.length ? [] : names, committees: refs.committees });
    // One call each, and this endpoint rate-limits when walked in bulk.
    await sleep(250);
  }
  if (notTabled.length) console.log(`not tabled yet: ${notTabled.join(", ")}`);
  if (failed.length) console.error(`the API would not answer for: ${failed.join(", ")}`);
  return out;
}

/**
 * Send the patches. `guarded` is the fill path: the column is written only if
 * it is still NULL, because between the read and the write another sync may
 * have landed a value and an existing one is not ours to touch. --check is the
 * one caller that overwrites, and says so before it does.
 */
async function apply(supabase: Client, plan: Patch[], guarded: boolean): Promise<number> {
  let updated = 0;
  for (const p of plan) {
    let q = supabase.from("items").update(p.patch).eq("id", p.id);
    if (guarded && p.patch.rapporteur) q = q.is("rapporteur", null);
    if (guarded && p.patch.committee) q = q.is("committee", null);
    const { error } = await q;
    if (error) console.error(`  ${p.code}: ${error.message}`);
    else updated++;
  }
  return updated;
}

/**
 * What the site is showing, held against open data.
 *
 * Scoped the way the dashboard is scoped — the part-sessions that have not
 * ended, which is what `getSessions` puts on screen and the only part of the
 * archive still moving. A vote that has happened keeps the name it was given;
 * nobody is preparing it any more.
 *
 * Compared on the rendered label, so the three forms the syncs write for one
 * member count as agreement and only a different name, or a name the site is
 * missing, is reported.
 */
async function check(supabase: Client) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const { data: sessions, error: sesErr } = await supabase
    .from("sessions")
    .select("id, month_label, location, start_date, end_date")
    .gte("end_date", today)
    .order("start_date");
  if (sesErr || !sessions) throw new Error(`sessions read: ${sesErr?.message}`);
  if (sessions.length === 0) {
    console.log(`nothing ends on or after ${today}: the dashboard is empty, nothing to check.`);
    return;
  }
  console.log(`on the dashboard today: ${sessions.map((x) => `${x.month_label} (${x.location}, ${x.start_date})`).join(", ")}`);

  const { data, error } = await supabase
    .from("items")
    .select("id, code, rapporteur, committee")
    .in(
      "session_id",
      sessions.map((x) => x.id as string),
    )
    .like("code", "A%");
  if (error || !data) throw new Error(`items read: ${error?.message}`);
  const items = (data as Item[]).filter((i) => i.rapporteur || i.committee);
  console.log(`${items.length} report item(s) with something to compare`);
  if (items.length === 0) return;
  if (items.length > LIMIT) console.log(`asking about the first ${LIMIT}; pass --limit=N for more`);

  const reports = await fromApi(items.slice(0, LIMIT).map((i) => i.code));
  const byCode = new Map(items.map((i) => [i.code, i]));

  const plan: Patch[] = [];
  for (const r of reports) {
    const item = byCode.get(r.code);
    if (!item) continue;
    const patch: Record<string, string> = {};
    // No names back means the ids did not resolve, which fromApi has already
    // warned about; silence is not agreement, so nothing is compared.
    if (r.rapporteurs.length) {
      const shown = rapporteurLabel(item.rapporteur);
      const theirs = rapporteurLabel(r.rapporteurs.join(", "));
      if (shown !== theirs) {
        patch.rapporteur = r.rapporteurs.join(", ");
        console.log(`  ${r.code.padEnd(16)} site shows ${shown ?? "nobody"}, open data says ${theirs}`);
      }
    }
    if (item.committee && r.committees.length && item.committee !== r.committees[0]) {
      patch.committee = r.committees[0]!;
      console.log(`  ${r.code.padEnd(16)} site shows ${item.committee}, open data says ${r.committees.join("/")}`);
    }
    if (Object.keys(patch).length) plan.push({ id: item.id, code: r.code, patch });
  }

  if (plan.length === 0) {
    console.log("\nthe site agrees with open data on every one of them.");
    return;
  }
  if (!WRITE) {
    console.log(`\n${plan.length} disagree — pass --write to take open data's version.`);
    return;
  }
  console.log(`\noverwriting ${plan.length} item(s) with open data's version.`);
  console.log(`done: ${await apply(supabase, plan, false)} items updated.`);
}

async function main() {
  const supabase = makeAdminClient();
  if (CHECK) return check(supabase);
  let reports: Names[];
  let items: Item[];

  if (file) {
    const page = parseTextsTabled(readFileSync(file, "utf8"));
    console.log(`${page.length} tabled reports on the page`);
    if (page.length === 0) {
      console.log("nothing to match — the page may have changed shape, or the search returned no rows.");
      return;
    }
    reports = page;
    items = await readItems(
      supabase,
      page.map((r) => r.code),
    );
    const known = new Set(items.map((i) => i.code));
    const unknown = page.map((r) => r.code).filter((c) => !known.has(c));
    if (unknown.length) console.log(`not in the database yet: ${unknown.join(", ")}`);
  } else {
    items = await itemsMissingNames(supabase);
    console.log(`${items.length} report item(s) without a rapporteur or a committee`);
    if (items.length === 0) {
      console.log("nothing to fill.");
      return;
    }
    if (items.length > LIMIT) console.log(`asking about the newest ${LIMIT}; pass --limit=N for more`);
    reports = await fromApi(items.slice(0, LIMIT).map((i) => i.code));
  }

  const byCode = new Map(items.map((i) => [i.code, i]));
  const plan: Patch[] = [];
  for (const r of reports) {
    const item = byCode.get(r.code);
    if (!item) continue;
    const patch: Record<string, string> = {};
    if (!item.rapporteur && r.rapporteurs.length) patch.rapporteur = r.rapporteurs.join(", ");
    // The full set of committees belongs in items.committees, which syncAgenda
    // owns; this column holds the leading one.
    if (!item.committee && r.committees.length) patch.committee = r.committees[0]!;
    if (Object.keys(patch).length) plan.push({ id: item.id, code: r.code, patch });
  }

  console.log(`\n${plan.length} items would be filled:`);
  for (const p of plan) {
    console.log(`  ${p.code.padEnd(16)} ${Object.entries(p.patch).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  }

  if (!WRITE) {
    console.log("\ndry run — pass --write to apply.");
    return;
  }

  console.log(`\ndone: ${await apply(supabase, plan, true)} items updated.`);
}

main().catch((err) => {
  console.error("sync-texts-tabled failed:", err);
  process.exit(1);
});
