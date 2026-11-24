import { test } from "node:test";
import assert from "node:assert/strict";
import { remarksColumns, remarksFor, remarksIn } from "./remarksDiff.ts";

// Conventions from the real STREIT annotated VL (fixture): additions bold,
// deletions struck through, untouched text plain.

test("a pure addition is fully bold", () => {
  assert.equal(remarksFor(null, "5 bis. testo nuovo"), "<b>5 bis. testo nuovo</b>");
});

test("a pure deletion is fully struck through", () => {
  assert.equal(remarksFor("testo soppresso", null), "<s>testo soppresso</s>");
});

test("a modification marks deleted words <s> and added words <b>", () => {
  assert.equal(
    remarksFor("il gatto nero dorme", "il gatto bianco dorme"),
    "il gatto <s>nero</s> <b>bianco</b> dorme",
  );
});

test("EP bold-italic markers in the source do not leak into the diff", () => {
  // words() strips tags before diffing — the diff decides the styling.
  assert.equal(
    remarksFor("resta <b><i>fermo</i></b>", "resta fermo qui"),
    "resta fermo <b>qui</b>",
  );
});

test("paragraph breaks survive", () => {
  const out = remarksFor("a\nb", "a\nb c");
  assert.match(out, /\n/);
  assert.match(out, /<b>c<\/b>/);
});

// ---------------------------------------------------------------------------
// The two columns, quoted as they are (the default style)
// ---------------------------------------------------------------------------

test("the two columns are quoted one under the other, under the EP's own headings", () => {
  assert.equal(
    remarksColumns({
      originalText: "il gatto nero dorme",
      amendedText: "il gatto bianco dorme",
      originalHeader: "Proposta di risoluzione",
      amendedHeader: "Emendamento",
    }),
    "<u>Proposta di risoluzione</u>\nil gatto <b>nero</b> dorme\n\n<u>Emendamento</u>\nil gatto <b>bianco</b> dorme",
  );
});

test("each column keeps its own words, in its own order", () => {
  const out = remarksColumns({ originalText: "a b c", amendedText: "a d c" });
  assert.equal(out, "a <b>b</b> c\n\na <b>d</b> c");
});

test("the file's own runs are used as they are when they were kept", () => {
  assert.equal(
    remarksColumns({
      originalText: "il gatto nero",
      amendedText: "il gatto bianco",
      originalRich: "il gatto <b><i>nero</i></b>",
      amendedRich: "il gatto <b><i>bianco</i></b>",
      originalHeader: "Testo della Commissione",
      amendedHeader: "Emendamento",
    }),
    "<u>Testo della Commissione</u>\nil gatto <b><i>nero</i></b>\n\n<u>Emendamento</u>\nil gatto <b><i>bianco</i></b>",
  );
});

test("a new paragraph has no present text, so only the amendment is quoted", () => {
  assert.equal(
    remarksColumns({ amendedText: "5 bis. testo nuovo", amendedHeader: "Emendamento" }),
    "<u>Emendamento</u>\n<b>5 bis. testo nuovo</b>",
  );
});

test("paragraph breaks survive in both columns", () => {
  const out = remarksColumns({ originalText: "a\nb", amendedText: "a\nb c" });
  assert.equal(out, "a\nb\n\na\nb <b>c</b>");
});

test("the style switch picks the merged diff when asked for it", () => {
  const columns = { originalText: "il gatto nero", amendedText: "il gatto bianco" };
  assert.equal(remarksIn("diff", columns), "il gatto <s>nero</s> <b>bianco</b>");
  assert.equal(remarksIn("columns", columns), remarksColumns(columns));
});
