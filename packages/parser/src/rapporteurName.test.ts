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

// Taking the last word dropped the first half of every Spanish and Portuguese
// double surname: López Aguilar was filed under AGUILAR. 58 of the 747 members
// of the tenth term are written this way.
test("a surname of several words is kept whole", () => {
  assert.equal(rapporteurLabel("Juan Fernando LÓPEZ AGUILAR"), "LÓPEZ AGUILAR");
  assert.equal(rapporteurLabel("Iratxe GARCÍA PÉREZ"), "GARCÍA PÉREZ");
  assert.equal(rapporteurLabel("Carmen CRESPO DÍAZ"), "CRESPO DÍAZ");
  assert.equal(rapporteurLabel("Paulo DO NASCIMENTO CABRAL"), "DO NASCIMENTO CABRAL");
  assert.equal(rapporteurLabel("Margarita DE LA PISA CARRIÓN"), "DE LA PISA CARRIÓN");
  assert.equal(rapporteurLabel("Raquel GARCÍA HERMIDA-VAN DER WALLE"), "GARCÍA HERMIDA-VAN DER WALLE");
});

test("the given name is dropped even when it is several words", () => {
  assert.equal(rapporteurLabel("Juan Carlos GIRAUTA VIDAL"), "GIRAUTA VIDAL");
  assert.equal(rapporteurLabel("Francisco José MILLÁN MON"), "MILLÁN MON");
});

/**
 * The agenda prints the surname alone, in capitals, and prints all of it. These
 * are the rapporteurs of the November II part-session exactly as they appear in
 * the Conference of Presidents' draft agenda (SYN_POJ_November II_STR_EN), so a
 * label that does not come back unchanged is a label the Parliament would not
 * recognise on its own order of business.
 */
test("the agenda's own spelling survives a round trip", () => {
  for (const printed of [
    "LÓPEZ AGUILAR",
    "CRESPO DÍAZ",
    "VAN LANSCHOT",
    "ZDECHOVSKÝ, ERIXON",
    "VIVALDINI, HANSEN, MANDL",
    "TEMIDO, JARUBAS",
    "WÖLKEN",
    "KYLLÖNEN",
    "MONTSERRAT",
    "SATOURI",
  ]) {
    assert.equal(rapporteurLabel(printed), printed);
  }
});

test("no rapporteur gives no label", () => {
  assert.equal(rapporteurLabel(null), null);
  assert.equal(rapporteurLabel(undefined), null);
  assert.equal(rapporteurLabel("   "), null);
});
