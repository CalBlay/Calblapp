import test from "node:test";
import assert from "node:assert/strict";
import {
  __matchPnlFileByMonthForTest,
  __parseYearMonthInputForTest
} from "../src/services/finances/pnl-queries.js";

test("pnl yearMonth parser: supports ISO", () => {
  assert.equal(__parseYearMonthInputForTest("2026-01"), "2026-01");
});

test("pnl yearMonth parser: supports catalan month", () => {
  assert.equal(__parseYearMonthInputForTest("gener 2026"), "2026-01");
});

test("pnl yearMonth parser: supports spanish month", () => {
  assert.equal(__parseYearMonthInputForTest("enero de 2026"), "2026-01");
});

test("pnl file matcher: picks 01_2026 style file", () => {
  const hit = __matchPnlFileByMonthForTest(
    ["01_2026_Sheet1", "01_2025_Sheet1", "vendes_2026"],
    "2026-01"
  );
  assert.equal(hit, "01_2026_Sheet1");
});
