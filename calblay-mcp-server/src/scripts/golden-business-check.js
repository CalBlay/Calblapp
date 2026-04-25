import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQueryPlan } from "../services/query-planner.service.js";
import {
  buildQueryExecutionPolicy,
  shouldBlockCatalogFallback
} from "../core/policies/query-execution-policy.js";
import { executeDeterministicMetric } from "../services/deterministic-executor.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function readGoldenCases() {
  const p = path.join(projectRoot, "config", "golden_business_cases.json");
  const raw = fs.readFileSync(p, "utf8");
  const parsed = JSON.parse(raw);
  const cases = Array.isArray(parsed?.cases) ? parsed.cases : [];
  return {
    path: p,
    version: String(parsed?.version || "v1"),
    updatedAt: parsed?.updatedAt || null,
    cases
  };
}

function hasFirebaseEnv() {
  const a =
    String(process.env.FIREBASE_PROJECT_ID || "").trim() &&
    String(process.env.FIREBASE_CLIENT_EMAIL || "").trim() &&
    String(process.env.FIREBASE_PRIVATE_KEY || "").trim();
  const b =
    String(process.env.ID_PROJECTE_FIREBASE || "").trim() &&
    String(process.env.CORREU_ELECTRONIC_DE_CLIENT_DE_FIREBASE || "").trim() &&
    String(process.env.FIREBASE_PRIVATE_CLAU || "").trim();
  return Boolean(a || b);
}

function getByPath(obj, dotted) {
  const parts = String(dotted || "")
    .split(".")
    .filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function compareNumeric(actualRaw, op, expectedRaw) {
  const actual = Number(actualRaw);
  const expected = Number(expectedRaw);
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  if (op === "eq") return actual === expected;
  if (op === "gte") return actual >= expected;
  if (op === "lte") return actual <= expected;
  return false;
}

async function evaluateCase(c) {
  const question = String(c?.question || "");
  const expected = c?.expected && typeof c.expected === "object" ? c.expected : {};
  const plan = buildQueryPlan({ question, currentYear: new Date().getFullYear() });
  const policy = buildQueryExecutionPolicy({
    queryPlan: plan,
    deterministicExecutorEnabled: true
  });
  const strictBlocksFallback = shouldBlockCatalogFallback(policy, true);
  const slots = c?.slots && typeof c.slots === "object" ? c.slots : plan.slots || {};

  const failures = [];
  if (expected.metricId && plan.metricId !== expected.metricId) {
    failures.push(`metricId expected=${expected.metricId} actual=${plan.metricId}`);
  }
  if (expected.policySystem && policy.sourceLocks.system !== expected.policySystem) {
    failures.push(
      `policy.sourceLocks.system expected=${expected.policySystem} actual=${policy.sourceLocks.system}`
    );
  }
  if (expected.policyFinanceKind && policy.sourceLocks.financeKind !== expected.policyFinanceKind) {
    failures.push(
      `policy.sourceLocks.financeKind expected=${expected.policyFinanceKind} actual=${policy.sourceLocks.financeKind}`
    );
  }

  let execution = null;
  try {
    if (plan.metricId && plan.metricId !== "unknown") {
      execution = await executeDeterministicMetric({
        metricId: plan.metricId,
        slots
      });
    } else {
      failures.push("planner did not resolve to catalog metric");
    }
  } catch (e) {
    failures.push(`deterministic execution exception: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (execution?.ok !== true) {
    failures.push(`deterministic execution failed: ${execution?.error || "unknown_error"}`);
  }

  if (expected.mustNotHaveWarning && String(execution?.result?.warning || "").trim()) {
    failures.push(`unexpected warning: ${String(execution.result.warning)}`);
  }

  const numericAssertions = Array.isArray(expected.numericAssertions) ? expected.numericAssertions : [];
  for (const a of numericAssertions) {
    const actual = getByPath(execution, a?.path);
    const ok = compareNumeric(actual, String(a?.op || "eq"), a?.value);
    if (!ok) {
      failures.push(
        `numeric assertion failed path=${a?.path} op=${a?.op} expected=${a?.value} actual=${actual}`
      );
    }
  }

  return {
    id: String(c?.id || ""),
    skipped: false,
    ok: failures.length === 0,
    question,
    strictBlocksFallback,
    plan,
    policy,
    slots,
    execution,
    failures
  };
}

async function main() {
  const golden = readGoldenCases();
  const allowSkipOnMissingFirebase =
    String(process.env.GOLDEN_ALLOW_SKIP_FIRESTORE || "1").trim() !== "0";
  const firebaseReady = hasFirebaseEnv();
  const results = [];
  for (const c of golden.cases) {
    const expected = c?.expected && typeof c.expected === "object" ? c.expected : {};
    const needsFirestore = String(expected.policySystem || "").trim() === "firestore";
    if (needsFirestore && !firebaseReady && allowSkipOnMissingFirebase) {
      results.push({
        id: String(c?.id || ""),
        skipped: true,
        ok: true,
        question: String(c?.question || ""),
        failures: [],
        note: "Skipped: missing Firebase credentials in environment."
      });
      // eslint-disable-next-line no-continue
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    results.push(await evaluateCase(c));
  }
  const skipped = results.filter((r) => r.skipped).length;
  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;
  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      path: golden.path,
      version: golden.version,
      updatedAt: golden.updatedAt
    },
    summary: {
      total: results.length,
      passed,
      skipped,
      failed
    },
    results
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failed > 0) process.exit(2);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[golden-business-check] failed", e);
  process.exit(1);
});

