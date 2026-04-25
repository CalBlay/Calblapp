import test from "node:test";
import assert from "node:assert/strict";
import { enforceDataBackedAnswerPolicy } from "../src/core/policies/answer-policy.js";

test("policy blocks data intent without useful outcomes", () => {
  const out = enforceDataBackedAnswerPolicy({
    intent: { requiresDataTools: true },
    toolCallsUsed: 1,
    toolOutcomes: [{ ok: false, toolError: true, message: "failed" }],
    rawAnswer: "Resposta inventada"
  });
  assert.equal(out.allowed, false);
});

test("policy allows data intent with useful rows", () => {
  const out = enforceDataBackedAnswerPolicy({
    intent: { requiresDataTools: true },
    toolCallsUsed: 1,
    toolOutcomes: [{ rows: [{ x: 1 }] }],
    rawAnswer: "Resposta amb dades"
  });
  assert.equal(out.allowed, true);
});

test("policy allows non-data intent", () => {
  const out = enforceDataBackedAnswerPolicy({
    intent: { requiresDataTools: false },
    toolCallsUsed: 0,
    toolOutcomes: [],
    rawAnswer: "Text lliure"
  });
  assert.equal(out.allowed, true);
});
