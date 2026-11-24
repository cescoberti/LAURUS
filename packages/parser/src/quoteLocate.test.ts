import { test } from "node:test";
import assert from "node:assert/strict";
import { locateQuote, occurrences } from "./quoteLocate.ts";

// § 107 of the report for A10-0261/2026 (VASILE-VOICULESCU), English, in full.
// The ECR's split request quotes it "and foods associated with increased risk
// of cancer" — the report writes "with AN increased risk".
const P107 =
  "107. Highlights the fact that proportionate and evidence-based fiscal and price-based measures play a role in health protection; encourages the Member States, in line with national competences, to use these instruments as part of a comprehensive cancer prevention strategy; suggests that Member States assess the potential of using revenue from taxation and duties on tobacco products and foods associated with an increased risk of cancer as a way to finance national cancer plans and ensure their long-term sustainability;";

// The opening of § 23 of the same report (truncated to the quoted span). The
// request quotes "underlines that such … plain packages requirements"; the
// report writes "plain PACKAGING requirements".
const P23 =
  "23. Calls for the revised Tobacco Products Directive to cover all tobacco and nicotine products and to include evidence-based and up-to-date regulatory measures with particular attention to health warnings and consumer information; underlines that such measures can include plain packaging requirements;";

function located(r: ReturnType<typeof locateQuote>): { text: string; diffs: Array<{ quoted: string; report: string }> } {
  assert.ok(!("error" in r), "error" in r ? `${r.error.code}: ${r.error.detail}` : "");
  return r as { text: string; diffs: Array<{ quoted: string; report: string }> };
}

test("a quote the paragraph carries is its own span, with nothing to flag", () => {
  const got = located(locateQuote(P107, "fiscal and price-based measures", true));
  assert.equal(got.text, "fiscal and price-based measures");
  assert.deepEqual(got.diffs, []);
});

test("an abbreviated quote spans from the first fragment to the end of the last", () => {
  const got = located(locateQuote(P107, "encourages the Member States … cancer prevention strategy;", true));
  assert.ok(got.text.startsWith("encourages the Member States"));
  assert.ok(got.text.endsWith("cancer prevention strategy;"));
  assert.deepEqual(got.diffs, []);
});

test("a word the request leaves out is located and named (§ 107, A10-0261)", () => {
  const quote = "and foods associated with increased risk of cancer";
  const got = located(locateQuote(P107, quote, true));
  // What is shown is the REPORT's words, the article included.
  assert.equal(got.text, "and foods associated with an increased risk of cancer");
  assert.deepEqual(got.diffs, [{ quoted: "", report: "an" }]);
});

test("a word spelt otherwise is located and both spellings named (§ 23, A10-0261)", () => {
  const got = located(locateQuote(P23, "underlines that such … plain packages requirements", true));
  assert.ok(got.text.startsWith("underlines that such measures"));
  assert.ok(got.text.endsWith("plain packaging requirements"));
  assert.deepEqual(got.diffs, [{ quoted: "packages", report: "packaging" }]);
});

test("without tolerance the same quotes are refused, so an exact cut always wins", () => {
  for (const [hay, quote] of [
    [P107, "and foods associated with increased risk of cancer"],
    [P23, "underlines that such … plain packages requirements"],
  ] as const) {
    const r = locateQuote(hay, quote, false);
    assert.ok("error" in r);
    assert.equal(r.error.code, "TERMINI_NON_TROVATI");
  }
});

test("punctuation the report carries and the quote does not stays in the paragraph", () => {
  const got = located(locateQuote(P23, "include plain packages requirements", true));
  assert.equal(got.text, "include plain packaging requirements");
});

test("a quote of two words is never located tolerantly", () => {
  const r = locateQuote(P107, "increased risks", true);
  assert.ok("error" in r);
  assert.equal(r.error.code, "TERMINI_NON_TROVATI");
});

test("two windows that fit equally well locate nothing", () => {
  const hay = "The Commission shall assess the plans of the Member States and shall assess the plans of the applicant States.";
  const r = locateQuote(hay, "shall assess the plans of the Union States", true);
  assert.ok("error" in r);
  assert.equal(r.error.code, "TERMINI_NON_TROVATI");
});

