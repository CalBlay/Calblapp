import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDodChecks } from "./quality-gates.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function historyPath() {
  const fromEnv = String(process.env.QUALITY_HISTORY_PATH || "").trim();
  if (fromEnv) return fromEnv;
  return path.join(projectRoot, "data", "quality-history.jsonl");
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function appendJsonl(filePath, payload) {
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export async function writeDodSnapshot({ releaseTag = "", trigger = "manual" } = {}) {
  const dod = await runDodChecks();
  const snapshot = {
    kind: "dod_snapshot",
    at: new Date().toISOString(),
    trigger,
    releaseTag: String(releaseTag || "").trim() || null,
    passed: Boolean(dod.passed),
    checks: dod.checks
  };
  const p = historyPath();
  appendJsonl(p, snapshot);
  return {
    ok: true,
    path: p,
    snapshot
  };
}

export function getDodHistory({ limit = 30 } = {}) {
  const p = historyPath();
  const cap = Math.min(Math.max(Number(limit) || 30, 1), 500);
  try {
    const raw = fs.readFileSync(p, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const entries = lines
      .map(parseJsonLine)
      .filter((v) => v && typeof v === "object" && v.kind === "dod_snapshot")
      .slice(-cap);
    return {
      ok: true,
      path: p,
      count: entries.length,
      entries
    };
  } catch {
    return {
      ok: true,
      path: p,
      count: 0,
      entries: []
    };
  }
}

