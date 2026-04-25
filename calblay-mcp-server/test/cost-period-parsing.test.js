import test from "node:test";
import assert from "node:assert/strict";
import { __periodTokensFromInputForTest } from "../src/services/cost-imputation.service.js";

test("period parser: supports 2026-T1", () => {
  const t = __periodTokensFromInputForTest("2026-T1");
  assert.ok(t.includes("2026q1"));
});

test("period parser: supports natural language quarter", () => {
  const t = __periodTokensFromInputForTest("primer trimestre 2026");
  assert.ok(t.includes("2026q1"));
});

test("period parser: supports catalan month names", () => {
  const t = __periodTokensFromInputForTest("gener 2026");
  assert.ok(t.includes("2026-01"));
});

test("period parser: supports spanish month names", () => {
  const t = __periodTokensFromInputForTest("febrero 2026");
  assert.ok(t.includes("2026-02"));
});
