import "dotenv/config";
import cors from "cors";
import express from "express";
import { requireApiKey } from "./utils/auth.js";
import {
  buildEventSummary,
  getEventDetail,
  getEventFullByCode,
  getEvents
} from "./services/webapp.service.js";
import { refreshPowerBiDataset } from "./services/powerbi.service.js";
import { getPurchases, getSales, loginSap } from "./services/sap.service.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "calblay-mcp-server", at: new Date().toISOString() });
});

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

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`MCP server listening on :${port}`);
});
