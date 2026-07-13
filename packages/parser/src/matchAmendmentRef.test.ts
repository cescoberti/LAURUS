import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRef, indexAmendments, parseAmendmentNumber } from "./matchAmendmentRef.ts";
import type { ParsedAmendment } from "./types.ts";

const am = (number: number, kind: ParsedAmendment["kind"] = "standard"): ParsedAmendment => ({
  number,
  language: "it",
  kind,
});

const index = indexAmendments([am(72), am(15), am(3, "withdrawn"), am(9, "oral")]);

test("parses Italian amendment references", () => {
  assert.equal(parseAmendmentNumber("Am 72"), 72);
  assert.equal(parseAmendmentNumber("Em. 15"), 15);
  assert.equal(parseAmendmentNumber("Emendamento 3"), 3);
  assert.equal(parseAmendmentNumber("§ 15"), null);
});

test("resolves a valid amendment reference to auto", () => {
  assert.deepEqual(resolveRef("Am 72", index), { status: "auto", amendmentNumber: 72 });
});

test("flags paragraph references as anomalies, not amendments", () => {
  assert.deepEqual(resolveRef("§ 15", index), { status: "anomaly", reason: "paragraph_ref" });
  assert.deepEqual(resolveRef("Considerando C", index), { status: "anomaly", reason: "paragraph_ref" });
});

test("flags withdrawn / oral / compromise / missing", () => {
  assert.deepEqual(resolveRef("Em. 3", index), { status: "anomaly", reason: "withdrawn" });
  assert.deepEqual(resolveRef("Am 9", index), { status: "anomaly", reason: "oral" });
  assert.deepEqual(resolveRef("Emendamento orale 5", index), { status: "anomaly", reason: "oral" });
  assert.deepEqual(resolveRef("CAM 1", index), { status: "anomaly", reason: "compromise_cam" });
  assert.deepEqual(resolveRef("Am 999", index), { status: "anomaly", reason: "not_found" });
});

test("never invents: unparseable subject is unresolvable", () => {
  assert.deepEqual(resolveRef("Votazione finale", index), { status: "anomaly", reason: "unresolvable" });
});
