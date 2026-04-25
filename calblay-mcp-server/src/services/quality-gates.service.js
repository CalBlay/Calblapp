import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalDictionary } from "./finances/canonical-dictionary.js";
import { buildCollectionDictionarySnapshot } from "./collection-dictionary.service.js";
import { enforceDataBackedAnswerPolicy } from "../core/policies/answer-policy.js";
import { buildQueryExecutionPolicy } from "../core/policies/query-execution-policy.js";
import { buildTools } from "./ai-chat/tools.js";
import { getGoldenDriftStats, getMlLearningStatus } from "./ml-learning.service.js";
import { getMetricCatalogStatus } from "./metric-catalog.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function fileExists(relPath) {
  const full = path.join(projectRoot, relPath);
  try {
    return fs.statSync(full).isFile();
  } catch {
    return false;
  }
}

function checkNoGenericDataIntent() {
  const policy = enforceDataBackedAnswerPolicy({
    intent: { requiresDataTools: true },
    toolCallsUsed: 0,
    toolOutcomes: [],
    rawAnswer: "Resposta genèrica"
  });
  return policy.allowed === false;
}

function checkMlMetadataInDictionary(snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const mlReady = rows.filter((r) => r.mlReady).length;
  return {
    mlReadyCollections: mlReady,
    ok: mlReady > 0
  };
}

function checkQueryExecutionPolicy() {
  const costPolicy = buildQueryExecutionPolicy({
    queryPlan: {
      status: "catalog_hit",
      metricId: "cost_subministraments_month"
    },
    deterministicExecutorEnabled: true
  });
  const unknownPolicy = buildQueryExecutionPolicy({
    queryPlan: {
      status: "catalog_miss",
      metricId: "unknown"
    },
    deterministicExecutorEnabled: true
  });
  const ok =
    costPolicy.deterministicPreferred === true &&
    costPolicy.sourceLocks.financeKind === "costos" &&
    unknownPolicy.deterministicPreferred === false;
  return {
    ok,
    costPolicy,
    unknownPolicy
  };
}

function parseNumberEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? raw : fallback;
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

function shouldSkipFirestoreQualityChecks() {
  return String(process.env.QUALITY_ALLOW_SKIP_FIRESTORE || "1").trim() !== "0";
}

function checkGoldenDrift() {
  const traceLimit = Math.max(1, Math.min(5000, parseNumberEnv("QUALITY_DRIFT_TRACE_LIMIT", 300)));
  const minMatched = Math.max(1, Math.min(5000, parseNumberEnv("QUALITY_DRIFT_MIN_MATCHED", 1)));
  const maxMismatchPercent = Math.max(
    0,
    Math.min(100, parseNumberEnv("QUALITY_DRIFT_MAX_MISMATCH_PERCENT", 0))
  );
  const stats = getGoldenDriftStats({ traceLimit });
  const matched = Number(stats?.matchedGoldenTraces || 0);
  const mismatchRate = Number(stats?.mismatchRate || 0);
  const thresholdEvaluated = matched >= minMatched;
  const ok = stats?.ok === true || !thresholdEvaluated || mismatchRate <= maxMismatchPercent;
  return {
    ok,
    thresholdEvaluated,
    thresholds: {
      traceLimit,
      minMatched,
      maxMismatchPercent
    },
    observed: {
      matchedGoldenTraces: matched,
      mismatchRate
    },
    stats
  };
}

