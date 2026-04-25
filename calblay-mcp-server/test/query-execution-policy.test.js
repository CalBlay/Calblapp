import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQueryExecutionPolicy,
  shouldBlockCatalogFallback
} from "../src/core/policies/query-execution-policy.js";

test("query execution policy: deterministic preferred for catalog hit when enabled", () => {
  const out = buildQueryExecutionPolicy({
    queryPlan: {
      status: "catalog_hit",
      metricId: "cost_subministraments_month"
    },
    deterministicExecutorEnabled: true
  });
  assert.equal(out.deterministicPreferred, true);
  assert.equal(out.sourceLocks.financeKind, "costos");
});

test("query execution policy: no deterministic for catalog miss", () => {
  const out = buildQueryExecutionPolicy({
    queryPlan: {
      status: "catalog_miss",
      metricId: "unknown"
    },
    deterministicExecutorEnabled: true
  });
  assert.equal(out.deterministicPreferred, false);
});

test("query execution policy: strict mode blocks fallback for catalog metrics", () => {
  const out = buildQueryExecutionPolicy({
    queryPlan: {
      status: "ambiguous",
      metricId: "cost_subministraments_month"
    },
    deterministicExecutorEnabled: true
  });
  assert.equal(shouldBlockCatalogFallback(out, true), true);
  assert.equal(shouldBlockCatalogFallback(out, false), false);
});

test("query execution policy: strict mode does not block catalog miss", () => {
  const out = buildQueryExecutionPolicy({
    queryPlan: {
      status: "catalog_miss",
      metricId: "unknown"
    },
    deterministicExecutorEnabled: true
  });
  assert.equal(shouldBlockCatalogFallback(out, true), false);
});

