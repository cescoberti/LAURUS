import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseMotionText, originalTextFor } from "./reportDocx.ts";
import { parseIndicativeVotingList, noteText } from "./indicativeVotingList.ts";
import { plenaryFileUrl } from "./epUrls.ts";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));

// Real report A10-0224/2026 (HALICKI, BUDG) in Italian, from the EP
// distribution path, and the EP's official voting list for it (public,
// "Order and lists of votes", FINAL VERSION). Captured 2026-09-14.

test("indexes the motion for a resolution by citation, recital and paragraph", async () => {
  const motion = await parseMotionText(fixture("rep-A-10-2026-0224-it.docx"));
  assert.ok(motion);
  assert.equal(motion.citations.length, 12);
  assert.deepEqual([...motion.recitals.keys()], ["A", "B", "C", "D", "E"]);
  assert.equal(motion.paragraphs.size, 13);
  assert.match(motion.paragraphs.get(2) ?? "", /^2\. accoglie con favore/);
  assert.match(motion.citations[5] ?? "", /^visto l'accordo interistituzionale/);
  // Footnote markers are dropped, the text is otherwise verbatim.
  assert.doesNotMatch(motion.citations[2] ?? "", /\[\d\]/);
});

test("resolves a voting-list subject to the motion text", async () => {
  const motion = (await parseMotionText(fixture("rep-A-10-2026-0224-it.docx")))!;
  assert.match(originalTextFor("§ 10", motion) ?? "", /^10\. ribadisce/);
  assert.match(originalTextFor("Recital D", motion) ?? "", /^D\. considerando/);
  assert.match(originalTextFor("Citation 7", motion) ?? "", /^vista la decisione/);
  assert.equal(originalTextFor("After § 1", motion), null); // a new paragraph — nothing to quote
  assert.equal(originalTextFor("§ 99", motion), null);
});

test("the official list keeps its version label, original-text rows and footer notes", async () => {
  const vl = await parseIndicativeVotingList(fixture("official-vl-halicki-A10-0224-2026.docx"));
  assert.equal(vl.version, "FINAL VERSION");
  assert.equal(vl.reportCode, "A10-0224/2026");
  assert.equal(vl.rows.length, 18);
  const original = vl.rows.filter((r) => r.author === "original text");
  assert.deepEqual(original.map((r) => r.subject), ["§ 2", "§ 4", "§ 10", "Citation 6", "Citation 7"]);
  assert.equal(vl.rows.filter((r) => r.voteType === "RCV").length, 12);
  // Notes keep the markup the EP printed them with — the writer reprints the
  // block, so losing the italic lost the look of the list.
  assert.equal(vl.notes[0], "<i>Ams 2 and 14 were cancelled due to technical reasons</i>");
  assert.equal(noteText(vl.notes[0]!), "Ams 2 and 14 were cancelled due to technical reasons");
  assert.equal(vl.notes.length, 6);
  // The "Requests for …" headings are underlined, and a group line is
  // separated from its amendment numbers by a tab, not a space.
  const heading = vl.notes.find((n) => /^requests? for /i.test(noteText(n)));
  assert.ok(heading?.includes("<u>"), `heading should keep its underline: ${heading}`);
  assert.ok(
    vl.notes.some((n) => n.includes("\t")),
    "a group line should keep the tab before its amendment numbers",
  );
});

// Real report A10-0272/2026 (UŠAKOVS/HADJIPANTELA, BUDG) in English, captured
// 2026-10-20. A budget report carries its figures in lettered points under a
// paragraph, and its voting list votes on them one at a time.

test("indexes the lettered points and roman sub-points under a paragraph", async () => {
  const motion = await parseMotionText(fixture("rep-A-10-2026-0272-en.docx"));
  assert.ok(motion, "the motion should parse");
  assert.equal(motion.paragraphs.size, 50);
  assert.equal(motion.points.size, 106);
  // The chapeau still belongs to the paragraph, not to its first point.
  assert.match(motion.paragraphs.get(15)!, /^15\. Restores the Council cuts/);
  assert.match(motion.points.get("15.a")!, /^\(a\) Support to Turkish Cypriot Community/);
  assert.match(motion.points.get("22.b.i")!, /^i\. budget line 11 02 01/);
});

test("resolves a voting-list subject that votes on a point, not the paragraph", async () => {
  const motion = await parseMotionText(fixture("rep-A-10-2026-0272-en.docx"));
  assert.ok(motion);
  // The six subjects that came back "original text not found" on the EN list.
  assert.match(originalTextFor("§ 15, point f", motion)!, /^\(f\) Creative Europe/);
  assert.match(originalTextFor("§ 15, point g", motion)!, /^\(g\) The Citizens, Equality/);
  assert.match(originalTextFor("§ 21, point a", motion)!, /^\(a\) The European Agriculture Guarantee Fund/);
  assert.match(originalTextFor("§ 22, point a", motion)!, /^\(a\) The Asylum, Migration/);
  assert.match(originalTextFor("§ 27, point a", motion)!, /^\(a\) NDICI-Global Europe/);
  assert.match(originalTextFor("§ 49, point c", motion)!, /^\(c\) increase the establishment plans/);
  // The longer shape must not be cut short by the shorter one.
  assert.match(originalTextFor("§ 22, point b, sub-point i", motion)!, /^i\. budget line 11 02 01/);
  // And the plain paragraph still resolves to the paragraph.
  assert.match(originalTextFor("§ 15", motion)!, /^15\. Restores/);
  // A point that does not exist is still null, never a near miss.
  assert.equal(originalTextFor("§ 15, point z", motion), null);
});

// The EP labels the same point differently per language — "(a) Support to …"
// in English, "a) Sostegno alla …" in Italian — while the voting list names
// it "§ 15, point f" in both, because lists are drafted in English. Reading
// only the bracketed form left every Italian list with the same six empty
// cells the English one had just stopped having.

test("reads a point label in either language's bracketing", async () => {
  const it = await parseMotionText(fixture("rep-A-10-2026-0272-it.docx"));
  assert.ok(it, "the Italian motion should parse");
  // Same document, same shape: the two language versions must agree.
  assert.equal(it.paragraphs.size, 50);
  assert.equal(it.points.size, 106);
  assert.match(it.points.get("15.a")!, /^a\) Sostegno alla comunità turco-cipriota/);
  assert.match(it.points.get("22.b.i")!, /^i\. linea di bilancio 11 02 01/);
});

