import test from "node:test";
import assert from "node:assert/strict";
import { getMetricCatalogStatus, validateMetricCatalog, readMetricCatalog } from "../src/services/metric-catalog.service.js";

test("metric catalog: validates and has minimum coverage", () => {
  const read = readMetricCatalog();
  assert.equal(read.ok, true);
  const validation = validateMetricCatalog(read.catalog);
  assert.equal(validation.ok, true);
  assert.ok(validation.activeMetricsCount >= 20, `expected >= 20 metrics, got ${validation.activeMetricsCount}`);
});

test("metric catalog: status endpoint shape", () => {
  const status = getMetricCatalogStatus();
  assert.equal(status.ok, true);
  assert.ok(status.validation.metricsCount >= 20);
});
