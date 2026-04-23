import "dotenv/config";
import cors from "cors";
import express from "express";

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection", reason);
});

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "calblay-mcp-server", at: new Date().toISOString() });
});

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`MCP server listening on ${host}:${port}`);
  console.log("Loading API routes (Firestore, finances, …)…");
  import("./routes.js")
    .then(({ registerRoutes }) => {
      registerRoutes(app);
      console.log("API routes registered.");
    })
    .catch((err) => {
      console.error("[fatal] Failed to register routes", err);
      process.exit(1);
    });
});
