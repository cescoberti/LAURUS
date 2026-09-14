/**
 * Live sync for the part-session in progress — meant to run every few minutes
 * during plenary weeks (GitHub Actions cron), cheap enough to do so.
 *
 *   npm run sync-live                 # the session running today, else exit 0
 *   npm run sync-live -- 2026-09-14   # force a session by its start date
 *
 * One pass does, for that session only:
 *   1. agenda    re-read the sitting days' foreseen-activities → new files get
 *                a row, files already known keep theirs (upsert on code)
 *   2. reconcile placeholder rows from the July seed ('OJ-2026-09-AFET-…',
 *                named after the MEP rapporteur) are matched to the real-coded
 *                row (same lead committee + same MEP surname); advisor
 *                assignments and note status are carried over, then the
 *                placeholder is deleted. No match → kept and reported.
 *   3. amendments the year's AMENDMENT_LIST index is paged once (2–3 calls),
 *                filtered to this session's report codes, and ONLY blocks not
 *                yet in `ingested_blocks` are downloaded — a late block on a
 *                report already ingested is picked up on the next run
 *   4. VOT       the sitting days' results-of-votes XML (404 until the votes
 *                happen) → vot_requests; an item found in day D's VOT gets
 *                vote_date = D if it had none
 *   5. voting lists  the official Tabling Service lists on "Order and lists
 *                of votes" → voting_lists (append-only, one row per distinct
 *                file); a new version label is fetched at once, an unchanged
 *                one re-checked (conditional GET) at most hourly; the page's
 *                sitting day fills vote_date ahead of the vote
 *   6. vote_count refreshed so the board and whip page show the session
 *
 * Everything is idempotent: re-running is the normal mode of operation.
 */
import { getDocument } from "./epApi.ts";
import { parseVotXml } from "@laurus/parser/vot-xml";
import { parseAmendmentsDocx } from "@laurus/parser/amendments-docx";
import { amendmentBlockUrl } from "@laurus/parser";
import { fetchBytes, fetchBytesPatiently } from "./httpFetch.ts";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseVotesPage, BROWSER_HEADERS, VOTES_PAGE_URL } from "./votesPage.ts";
import {
  BASE,
  makeAdminClient,
  displayCode,
  COMMITTEES,
  personName,
  mapLimit,
  foreseenActivities,
  reportRef,
} from "./epShared.ts";

const TERM = 10;
const LANGS = ["it", "en"] as const;
const TODAY = new Date().toISOString().slice(0, 10);
const FORCE_START = process.argv[2];

const supabase = makeAdminClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Session in progress
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  ep_meeting_id: string;
  month_label: string;
  start_date: string;
  end_date: string;
}

async function currentSession(): Promise<Session | null> {
  const q = supabase.from("sessions").select("id, ep_meeting_id, month_label, start_date, end_date");
  const { data } = FORCE_START
    ? await q.eq("start_date", FORCE_START).maybeSingle()
    : await q.lte("start_date", TODAY).gte("end_date", TODAY).maybeSingle();
  return (data as Session | null) ?? null;
}