test("a quote the paragraph carries twice is ambiguous, tolerance or not", () => {
  const hay = "It welcomes the proposal and, in that respect, welcomes the proposal again.";
  for (const tolerant of [false, true]) {
    const r = locateQuote(hay, "welcomes the proposal", tolerant);
    assert.ok("error" in r);
    assert.equal(r.error.code, "TERMINI_AMBIGUI");
  }
});

test("a fragment out of order is refused", () => {
  const r = locateQuote(P107, "cancer prevention strategy; … encourages the Member States", true);
  assert.ok("error" in r);
  assert.equal(r.error.code, "TERMINI_NON_TROVATI");
});

test("occurrences counts without overlapping", () => {
  assert.equal(occurrences("aaaa", "aa"), 2);
  assert.equal(occurrences(P107, "cancer"), 3);
});

// Four more paragraphs of the same report, in full, with the pieces the
// official list quotes of them: the EP's own punctuation, capitals and
// repetitions, which is what the tolerant location has to survive.
const P27 =
  "27. Calls for all new tobacco and nicotine-based products to undergo pre-market health impact assessments to demonstrate the impact of these products on the health of individuals and the population as a whole, in accordance with EU law; stresses, too, that smoking cessation strategies and policies must be strictly aligned with scientific evidence relying on proven, independently verified and, where appropriate, clinically supervised methods; calls for enhanced monitoring and data collection on dual use and on the rising uptake of consumption of nicotine among non-smokers, young people and minors, to support evidence-based policymaking and targeted prevention strategies;";
const P29 =
  "29. Calls on the Commission and the Member States to ensure that EU public health policies and alcohol-related harm prevention strategies, including but not limited to education and communication campaigns, are aligned with scientifically established health recommendations; further calls on the Commission to present, without further delay, legislative proposals providing for clearly visible health-related information on all alcoholic beverages, complemented by digital labelling; stresses that such measures should pay particular attention to the protection of minors, young people and other vulnerable groups;";
const P25 =
  "25. Reiterates its initial call for an increase and an upward convergence in minimum excise duties for all tobacco and nicotine products and their final market price; highlights the role that fiscal and price-based measures play in cancer prevention; calls for revenues generated from tobacco and nicotine products to contribute, where appropriate and in accordance with national competence in this area, to health protection, prevention and enforcement measures;";
const P20 =
  "20. Reaffirms the goal of creating a ‘Tobacco-Free Generation’ by 2040; urges the Commission to present, without further delay, a proposal for the revision of the EU’s tobacco legislation, supported by a comprehensive impact assessment in line with the Better Regulation guidelines, with scientific, evidence-based and appropriate regulatory measures related to different characteristics of tobacco and nicotine products, to adequately address tobacco, novel tobacco products and nicotine products, such as electronic cigarettes, heated tobacco products, nicotine pouches and other novel nicotine delivery systems; stresses the need for clear, comprehensive and technology-neutral definitions suited to the capture of emerging products;";

test("the report's own punctuation and capitals are kept (§ 27 and § 29, A10-0261)", () => {
  // "stresses too, that" for the report's "stresses, too, that".
  assert.equal(located(locateQuote(P27, "stresses too, that", true)).text, "stresses, too, that");
  // "Further calls on" where the report's sentence runs on in lower case.
  assert.equal(located(locateQuote(P29, "Further calls on", true)).text, "further calls on");
});

test("a quote two spans of the paragraph fit equally well is refused (§ 25, A10-0261)", () => {
  // "call for revenues": the paragraph has both "call for an increase" and
  // "calls for revenues generated" — one word out either way.
  const r = locateQuote(P25, "call for revenues", true);
  assert.ok("error" in r);
  assert.equal(r.error.code, "TERMINI_NON_TROVATI");
});

test("a quote two words short of the report is refused (§ 20, A10-0261)", () => {
  // "capture emerging products;" for "capture of emerging products;" — with
  // "the" before it, two of the three quoted words away.
  const r = locateQuote(P20, "capture emerging products;", true);
  assert.ok("error" in r);
  assert.equal(r.error.code, "TERMINI_NON_TROVATI");
});
