import test from "node:test";
import assert from "node:assert/strict";
import { detectQueryIntent } from "../src/core/semantics/intent-router.js";

test("intent router: resultat financer -> finance domain", () => {
  const out = detectQueryIntent("Resultat financer per línia de negoci del gener de 2026");
  assert.equal(out.domain, "finance");
  assert.equal(out.hints.financeType, "costs");
  assert.equal(out.hints.asksPeriod, true);
});

test("intent router: preventius planificats -> maintenance domain", () => {
  const out = detectQueryIntent("quants preventius planificats tenim el 04-05-26?");
  assert.equal(out.domain, "maintenance");
  assert.equal(out.requiresDataTools, true);
});
