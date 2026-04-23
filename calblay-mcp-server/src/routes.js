import { requireApiKey } from "./utils/auth.js";
import { chatWithTools } from "./services/ai-chat.service.js";
import { listFinanceCsvFiles, previewFinanceCsv } from "./services/finances.service.js";
import {
  buildEventSummary,
  getEventDetail,
  getEventFullByCode,
  getEvents
} from "./services/webapp.service.js";
import { refreshPowerBiDataset } from "./services/powerbi.service.js";
import { getPurchases, getSales, loginSap } from "./services/sap.service.js";

/**
 * Rutes amb dependències pesants (Firestore, etc.). Es carreguen després que el port
 * ja escolta, per complir el contracte de Cloud Run (startup probe).
 */
export function registerRoutes(app) {
  app.use(requireApiKey);

  app.get("/tools/get_events", async (req, res) => {
    try {
      const data = await getEvents(req.query);
      res.json({ ok: true, count: data.length, data });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/tools/get_event_by_code", async (req, res) => {
    try {
      const code = req.query.code;
      if (!code || String(code).trim() === "") {
        return res.status(400).json({ ok: false, error: "Missing code query param" });
      }
      const data = await getEventFullByCode(String(code));
      if (!data) {
        return res.status(404).json({ ok: false, error: "No esdeveniment amb aquest code" });
      }
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/tools/get_event_detail/:eventId", async (req, res) => {
    try {
      const data = await getEventDetail(req.params.eventId);
      if (!data) return res.status(404).json({ ok: false, error: "Event not found" });
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/tools/event_summary/:eventId", async (req, res) => {
    try {
      const data = await buildEventSummary(req.params.eventId);
      if (!data) return res.status(404).json({ ok: false, error: "Event not found" });
      res.json({ ok: true, data });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/jobs/refresh-powerbi", async (_req, res) => {
    try {
      const result = await refreshPowerBiDataset();
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/tools/sap/login", async (_req, res) => {
    try {
      const result = await loginSap();
      res.json({ ok: true, sessionId: result.sessionId, routeId: result.routeId });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/tools/sap/purchases", async (_req, res) => {
    try {
      const data = await getPurchases();
      res.json({ ok: true, count: Array.isArray(data) ? data.length : 0, data });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/tools/sap/sales", async (_req, res) => {
    try {
      const data = await getSales();
      res.json({ ok: true, count: Array.isArray(data) ? data.length : 0, data });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/tools/finances/list", async (_req, res) => {
    try {
      const files = await listFinanceCsvFiles();
      res.json({ ok: true, count: files.length, files });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/tools/finances/preview", async (req, res) => {
    try {
      const file = String(req.query.file || "");
      const rows = Number(req.query.rows || 20);
      const data = await previewFinanceCsv(file, rows);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/chat", async (req, res) => {
    try {
      const question = String(req.body?.question || "").trim();
      const language = String(req.body?.language || "ca");
      if (!question) {
        return res.status(400).json({ ok: false, error: "Missing question" });
      }
      const rich = Boolean(req.body?.rich);
      const result = await chatWithTools({ question, language, rich });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
}
