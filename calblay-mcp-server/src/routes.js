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

/**
 * Rutes amb dependències pesants (Firestore, etc.). Es carreguen després que el port
 * ja escolta, per complir el contracte de Cloud Run (startup probe).
 */
export function registerRoutes(app) {
  app.use(requireApiKey);

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

  app.locals.routesReady = true;

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Not found" });
  });

  app.use(apiErrorHandler);
}
