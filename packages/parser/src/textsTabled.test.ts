import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTextsTabled } from "./textsTabled.ts";

// Two notices copied verbatim out of
// https://www.europarl.europa.eu/plenary/en/texts-submitted.html on 26/10/2026,
// kept with the markup's own quirks: the stray quote in `class="date_reference" "`,
// the HTML comments between committee chips, the co-rapporteurs on their own
// lines around a comma, and the amendments block that follows the second one.
const PAGE = `<div class="listcontent">
<div class="notice">
<h3 class="hidden">Documents :</h3>
<p class="title">
<a href="https://www.europarl.europa.eu/doceo/document/A-10-2026-0277_EN.html" target="_blank">REPORT on the proposal for a regulation of the European Parliament and of the Council establishing Global Europe</a>
</p>
<div class="date_reference" ">
<h3 class="hidden">Reference :</h3>
<span class="date">
<span class="hidden">Date :</span>20-10-2026
</span>
<span class="reference">A10-0277/2026</span>
<span class="reference">
<a href="http://www.europarl.europa.eu/oeil/popups/ficheprocedure.do?lang=en&amp;reference=2025%2f0227(COD)" target="_blank">2025/0227(COD)</a>
</span>
<div class="clear"></div>
</div>
<span class="acronym_comdel floatright" title="DEVE">DEVE</span>
<!--
-->
<span class="acronym_comdel floatright" title="AFET">AFET</span>
<!--
-->
<p class="rapporteurs clearfix">
Robert BIEDROŃ
,
Michael GAHLER
</p>
</div>
<div class="notice">
<p class="title">
<a href="https://www.europarl.europa.eu/doceo/document/A-10-2026-0272_EN.html" target="_blank">REPORT on the Council position on the draft general budget of the European Union for the financial year 2027</a>
</p>
<div class="date_reference" ">
<span class="date">
<span class="hidden">Date :</span>12-10-2026
</span>
<span class="reference">A10-0272/2026</span>
<span class="reference">
<a href="http://www.europarl.europa.eu/oeil/popups/ficheprocedure.do?lang=en&amp;reference=2026%2f0196(BUD)" target="_blank">2026/0196(BUD)</a>
</span>
</div>
<span class="acronym_comdel floatright" title="BUDG">BUDG</span>
<p class="rapporteurs clearfix">
Nils UŠAKOVS
,
Michalis HADJIPANTELA
</p>
<div class="errata_amendments_container">
<div class="errata_amendments">
<span class="label">AMENDMENTS</span>
<div><a class="range" href="#">001-010</a></div>
</div>
</div>
</div>
<div id="content_right"></div>`;

test("reads each tabled report with its code, date and procedure", () => {
  const rows = parseTextsTabled(PAGE);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.code, "A10-0277/2026");
  assert.equal(rows[0]?.tabledOn, "2026-10-20");
  assert.equal(rows[0]?.procedureRef, "2025/0227(COD)");
  assert.equal(rows[1]?.code, "A10-0272/2026");
  assert.equal(rows[1]?.tabledOn, "2026-10-12");
  assert.equal(rows[1]?.procedureRef, "2026/0196(BUD)");
});

test("gives the rapporteur's full name, and splits co-rapporteurs", () => {
  const rows = parseTextsTabled(PAGE);
  // This is the point of the page: the name, not just a surname, and before the
  // vote rather than out of the VOT afterwards.
  assert.deepEqual(rows[0]?.rapporteurs, ["Robert BIEDROŃ", "Michael GAHLER"]);
  assert.deepEqual(rows[1]?.rapporteurs, ["Nils UŠAKOVS", "Michalis HADJIPANTELA"]);
});

test("keeps every responsible committee, in the page's order", () => {
  const rows = parseTextsTabled(PAGE);
  assert.deepEqual(rows[0]?.committees, ["DEVE", "AFET"]);
  assert.deepEqual(rows[1]?.committees, ["BUDG"]);
});

test("takes the title from the link and decodes the entities around it", () => {
  const rows = parseTextsTabled(PAGE);
  assert.equal(
    rows[0]?.title,
    "REPORT on the proposal for a regulation of the European Parliament and of the Council establishing Global Europe",
  );
  // The amendments block under the second notice must not leak into its fields.
  assert.ok(!rows[1]?.title.includes("AMENDMENTS"));
});

test("a page with no results yields nothing", () => {
  assert.deepEqual(parseTextsTabled("<div class=\"listcontent\"></div>"), []);
});
