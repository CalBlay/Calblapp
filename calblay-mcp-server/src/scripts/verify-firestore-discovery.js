/**
 * Verificació del descobriment automàtic de col·leccions Firestore.
 * 1) Tests unitaris (sense Firebase)
 * 2) Si hi ha credencials Firebase + MCP en marxa, prova live
 *
 * Usage: node src/scripts/verify-firestore-discovery.js
 * Env opcional: MCP_SERVER_URL, MCP_API_KEY
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function loadEnvFiles() {
  const candidates = [
    path.join(projectRoot, ".env"),
    path.join(projectRoot, "..", ".env.local"),
    path.join(projectRoot, "..", ".env")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) dotenv.config({ path: p });
  }
}

loadEnvFiles();

function runUnitTests() {
  const testFile = path.join(projectRoot, "test", "firestore-discovery.test.js");
  const r = spawnSync(process.execPath, ["--test", testFile], {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status === 0;
}

async function liveCheck() {
  const base = String(process.env.MCP_SERVER_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
  const key = String(process.env.MCP_API_KEY || "").trim();
  if (!key) {
    console.log(
      "[live] SKIP: falta MCP_API_KEY (posa-la a calblay-mcp-server/.env o ../.env.local)"
    );
    return true;
  }
  console.log(`[live] MCP ${base} (clau present)`);

  const headers = { "x-api-key": key };
  const checks = [];

  try {
    const colRes = await fetch(`${base}/tools/firestore/collections`, { headers });
    const colBody = await colRes.json();
    checks.push({
      name: "list collections",
      ok: colRes.ok && Array.isArray(colBody?.data),
      detail: { status: colRes.status, count: colBody?.count }
    });

    const dictRes = await fetch(`${base}/tools/firestore/collection-dictionary?limit=500`, {
      headers
    });
    const dictBody = await dictRes.json();
    checks.push({
      name: "collection dictionary",
      ok: dictRes.ok && dictBody?.totalCollections != null,
      detail: {
        status: dictRes.status,
        total: dictBody?.totalCollections,
        needsReview: Array.isArray(dictBody?.rowsNeedingManualReview)
          ? dictBody.rowsNeedingManualReview.length
          : null
      }
    });

    const deltaRes = await fetch(`${base}/jobs/firestore/mapping-delta/run`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 500, sampleLimit: 6 })
    });
    const deltaBody = await deltaRes.json();
    checks.push({
      name: "mapping delta run",
      ok: deltaRes.ok && deltaBody?.ok === true,
      detail: {
        status: deltaRes.status,
        newCollections: deltaBody?.run?.newCollections || [],
        needsReview: Array.isArray(deltaBody?.run?.rowsNeedingManualReview)
          ? deltaBody.run.rowsNeedingManualReview.length
          : null
      }
    });
  } catch (e) {
    console.error("[live] FAIL:", e instanceof Error ? e.message : e);
    return false;
  }

  let allOk = true;
  for (const c of checks) {
    const mark = c.ok ? "OK" : "FAIL";
    console.log(`[live] ${mark} ${c.name}`, JSON.stringify(c.detail));
    if (!c.ok) allOk = false;
  }
  return allOk;
}

const unitOk = runUnitTests();
console.log(unitOk ? "[unit] OK" : "[unit] FAIL");

const liveOk = await liveCheck();
const exitCode = unitOk && liveOk ? 0 : 1;
process.exit(exitCode);