function sittingDays(s: Session): string[] {
  const out: string[] = [];
  for (let t = Date.parse(s.start_date); t <= Date.parse(s.end_date); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Agenda
// ---------------------------------------------------------------------------

async function syncAgenda(s: Session, days: string[]): Promise<number> {
  const seen = new Map<string, { identifier: string; code: string; title: { en: string; it: string } }>();
  for (const day of days) {
    // One day's agenda timing out (the EP API does 504 under load) must not
    // cost the other days — it is simply re-read on the next tick.
    let activities;
    try {
      activities = await foreseenActivities(`MTG-PL-${day}`);
    } catch (err) {
      console.warn(`  agenda ${day}: ${(err as Error).message} — skipped this tick`);
      continue;
    }
    for (const a of activities) {
      const identifier = reportRef(a);
      if (!identifier) continue;
      const code = displayCode(identifier);
      if (!seen.has(code)) {
        seen.set(code, { identifier, code, title: { en: a.activity_label?.en ?? code, it: a.activity_label?.it ?? "" } });
      }
    }
  }
  if (seen.size === 0) return 0;

  // Only resolve committee/rapporteur for codes we don't have yet — the
  // /documents endpoint is the rate-limited one.
  const { data: existing } = await supabase.from("items").select("code").eq("session_id", s.id);
  const known = new Set((existing ?? []).map((r) => r.code as string));
  const fresh = [...seen.values()].filter((f) => !known.has(f.code));

  const enriched = await mapLimit(fresh, 3, async (f) => {
    let committee: string | undefined;
    let rapporteur: string | undefined;
    try {
      const doc = await getDocument(f.identifier);
      const creator = (doc as unknown as { creator?: string[] } | undefined)?.creator ?? [];
      committee = creator.filter((c) => c.startsWith("org/")).map((c) => c.slice(4)).find((c) => COMMITTEES.has(c));
      const person = creator.find((c) => c.startsWith("person/"));
      if (person) rapporteur = await personName(person);
    } catch {
      // resolved on a later pass
    }
    return { ...f, committee, rapporteur };
  });

  if (enriched.length) {
    const { error } = await supabase.from("items").upsert(
      enriched.map((e) => ({
        session_id: s.id,
        code: e.code,
        ep_work_id: `eli/dl/doc/${e.identifier}`,
        title: e.title,
        rapporteur: e.rapporteur ?? null,
        committee: e.committee ?? null,
        committees: e.committee ? [e.committee] : null,
      })),
      { onConflict: "session_id,code" },
    );
    if (error) throw new Error(`items upsert: ${error.message}`);
  }
  return enriched.length;
}

// ---------------------------------------------------------------------------
// 2. Reconcile seed placeholders with real-coded rows
// ---------------------------------------------------------------------------

const surnameKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

interface ItemRow {
  id: string;
  code: string;
  committee: string | null;
  rapporteur: string | null;
  title: { en?: string; it?: string } | null;
  assigned_advisors: Record<string, string> | null;
  note_status: string;
  note_submitted_at: string | null;
}

const STOP = new Set(["the", "of", "and", "on", "for", "in", "to", "a", "an", "its", "with", "eu", "european", "union", "agreement", "between"]);
function titleTokens(t: string | undefined): Set<string> {
  return new Set(
    (t ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}
function titleSimilarity(a: string | undefined, b: string | undefined): number {
  const A = titleTokens(a), B = titleTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter); // Jaccard
}

/**
 * Pick the one real row a placeholder stands for, or null. Two criteria, both
 * conservative: MEP surname + lead committee; then, to break a tie or when the
 * placeholder carries no MEP name, the seed title against the real title —
 * accepted only with a clear winner, never a coin flip.
 */
function matchPlaceholder(p: ItemRow, cmte: string, surnames: string[], real: ItemRow[]): ItemRow | null {
  const byName = surnames.length
    ? real.filter((r) => r.committee === cmte && r.rapporteur && surnames.some((w) => surnameKey(r.rapporteur!).includes(w)))
    : [];
  if (byName.length === 1) return byName[0]!;

  // Tie-break among the name matches, else search the whole session by title
  // (motions/objections have no committee on the real row either). Sibling
  // files often differ by one word (Iceland/Norway, soybean GMB151/MON 94313),
  // so the winner must lead by a clear margin, not by a ratio; a dead heat is
  // left alone.
  const pool = byName.length > 1 ? byName : real;
  const scored = pool
    .map((r) => ({ r, s: titleSimilarity(p.title?.en, r.title?.en) }))
    .sort((a, b) => b.s - a.s);
  const [best, second] = scored;
  const margin = byName.length > 1 ? 0.1 : 0.15;
  if (best && best.s >= 0.5 && (!second || best.s - second.s >= margin)) return best.r;
  return null;
}

async function reconcilePlaceholders(s: Session): Promise<{ merged: string[]; unmatched: string[] }> {
  const { data } = await supabase
    .from("items")
    .select("id, code, committee, rapporteur, title, assigned_advisors, note_status, note_submitted_at")
    .eq("session_id", s.id);
  const rows = (data ?? []) as ItemRow[];
  const placeholders = rows.filter((r) => r.code.startsWith("OJ-"));
  const real = rows.filter((r) => !r.code.startsWith("OJ-"));
  const merged: string[] = [];
  const unmatched: string[] = [];

  for (const p of placeholders) {
    // 'OJ-2026-09-AFET-VAUTMANS' / 'OJ-2026-09-ECON-TAVARES-FERBER' → committee + MEP surname(s);
    // objections / motions ('…-OBJ-…', '…-CFP-EVAL') carry no MEP name.
    const m = /^OJ-\d{4}-\d{2}-([A-Z]+)-(.+)$/.exec(p.code);
    if (!m) {
      unmatched.push(p.code);
      continue;
    }
    const [, cmte, tail] = m;
    const surnames = /^(OBJ|CFP|NARCO)/.test(tail!) ? [] : tail!.split("-").map(surnameKey).filter((k) => k.length > 2);

    const target = matchPlaceholder(p, cmte!, surnames, real);
    if (!target) {
      unmatched.push(p.code);
      continue;
    }

    // Whip's work on the placeholder wins where the real row has nothing yet.
    const advisors = { ...(p.assigned_advisors ?? {}), ...(target.assigned_advisors ?? {}) };
    const patch: Record<string, unknown> = { assigned_advisors: advisors };
    if (target.note_status === "pending" && p.note_status !== "pending") {
      patch.note_status = p.note_status;
      patch.note_submitted_at = p.note_submitted_at;
    }
    await supabase.from("items").update(patch).eq("id", target.id);
    await supabase.from("items").delete().eq("id", p.id);
    merged.push(`${p.code} → ${target.code}`);
  }
  return { merged, unmatched };
}

// ---------------------------------------------------------------------------
// 3. Amendments — only blocks not read yet
// ---------------------------------------------------------------------------

/** 'A10-0201/2026' → 'A-10-2026-0201-AM-' */
function blockPrefix(code: string): string | null {
  const m = code.match(/^([A-Z]+)(\d+)-(\d+)\/(\d{4})$/);
  if (!m) return null;
  const [, prefix, term, num, year] = m;
  return `${prefix}-${term}-${year}-${num!.padStart(4, "0")}-AM-`;
}

async function listAmendmentBlocks(year: number): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; offset < 6000; offset += 500) {
    const url =
      `${BASE}/api/v2/documents?year=${year}&work-type=AMENDMENT_LIST` +
      `&limit=500&offset=${offset}&format=application%2Fld%2Bjson`;
    const { status, body } = await fetchBytes(url);
    if (status === 429 || status === 403) {
      await sleep(20_000);
      offset -= 500;
      continue;
    }
    if (status === 204) break; // past the last page
    if (status !== 200) {
      // A 504 here would silently look like "no new blocks" — say so.
      console.warn(`  amendment index page ${offset}: HTTP ${status} — partial index this tick`);
      break;
    }
    const rows = (JSON.parse(body.toString("utf8")) as { data?: Array<{ identifier: string }> }).data ?? [];
    for (const r of rows) if (r.identifier) out.push(r.identifier);
    if (rows.length < 500) break;
    await sleep(400);
  }
  return out;
}

async function fetchBlock(identifier: string, lang: string): Promise<Buffer | null> {
  let delay = 5_000;
  for (let attempt = 0; attempt < 5; attempt++) {
    let status: number, body: Buffer;
    try {
      ({ status, body } = await fetchBytes(amendmentBlockUrl(identifier, lang)));
    } catch {
      await sleep(delay);
      delay = Math.min(delay * 2, 60_000);
      continue;
    }
    if (status === 429 || status === 403) {
      await sleep(delay);
      delay = Math.min(delay * 2, 60_000);
      continue;
    }
    if (status !== 200) return null;
    if (body.length < 4 || body[0] !== 0x50 || body[1] !== 0x4b) return null;
    return body;
  }
  throw new Error(`still throttled: ${identifier}_${lang}`);
}

async function syncAmendments(s: Session): Promise<{ blocks: number; items: number }> {
  const { data: items } = await supabase.from("items").select("id, code").eq("session_id", s.id);
  const prefixes = new Map<string, string>(); // prefix → item id
  for (const it of items ?? []) {
    const p = blockPrefix(it.code as string);
    if (p) prefixes.set(p, it.id as string);
  }
  if (prefixes.size === 0) return { blocks: 0, items: 0 };

  const year = Number(s.start_date.slice(0, 4));
  const index = await listAmendmentBlocks(year);
  const wanted = index
    .map((id) => {
      const p = [...prefixes.keys()].find((pre) => id.startsWith(pre));
      return p ? { id, itemId: prefixes.get(p)! } : null;
    })
    .filter((x): x is { id: string; itemId: string } => !!x);

  const { data: doneRows } = await supabase
    .from("ingested_blocks")
    .select("identifier, language")
    .in("identifier", wanted.map((w) => w.id));
  const done = new Set((doneRows ?? []).map((r) => `${r.identifier}|${r.language}`));

  let blocks = 0;
  const touched = new Set<string>();
  for (const w of wanted.sort((a, b) => a.id.localeCompare(b.id))) {
    for (const lang of LANGS) {
      if (done.has(`${w.id}|${lang}`)) continue;
      const buf = await fetchBlock(w.id, lang);
      if (!buf) continue; // this language not published (yet)
      let parsed;
      try {
        parsed = await parseAmendmentsDocx(buf, lang);
      } catch {
        continue;
      }
      const rows = [
        ...new Map(
          parsed.map((a) => [
            a.number,
            {
              item_id: w.itemId,
              number: a.number,
              language: lang,
              target: a.target ?? null,
              tabled_by: a.tabledBy ?? null,
              original_text: a.originalText ?? null,
              amended_text: a.amendedText ?? null,
              kind: a.kind,
            },
          ]),
        ).values(),
      ];
      if (rows.length) {
        const { error } = await supabase.from("amendments").upsert(rows, { onConflict: "item_id,number,language" });
        if (error) {
          console.warn(`  ${w.id} ${lang}: upsert failed — ${error.message}`);
          continue;
        }
      }
      await supabase
        .from("ingested_blocks")
        .upsert({ identifier: w.id, language: lang, item_id: w.itemId, amendments: rows.length }, { onConflict: "identifier,language" });
      blocks++;
      touched.add(w.itemId);
      console.log(`  ${w.id} ${lang}: ${rows.length} amendments`);
      await sleep(600);
    }
  }

  // am_count = distinct numbers across languages
  for (const itemId of touched) {
    const { data } = await supabase.from("amendments").select("number").eq("item_id", itemId);
    const n = new Set((data ?? []).map((r) => r.number as number)).size;
    await supabase.from("items").update({ am_count: n }).eq("id", itemId);
  }
  return { blocks, items: touched.size };
}

// ---------------------------------------------------------------------------
// 4. VOT (results of votes) for the sitting days
// ---------------------------------------------------------------------------

async function syncVot(s: Session, days: string[]): Promise<{ files: number; rows: number }> {
  const { data: items } = await supabase.from("items").select("id, code, vote_date").eq("session_id", s.id);
  const byCode = new Map((items ?? []).map((i) => [i.code as string, i]));
  let files = 0;
  let rows = 0;

  for (const day of days) {
    if (day > TODAY) continue; // no results before the day
    for (const lang of LANGS) {
      const url = `${BASE}/distribution/doc/PV-${TERM}-${day}-VOT_${lang}.xml`;
      let res;
      try {
        res = await fetchBytes(url);
      } catch {
        continue;
      }
      if (res.status !== 200) continue;
      files++;
      let votes;
      try {
        votes = parseVotXml(res.body.toString("utf8"));
      } catch (err) {
        console.warn(`  ${day} ${lang}: VOT parse failed — ${err}`);
        continue;
      }
      const upserts: Array<Record<string, unknown>> = [];
      for (const v of votes) {
        const item = v.codes.map((c) => byCode.get(c)).find(Boolean);
        if (!item) continue;
        upserts.push({ item_id: item.id, language: lang, source_url: url, payload: v.payload });
        if (!item.vote_date) {
          await supabase.from("items").update({ vote_date: day }).eq("id", item.id);
          (item as { vote_date: string | null }).vote_date = day;
        }
      }
      if (upserts.length) {
        const unique = [...new Map(upserts.map((r) => [`${r.item_id}|${r.language}`, r])).values()];
        const { error } = await supabase.from("vot_requests").upsert(unique, { onConflict: "item_id,language" });
        if (error) console.warn(`  ${day} ${lang}: vot upsert failed — ${error.message}`);
        else rows += unique.length;
      }
      await sleep(300);
    }
  }
  return { files, rows };
}

// ---------------------------------------------------------------------------
// 5. Official voting lists from "Order and lists of votes"
// ---------------------------------------------------------------------------

const RECHECK_MS = 60 * 60 * 1000;

async function syncVotingLists(s: Session): Promise<{ listed: number; fetched: number; unchanged: number }> {
  // In CI a headless browser has already fetched the page past the EP's
  // JavaScript challenge (votesPageBrowser.ts) and left its cookies for the
  // file downloads; elsewhere a plain fetch is enough.
  const pageFile = process.env.EP_VOTES_PAGE_FILE;
  const cookieFile = process.env.EP_WWW_COOKIE_FILE;
  let html: string;
  if (pageFile && existsSync(pageFile)) {
    html = readFileSync(pageFile, "utf8");
  } else {
    const page = await fetchBytesPatiently(VOTES_PAGE_URL, BROWSER_HEADERS);
    if (page.status !== 200) {
      const challenged = /awswaf|challenge\.js/i.test(page.body.toString("utf8"));
      throw new Error(`votes page HTTP ${page.status}${challenged ? " (EP JavaScript challenge — needs the browser step)" : ""}`);
    }
    html = page.body.toString("utf8");
  }
  const cookie = cookieFile && existsSync(cookieFile) ? readFileSync(cookieFile, "utf8").trim() : "";
  const wwwHeaders = cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS;
  const entries = parseVotesPage(html).filter((e) => e.docxUrl);

  const { data: items } = await supabase.from("items").select("id, code, vote_date").eq("session_id", s.id);
  const byCode = new Map((items ?? []).map((i) => [i.code as string, i]));
  const resolve = (code: string) =>
    byCode.get(code) ?? (code.includes("/") ? undefined : (items ?? []).find((i) => (i.code as string).startsWith(`${code}/`)));

  const { data: stored } = await supabase
    .from("voting_lists")
    .select("item_id, version_label, sha256, etag, checked_at, fetched_at")
    .in("item_id", (items ?? []).map((i) => i.id as string))
    .order("fetched_at", { ascending: false });
  const latest = new Map<string, { version_label: string; sha256: string; etag: string | null; checked_at: string }>();
  for (const r of stored ?? []) if (!latest.has(r.item_id as string)) latest.set(r.item_id as string, r as never);

  let listed = 0;
  let fetched = 0;
  let unchanged = 0;
  for (const e of entries) {
    const item = resolve(e.code);
    if (!item) continue; // a file this session does not track (e.g. a C document)
    listed++;

    if (e.day && !item.vote_date) {
      await supabase.from("items").update({ vote_date: e.day }).eq("id", item.id);
      (item as { vote_date: string | null }).vote_date = e.day;
    }

    const have = latest.get(item.id as string);
    const label = e.versionLabel ?? "unknown";
    const sameLabel = have?.version_label === label;
    if (sameLabel && Date.now() - Date.parse(have!.checked_at) < RECHECK_MS) continue;

    // Same label as last time → ask the EP whether the file changed at all.
    const headers = sameLabel && have?.etag ? { ...wwwHeaders, "If-None-Match": have.etag } : wwwHeaders;
    let res;
    try {
      res = await fetchBytesPatiently(e.docxUrl!, headers);
    } catch (err) {
      console.warn(`  vl ${e.code}: ${(err as Error).message}`);
      continue;
    }
    if (res.status === 304) {
      await supabase.from("voting_lists").update({ checked_at: new Date().toISOString() }).eq("item_id", item.id).eq("sha256", have!.sha256);
      unchanged++;
      await sleep(300);
      continue;
    }
    if (res.status !== 200 || res.body.length < 4 || res.body[0] !== 0x50 || res.body[1] !== 0x4b) {
      console.warn(`  vl ${e.code}: HTTP ${res.status} (${res.body.length} B) — not a DOCX, skipped this tick`);
      await sleep(1000);
      continue;
    }
    const sha256 = createHash("sha256").update(res.body).digest("hex");
    if (have?.sha256 === sha256) {
      await supabase.from("voting_lists").update({ checked_at: new Date().toISOString(), version_label: label }).eq("item_id", item.id).eq("sha256", sha256);
      unchanged++;
    } else {
      const { error } = await supabase.from("voting_lists").insert({
        item_id: item.id,
        version_label: label,
        source_url: e.docxUrl,
        sha256,
        byte_size: res.body.length,
        docx: `\\x${res.body.toString("hex")}`,
        etag: res.etag ?? null,
        last_modified: res.lastModified ?? null,
      });
      if (error) console.warn(`  vl ${e.code}: insert failed — ${error.message}`);
      else {
        fetched++;
        console.log(`  vl ${e.code} ${label}: ${res.body.length} B`);
      }
    }
    await sleep(600);
  }
  return { listed, fetched, unchanged };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const s = await currentSession();
  if (!s) {
    console.log(`no part-session in progress on ${TODAY} — nothing to do`);
    return;
  }
  const days = sittingDays(s);
  console.log(`live sync · ${s.month_label} ${s.start_date}→${s.end_date} (${days.length} sitting days)`);

  const { data: run } = await supabase
    .from("ingestion_runs")
    .insert({ source: `ep-api:sync-live:${s.ep_meeting_id}` })
    .select("id")
    .single();

  // The stages are independent: the EP API failing on one (504s under
  // load are routine) must not stop the others, and must not fail the run —
  // a failed scheduled run emails the repo owner, every five minutes. A stage
  // that could not run is logged, recorded on the run, and retried next tick.
  const errors: string[] = [];
  const stage = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      const msg = `${name}: ${(err as Error).message}`;
      console.warn(`  ${msg} — will retry next tick`);
      errors.push(msg);
      return fallback;
    }
  };

  const newFiles = await stage("agenda", () => syncAgenda(s, days), 0);
  console.log(`agenda: ${newFiles} new file(s)`);

  const rec = await stage("reconcile", () => reconcilePlaceholders(s), { merged: [], unmatched: [] });
  if (rec.merged.length) console.log(`reconciled:\n  ${rec.merged.join("\n  ")}`);
  if (rec.unmatched.length) console.log(`placeholders kept (no match): ${rec.unmatched.join(", ")}`);

  const am = await stage("amendments", () => syncAmendments(s), { blocks: 0, items: 0 });
  console.log(`amendments: ${am.blocks} new block(s) across ${am.items} item(s)`);

  const vot = await stage("vot", () => syncVot(s, days), { files: 0, rows: 0 });
  console.log(`vot: ${vot.files} file(s), ${vot.rows} item rows`);

  const vls = await stage("voting lists", () => syncVotingLists(s), { listed: 0, fetched: 0, unchanged: 0 });
  console.log(`voting lists: ${vls.listed} on the page, ${vls.fetched} new file(s), ${vls.unchanged} re-checked unchanged`);

  const { count } = await supabase.from("items").select("id", { count: "exact", head: true }).eq("session_id", s.id);
  await supabase.from("sessions").update({ vote_count: count ?? 0 }).eq("id", s.id);

  if (run) {
    await supabase
      .from("ingestion_runs")
      .update({
        // The run did complete; `error` lists any stage deferred to the next tick.
        status: "ok",
        finished_at: new Date().toISOString(),
        error: errors.length ? errors.join(" | ") : null,
        found: { new_files: newFiles, reconciled: rec.merged.length, unmatched: rec.unmatched.length, ...am, vot, voting_lists: vls },
      })
      .eq("id", run.id);
  }
  console.log(errors.length ? `live sync done with ${errors.length} stage(s) deferred.` : "live sync done.");
}

main().catch((err) => {
  console.error("sync-live failed:", err);
  process.exit(1);
});
