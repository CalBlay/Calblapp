import test from "node:test";
import assert from "node:assert/strict";
import { parseVendesJornadaYearMonth } from "../src/services/finances/sales-queries.js";

test("parseVendesJornadaYearMonth: prefix YYYY-MM with text", () => {
  assert.equal(parseVendesJornadaYearMonth("2026-01 enero"), "2026-01");
});

test("parseVendesJornadaYearMonth: ISO date", () => {
  assert.equal(parseVendesJornadaYearMonth("2026-03-15"), "2026-03");
});

test("parseVendesJornadaYearMonth: empty", () => {
  assert.equal(parseVendesJornadaYearMonth(""), null);
});
