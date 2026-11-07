import { test } from "node:test";
import assert from "node:assert/strict";
import { rapporteurLabel } from "./rapporteurName.ts";

test("the label is the surname, upper-cased", () => {
  assert.equal(rapporteurLabel("Barry Andrews"), "ANDREWS");
  assert.equal(rapporteurLabel("Bernd LANGE"), "LANGE");
  assert.equal(rapporteurLabel("Vlad VASILE-VOICULESCU"), "VASILE-VOICULESCU");
});

test("co-rapporteurs keep their comma", () => {
  assert.equal(rapporteurLabel("Leire PAJÍN, Aurelijus VERYGA"), "PAJÍN, VERYGA");
  assert.equal(rapporteurLabel("Marie-Agnes STRACK-ZIMMERMANN, Borys BUDKA"), "STRACK-ZIMMERMANN, BUDKA");
});

test("particles stay with the family name", () => {
  assert.equal(rapporteurLabel("Johan Van Overtveldt"), "VAN OVERTVELDT");
  assert.equal(rapporteurLabel("Dirk van der Maelen"), "VAN DER MAELEN");
});

// The three forms the syncs write for the same member all render the same, which
// is why --check compares labels and not the strings themselves.
test("a bare surname and a full name give the same label", () => {
  assert.equal(rapporteurLabel("STAĶIS"), "STAĶIS");
  assert.equal(rapporteurLabel("Mārtiņš STAĶIS"), "STAĶIS");
  assert.equal(rapporteurLabel("Aurelijus Veryga"), "VERYGA");
  assert.equal(rapporteurLabel("Aurelijus VERYGA"), "VERYGA");
});

test("no rapporteur gives no label", () => {
  assert.equal(rapporteurLabel(null), null);
  assert.equal(rapporteurLabel(undefined), null);
  assert.equal(rapporteurLabel("   "), null);
});
