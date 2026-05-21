import test from "node:test";
import assert from "node:assert/strict";
import { readCollectionDictionary } from "../src/services/collection-dictionary.service.js";

/**
 * Verifica la política d'accés per col·leccions futures (sense Firebase).
 * Replica la lògica de firestore.service isCollectionAllowedByEnv.
 */
function isCollectionAllowedByEnv(collectionName, env = process.env) {
  const parseCsvSet = (raw) =>
    new Set(
      String(raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
  const allowedRaw = String(env.FIRESTORE_QUERY_ALLOWED_COLLECTIONS || "*").trim();
  const blocked = parseCsvSet(env.FIRESTORE_QUERY_BLOCKED_COLLECTIONS || "");
  if (blocked.has(collectionName)) return { allowed: false, reason: "blocked_by_env" };
  if (allowedRaw === "*" || allowedRaw === "") return { allowed: true, reason: "wildcard_allow" };
  const allowedSet = parseCsvSet(allowedRaw);
  return allowedSet.has(collectionName)
    ? { allowed: true, reason: "allowlist" }
    : { allowed: false, reason: "not_in_allowlist" };
}

function inferDomainFromName(name) {
  const n = String(name || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (n.includes("incident") || n.includes("ticket") || n.includes("manten")) return "maintenance";
  if (n.includes("quadrant") || n.includes("personnel") || n.includes("personal")) return "operations";
  if (n.includes("transport") || n.includes("vehicle") || n.includes("logistic")) return "logistics";
  if (n.includes("channel") || n.includes("message")) return "messaging";
  if (n.includes("cuina") || n.includes("production")) return "food_safety";
  if (n.includes("allergen")) return "food_safety";
  if (n.includes("project")) return "projects";
  if (n.includes("finance") || n.includes("cost") || n.includes("venda") || n.includes("compra"))
    return "finance";
  if (n.includes("event") || n.startsWith("stage_")) return "events";
  return "unknown";
}

test("future collection: wildcard allow by default", () => {
  const prev = process.env.FIRESTORE_QUERY_ALLOWED_COLLECTIONS;
  delete process.env.FIRESTORE_QUERY_ALLOWED_COLLECTIONS;
  try {
    const out = isCollectionAllowedByEnv("myBrandNewModule_v2");
    assert.equal(out.allowed, true);
    assert.equal(out.reason, "wildcard_allow");
  } finally {
    if (prev !== undefined) process.env.FIRESTORE_QUERY_ALLOWED_COLLECTIONS = prev;
  }
});

test("future collection: blocked list denies access", () => {
  const prev = process.env.FIRESTORE_QUERY_BLOCKED_COLLECTIONS;
  process.env.FIRESTORE_QUERY_BLOCKED_COLLECTIONS = "secrets,internalAudit";
  try {
    assert.equal(isCollectionAllowedByEnv("secrets").allowed, false);
    assert.equal(isCollectionAllowedByEnv("channels").allowed, true);
  } finally {
    if (prev !== undefined) process.env.FIRESTORE_QUERY_BLOCKED_COLLECTIONS = prev;
    else delete process.env.FIRESTORE_QUERY_BLOCKED_COLLECTIONS;
  }
});

test("inferDomainFromName: heuristic for new module names", () => {
  assert.equal(inferDomainFromName("maintenanceTicketsOpen"), "maintenance");
  assert.equal(inferDomainFromName("projectsRooms"), "projects");
  assert.equal(inferDomainFromName("cuinaCentralProductionLogs"), "food_safety");
  assert.equal(inferDomainFromName("channels"), "messaging");
});

test("manual dictionary: undocumented collections are flagged for review", () => {
  const read = readCollectionDictionary();
  assert.equal(read.ok, true);
  const documented = new Set(Object.keys(read.dictionary?.collections || {}));
  assert.ok(!documented.has("hypotheticalFutureCollection_xyz"));
  assert.ok(documented.has("projects"));
});
