import test from "node:test";
import assert from "node:assert/strict";
import { executeDeterministicMetric } from "../src/services/deterministic-executor.service.js";

test("deterministic executor: missing required slots returns structured error", async () => {
  const out = await executeDeterministicMetric({
    metricId: "preventius_planned_count_day",
    slots: {}
  });
  assert.equal(out.ok, false);
  assert.equal(Array.isArray(out.missingSlots), true);
  assert.equal(out.missingSlots.includes("date"), true);
});

test("deterministic executor: executes metric with mapped executor", async () => {
  const out = await executeDeterministicMetric({
    metricId: "vehicle_assignments_count_by_plate",
    slots: { plate: "4259-fwd" },
    runner: async (toolName, args) => ({ toolName, args, count: 3 })
  });
  assert.equal(out.ok, true);
  assert.equal(out.executor, "vehicle_assignments_count_by_plate");
  assert.equal(out.slotsUsed.plate, "4259-FWD");
  assert.equal(out.result.count, 3);
});