test("the six subjects resolve in Italian too, from the English subject", async () => {
  const it = await parseMotionText(fixture("rep-A-10-2026-0272-it.docx"));
  assert.ok(it);
  assert.match(originalTextFor("§ 15, point f", it)!, /^f\) Europa creativa/);
  assert.match(originalTextFor("§ 15, point g", it)!, /^g\) Programma Cittadini/);
  assert.match(originalTextFor("§ 21, point a", it)!, /^a\) Fondo europeo agricolo/);
  assert.match(originalTextFor("§ 22, point a", it)!, /^a\) Fondo Asilo, migrazione/);
  assert.match(originalTextFor("§ 27, point a", it)!, /^a\) NDICI-Europa globale/);
  assert.match(originalTextFor("§ 49, point c", it)!, /^c\) incrementare le tabelle/);
  assert.match(originalTextFor("§ 22, point b, sub-point i", it)!, /^i\. linea di bilancio 11 02 01/);
  assert.match(originalTextFor("§ 15", it)!, /^15\. ripristina gli stanziamenti/);
});

// The EP's own page for a file, for a person to read. Both shapes verified
// against www.europarl.europa.eu on 2026-10-20.

test("links a report to its EP page and a motion to its DOCEO document", () => {
  // A committee report: the page that carries text and amendments together.
  assert.equal(
    plenaryFileUrl("A10-0272/2026"),
    "https://www.europarl.europa.eu/plenary/en/report-details.html?reference=A10-0272-2026",
  );
  assert.equal(
    plenaryFileUrl("A10-0272/2026", "it"),
    "https://www.europarl.europa.eu/plenary/it/report-details.html?reference=A10-0272-2026",
  );
  // A motion for a resolution has no report-details page — that URL 301s to a
  // legacy one that 404s — so it goes to the document itself, number padded.
  assert.equal(
    plenaryFileUrl("B10-0468/2026"),
    "https://www.europarl.europa.eu/doceo/document/B-10-2026-0468_EN.html",
  );
  assert.equal(plenaryFileUrl("not a code"), null);
});
