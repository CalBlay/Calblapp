import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getGoldenDriftStats } from "../src/services/ml-learning.service.js";

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "calblay-drift-test-"));
}

test("golden drift: detects metric mismatch on overlapping trace", () => {
  const prevDir = process.env.ML_LEARNING_DIR;
  const prevEnabled = process.env.ML_LEARNING_ENABLED;
  const tempDir = mkTempDir();
  process.env.ML_LEARNING_ENABLED = "1";
  process.env.ML_LEARNING_DIR = tempDir;
  try {
    const tracesPath = path.join(tempDir, "chat-traces.jsonl");
    const row = {
      kind: "chat_trace",
      at: new Date().toISOString(),
      traceId: "drift-test-1",
      question: "Quin cost en subministraments hem tingut el 03-26?",
      queryPlan: {
        metricId: "wrong_metric"
      },
      result: {
        toolChoiceSource: "deterministic_executor"
      }
    };
    fs.writeFileSync(tracesPath, `${JSON.stringify(row)}\n`, "utf8");
    const out = getGoldenDriftStats({ traceLimit: 50 });
    assert.equal(out.matchedGoldenTraces, 1);
    assert.equal(out.mismatchCount, 1);
    assert.equal(out.ok, false);
  } finally {
    if (prevDir === undefined) delete process.env.ML_LEARNING_DIR;
    else process.env.ML_LEARNING_DIR = prevDir;
    if (prevEnabled === undefined) delete process.env.ML_LEARNING_ENABLED;
    else process.env.ML_LEARNING_ENABLED = prevEnabled;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("golden drift: passes when overlap has same metric", () => {
  const prevDir = process.env.ML_LEARNING_DIR;
  const prevEnabled = process.env.ML_LEARNING_ENABLED;
  const tempDir = mkTempDir();
  process.env.ML_LEARNING_ENABLED = "1";
  process.env.ML_LEARNING_DIR = tempDir;
  try {
    const tracesPath = path.join(tempDir, "chat-traces.jsonl");
    const row = {
      kind: "chat_trace",
      at: new Date().toISOString(),
      traceId: "drift-test-2",
      question: "Quin cost en subministraments hem tingut el 03-26?",
      queryPlan: {
        metricId: "cost_subministraments_month"
      },
      result: {
        toolChoiceSource: "deterministic_executor"
      }
    };
    fs.writeFileSync(tracesPath, `${JSON.stringify(row)}\n`, "utf8");
    const out = getGoldenDriftStats({ traceLimit: 50 });
    assert.equal(out.matchedGoldenTraces, 1);
    assert.equal(out.mismatchCount, 0);
    assert.equal(out.ok, true);
  } finally {
    if (prevDir === undefined) delete process.env.ML_LEARNING_DIR;
    else process.env.ML_LEARNING_DIR = prevDir;
    if (prevEnabled === undefined) delete process.env.ML_LEARNING_ENABLED;
    else process.env.ML_LEARNING_ENABLED = prevEnabled;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
