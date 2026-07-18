import { test } from "node:test";
import assert from "node:assert/strict";
import { remarksFor } from "./remarksDiff.ts";

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
