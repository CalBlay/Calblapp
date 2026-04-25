import { apiErrorHandler } from "./middleware/api-error-handler.js";
import { chatRateLimit } from "./middleware/chat-rate-limit.js";
import { asyncHandler } from "./utils/async-handler.js";
import { HttpError } from "./utils/http-error.js";
import { requireApiKey } from "./utils/auth.js";
import { chatWithTools } from "./services/ai-chat.service.js";
import {
  listFinanceCsvFilesForKind,
  normalizeFinanceKind,
  previewFinanceCsv
} from "./services/finances.service.js";
import {
  buildEventSummary,
  getEventDetail,
  getEventFullByCode,
  getEvents
} from "./services/webapp.service.js";
import {
  getPowerBiDatasetRefreshHistory,
  refreshPowerBiDataset
} from "./services/powerbi.service.js";
import { getPurchases, getSales, loginSap } from "./services/sap.service.js";
import {
  clearFirestoreCatalogCache,
  getFirestoreCatalogCacheStats,
  listTopLevelCollections,
  mapCollectionsToDomainsDetailed,
  mapCollectionsToDomains,
  sampleCollectionDocuments
} from "./services/firestore.service.js";
import { buildCollectionDictionarySnapshot, readCollectionDictionary } from "./services/collection-dictionary.service.js";
import {
  getMappingDeltaStatus,
  runFirestoreMappingDeltaJob
} from "./services/firestore-mapping-delta.service.js";
import { getMlLearningStatus, getToolChoiceSourceStats, logChatFeedback } from "./services/ml-learning.service.js";
import { getControlledEvolutionChecklist, runDodChecks } from "./services/quality-gates.service.js";
import { getDodHistory, writeDodSnapshot } from "./services/quality-history.service.js";
import { getMetricCatalogStatus, readMetricCatalog } from "./services/metric-catalog.service.js";
import { buildQueryPlan } from "./services/query-planner.service.js";
import { executeDeterministicMetric } from "./services/deterministic-executor.service.js";

/**
 * Rutes amb dependències pesants (Firestore, etc.). Es carreguen després que el port
 * ja escolta, per complir el contracte de Cloud Run (startup probe).
 */