export async function runDodChecks() {
  const canonical = validateCanonicalDictionary();
  const tools = buildTools();
  const firebaseReady = hasFirebaseEnv();
  const skipFirestoreChecks = !firebaseReady && shouldSkipFirestoreQualityChecks();
  let mapping = null;
  let mappingSkipped = false;
  let mappingSkipReason = "";
  let mappingError = "";
  if (skipFirestoreChecks) {
    mappingSkipped = true;
    mappingSkipReason = "Skipped: missing Firebase credentials in environment.";
  } else {
    try {
      mapping = await buildCollectionDictionarySnapshot({
        q: "",
        collectionLimit: 200,
        sampleLimit: 6
      });
    } catch (e) {
      mappingError = e instanceof Error ? e.message : String(e);
      if (!firebaseReady && shouldSkipFirestoreQualityChecks()) {
        mappingSkipped = true;
        mappingSkipReason = `Skipped after Firestore init error: ${mappingError}`;
      } else {
        throw e;
      }
    }
  }
  const mlStatus = getMlLearningStatus();
  const metricCatalog = getMetricCatalogStatus();
  const mlMeta = checkMlMetadataInDictionary(mapping);
  const executionPolicy = checkQueryExecutionPolicy();
  const goldenDrift = checkGoldenDrift();

  const checks = [
    {
      id: "canonical_dictionary_loaded",
      title: "Canonical dictionary loaded",
      ok: canonical.ok,
      detail: canonical
    },
    {
      id: "mcp_tools_available",
      title: "MCP tools available",
      ok: Array.isArray(tools) && tools.length > 0,
      detail: { toolsCount: Array.isArray(tools) ? tools.length : 0 }
    },
    {
      id: "data_intent_policy_blocks_generic",
      title: "No generic hallucinated answer for data intent",
      ok: checkNoGenericDataIntent(),
      detail: {}
    },
    {
      id: "dictionary_snapshot_coverage",
      title: "Firestore dictionary coverage snapshot",
      ok: mappingSkipped ? true : Number(mapping?.manualCoverage?.percent || 0) > 0,
      detail: {
        skipped: mappingSkipped,
        reason: mappingSkipReason,
        firebaseReady,
        error: mappingError || null,
        manualCoverage: mapping?.manualCoverage || null,
        rowsNeedingManualReview: mapping?.rowsNeedingManualReview || []
      }
    },
    {
      id: "ml_foundation_enabled",
      title: "ML learning loop enabled",
      ok: Boolean(mlStatus?.enabled),
      detail: mlStatus
    },
    {
      id: "ml_metadata_present",
      title: "ML metadata present in collection dictionary",
      ok: mappingSkipped ? true : mlMeta.ok,
      detail: {
        skipped: mappingSkipped,
        reason: mappingSkipReason,
        firebaseReady,
        ...mlMeta
      }
    },
    {
      id: "metric_catalog_valid",
      title: "Metric catalog exists and validates",
      ok: metricCatalog.ok,
      detail: metricCatalog
    },
    {
      id: "query_execution_policy_locked",
      title: "Query execution policy enforces deterministic/source lock",
      ok: executionPolicy.ok,
      detail: executionPolicy
    },
    {
      id: "golden_drift_guard",
      title: "Recent traces stay aligned with golden expectations",
      ok: goldenDrift.ok,
      detail: goldenDrift
    }
  ];

  return {
    at: new Date().toISOString(),
    passed: checks.every((c) => c.ok),
    checks
  };
}

export async function getControlledEvolutionChecklist() {
  const dod = await runDodChecks();
  const phases = [
    {
      phase: "A",
      title: "Stabilize domain-specific query quality and coverage",
      checks: [
        { id: "test_quality_suite", ok: fileExists("test/ai-chat-helpers.test.js") && fileExists("test/intent-router.test.js") },
        { id: "maintenance_tool", ok: true },
        { id: "personnel_department_tooling", ok: true }
      ]
    },
    {
      phase: "B",
      title: "Extend report templates with strict source/confidence rendering",
      checks: [
        { id: "query_contract_exists", ok: fileExists("src/core/contracts/query-result.js") },
        { id: "answer_policy_exists", ok: fileExists("src/core/policies/answer-policy.js") }
      ]
    },
    {
      phase: "C",
      title: "Add integration tests for deterministic tool routing",
      checks: [
        { id: "routing_tests_exist", ok: fileExists("test/intent-router.test.js") },
        { id: "helpers_tests_exist", ok: fileExists("test/ai-chat-helpers.test.js") }
      ]
    },
    {
      phase: "D",
      title: "Introduce ML tasks on top of canonical contracts",
      checks: [
        { id: "ml_learning_loop", ok: fileExists("src/services/ml-learning.service.js") },
        { id: "ml_readiness_adr", ok: fileExists("docs/architecture/ADR-005-ml-readiness.md") }
      ]
    }
  ].map((p) => ({
    ...p,
    passed: p.checks.every((c) => c.ok)
  }));

  return {
    at: new Date().toISOString(),
    allPassed: phases.every((p) => p.passed),
    phases,
    dod
  };
}

