import test from "node:test";
import assert from "node:assert/strict";
import { buildQueryPlan } from "../src/services/query-planner.service.js";

test("query planner: vehicle assignment question", () => {
  const plan = buildQueryPlan({
    question: "Quants cops hem assignat la furgoneta 4259-FWD?",
    currentYear: 2026
  });
  assert.equal(plan.metricId, "vehicle_assignments_count_by_plate");
  assert.equal(plan.executor, "vehicle_assignments_count_by_plate");
  assert.equal(plan.slots.plate, "4259-FWD");
});

test("query planner: subministraments cost question", () => {
  const plan = buildQueryPlan({
    question: "Quin cost en subministraments hem tingut el 03-26?",
    currentYear: 2026
  });
  assert.equal(plan.metricId, "cost_subministraments_month");
  assert.equal(plan.executor, "costs_by_department_period");
  assert.equal(plan.slots.departmentContains, "subministr");
});

test("query planner: unknown question gives catalog miss", () => {
  const plan = buildQueryPlan({
    question: "Quin és el millor restaurant del món?",
    currentYear: 2026
  });
  assert.equal(plan.status, "catalog_miss");
  assert.equal(plan.executor, "auto");
});

test("query planner: personnel intent without department is ambiguous", () => {
  const plan = buildQueryPlan({
    question: "Quant personal tenim?",
    currentYear: 2026
  });
  assert.equal(plan.metricId, "personnel_count_by_department");
  assert.equal(plan.status, "ambiguous");
});

test("query planner: cost intent without period is ambiguous", () => {
  const plan = buildQueryPlan({
    question: "Quin cost en subministraments hem tingut?",
    currentYear: 2026
  });
  assert.equal(plan.metricId, "cost_subministraments_month");
  assert.equal(plan.status, "ambiguous");
});