export function registerRoutes(app) {
  app.use(requireApiKey);

  app.get(
    "/tools/firestore/collections",
    asyncHandler(async (req, res) => {
      const q = String(req.query.q || "").trim().toLowerCase();
      const all = await listTopLevelCollections();
      const data = q ? all.filter((name) => name.toLowerCase().includes(q)) : all;
      res.json({ ok: true, count: data.length, total: all.length, data });
    })
  );

  app.get(
    "/tools/firestore/collection-sample",
    asyncHandler(async (req, res) => {
      const name = String(req.query.name || "").trim();
      const limit = Number(req.query.limit || 10);
      if (!name) throw new HttpError(400, "Missing name query param");
      const data = await sampleCollectionDocuments(name, { limit });
      res.json({ ok: true, data });
    })
  );

  app.get(
    "/tools/firestore/domain-mapping",
    asyncHandler(async (_req, res) => {
      const data = await mapCollectionsToDomains();
      res.json({ ok: true, ...data });
    })
  );

  app.get(
    "/tools/firestore/domain-mapping-detailed",
    asyncHandler(async (req, res) => {
      const q = String(req.query.q || "");
      const collectionLimit = Number(req.query.collectionLimit || 200);
      const sampleLimit = Number(req.query.sampleLimit || 12);
      const data = await mapCollectionsToDomainsDetailed({ q, collectionLimit, sampleLimit });
      res.json({ ok: true, ...data });
    })
  );

  app.get(
    "/tools/firestore/collection-dictionary",
    asyncHandler(async (req, res) => {
      const q = String(req.query.q || "");
      const collectionLimit = Number(req.query.collectionLimit || 200);
      const sampleLimit = Number(req.query.sampleLimit || 8);
      const includeDynamic = String(req.query.includeDynamic || "1").toLowerCase() !== "0";
      if (!includeDynamic) {
        const data = readCollectionDictionary();
        return res.json({ ok: data.ok, ...data });
      }
      const data = await buildCollectionDictionarySnapshot({ q, collectionLimit, sampleLimit });
      res.json({ ok: true, ...data });
    })
  );

  app.get(
    "/tools/metrics/catalog",
    asyncHandler(async (_req, res) => {
      const out = readMetricCatalog();
      res.json(out);
    })
  );

  app.get(
    "/tools/metrics/catalog/status",
    asyncHandler(async (_req, res) => {
      const out = getMetricCatalogStatus();
      res.json(out);
    })
  );

  app.post(
    "/tools/query-plan",
    asyncHandler(async (req, res) => {
      const question = String(req.body?.question || "").trim();
      if (!question) throw new HttpError(400, "Missing question");
      const currentYear = new Date().getFullYear();
      const plan = buildQueryPlan({ question, currentYear });
      res.json({ ok: true, plan });
    })
  );

  app.post(
    "/tools/executor/run",
    asyncHandler(async (req, res) => {
      const metricId = String(req.body?.metricId || "").trim();
      if (!metricId) throw new HttpError(400, "Missing metricId");
      const slots = req.body?.slots && typeof req.body.slots === "object" ? req.body.slots : {};
      const out = await executeDeterministicMetric({ metricId, slots });
      res.status(out.ok ? 200 : 400).json({ ok: out.ok, ...out });
    })
  );

  app.get(
    "/tools/firestore/cache-stats",
    asyncHandler(async (_req, res) => {
      const data = getFirestoreCatalogCacheStats();
      res.json({ ok: true, ...data });
    })
  );

  app.post(
    "/tools/firestore/cache-clear",
    asyncHandler(async (_req, res) => {
      const data = clearFirestoreCatalogCache();
      res.json({ ok: true, ...data });
    })
  );

  app.get(
    "/jobs/firestore/mapping-delta/status",
    asyncHandler(async (_req, res) => {
      const data = getMappingDeltaStatus();
      res.json({ ok: true, ...data });
    })
  );

  app.post(
    "/jobs/firestore/mapping-delta/run",
    asyncHandler(async (req, res) => {
      const q = String(req.body?.q || "");
      const limit = Number(req.body?.limit || 500);
      const sampleLimit = Number(req.body?.sampleLimit || 8);
      const result = await runFirestoreMappingDeltaJob({
        q,
        limit,
        sampleLimit,
        trigger: "manual_endpoint"
      });
      res.json(result);
    })
  );

  app.get(
    "/tools/get_events",
    asyncHandler(async (req, res) => {
      const data = await getEvents(req.query);
      res.json({ ok: true, count: data.length, data });
    })
  );

  app.get(
    "/tools/get_event_by_code",
    asyncHandler(async (req, res) => {
      const code = req.query.code;
      if (!code || String(code).trim() === "") {
        throw new HttpError(400, "Missing code query param");
      }
      const data = await getEventFullByCode(String(code));
      if (!data) {
        throw new HttpError(404, "No esdeveniment amb aquest code");
      }
      res.json({ ok: true, data });
    })
  );

  app.get(
    "/tools/get_event_detail/:eventId",
    asyncHandler(async (req, res) => {
      const data = await getEventDetail(req.params.eventId);
      if (!data) throw new HttpError(404, "Event not found");
      res.json({ ok: true, data });
    })
  );

  app.get(
    "/tools/event_summary/:eventId",
    asyncHandler(async (req, res) => {
      const data = await buildEventSummary(req.params.eventId);
      if (!data) throw new HttpError(404, "Event not found");
      res.json({ ok: true, data });
    })
  );

  app.post(
    "/jobs/refresh-powerbi",
    asyncHandler(async (req, res) => {
      const pollQ = String(req.query.poll || "");
      const pollB = req.body && typeof req.body === "object" ? req.body.poll : undefined;
      const poll =
        pollQ === "1" ||
        pollQ === "true" ||
        pollB === true ||
        pollB === 1 ||
        String(pollB || "") === "true";
      const result = await refreshPowerBiDataset({ poll });
      res.json(result);
    })
  );

  /** Estat dels últims refrescos PBI sense engegar-ne un de nou (útil després de POST /jobs/refresh-powerbi). */
  app.get(
    "/jobs/powerbi/refresh-status",
    asyncHandler(async (req, res) => {
      const top = Math.min(50, Math.max(1, Number(req.query.top || 10)));
      const data = await getPowerBiDatasetRefreshHistory(top);
      res.json(data);
    })
  );

  app.get(
    "/tools/sap/login",
    asyncHandler(async (_req, res) => {
      const result = await loginSap();
      res.json({ ok: true, sessionId: result.sessionId, routeId: result.routeId });
    })
  );

  app.get(
    "/tools/sap/purchases",
    asyncHandler(async (_req, res) => {
      const data = await getPurchases();
      res.json({ ok: true, count: Array.isArray(data) ? data.length : 0, data });
    })
  );

  app.get(
    "/tools/sap/sales",
    asyncHandler(async (_req, res) => {
      const data = await getSales();
      res.json({ ok: true, count: Array.isArray(data) ? data.length : 0, data });
    })
  );

  app.get(
    "/tools/finances/list",
    asyncHandler(async (req, res) => {
      const kind = normalizeFinanceKind(String(req.query.kind || "compres"));
      const files = await listFinanceCsvFilesForKind(kind);
      res.json({ ok: true, kind, count: files.length, files });
    })
  );

  app.get(
    "/tools/finances/preview",
    asyncHandler(async (req, res) => {
      const file = String(req.query.file || "");
      const rows = Number(req.query.rows || 20);
      const kind = normalizeFinanceKind(String(req.query.kind || "compres"));
      try {
        const data = await previewFinanceCsv(file, rows, kind);
        res.json({ ok: true, data });
      } catch (e) {
        throw new HttpError(400, e.message || "Bad request");
      }
    })
  );

  app.post(
    "/chat",
    chatRateLimit,
    asyncHandler(async (req, res) => {
      const question = String(req.body?.question || "").trim();
      const language = String(req.body?.language || "ca");
      if (!question) {
        throw new HttpError(400, "Missing question");
      }
      const rich = Boolean(req.body?.rich);
      const result = await chatWithTools({ question, language, rich });
      res.json({ ok: true, ...result });
    })
  );

  app.post(
    "/chat/feedback",
    asyncHandler(async (req, res) => {
      const traceId = String(req.body?.traceId || "").trim();
      if (!traceId) throw new HttpError(400, "Missing traceId");
      const helpful = req.body?.helpful;
      const correctedAnswer = String(req.body?.correctedAnswer || "");
      const note = String(req.body?.note || "");
      const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
      const out = logChatFeedback({ traceId, helpful, correctedAnswer, note, tags });
      res.json({ ok: true, ...out });
    })
  );

  app.get(
    "/chat/learning/status",
    asyncHandler(async (_req, res) => {
      const out = getMlLearningStatus();
      res.json({ ok: true, ...out });
    })
  );

  app.get(
    "/chat/learning/tool-choice-stats",
    asyncHandler(async (req, res) => {
      const limit = Number(req.query.limit || 200);
      const out = getToolChoiceSourceStats({ limit });
      res.json({ ok: true, ...out });
    })
  );

  app.get(
    "/jobs/quality/dod-check",
    asyncHandler(async (_req, res) => {
      const out = await runDodChecks();
      res.json({ ok: true, ...out });
    })
  );

  app.get(
    "/jobs/quality/evolution-checklist",
    asyncHandler(async (_req, res) => {
      const out = await getControlledEvolutionChecklist();
      res.json({ ok: true, ...out });
    })
  );

  app.post(
    "/jobs/quality/dod-snapshot",
    asyncHandler(async (req, res) => {
      const releaseTag = String(req.body?.releaseTag || "");
      const out = await writeDodSnapshot({
        releaseTag,
        trigger: "manual_endpoint"
      });
      res.json(out);
    })
  );

  app.get(
    "/jobs/quality/dod-history",
    asyncHandler(async (req, res) => {
      const limit = Number(req.query.limit || 30);
      const out = getDodHistory({ limit });
      res.json(out);
    })
  );

  app.locals.routesReady = true;

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Not found" });
  });

  app.use(apiErrorHandler);
}
