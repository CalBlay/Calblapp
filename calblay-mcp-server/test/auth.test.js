import test from "node:test";
import assert from "node:assert/strict";
import { requireApiKey } from "../src/utils/auth.js";

function mockRes() {
  return {
    code: 200,
    body: null,
    status(n) {
      this.code = n;
      return this;
    },
    json(j) {
      this.body = j;
      return this;
    }
  };
}

test("requireApiKey: 500 si falta MCP_API_KEY", () => {
  const prev = process.env.MCP_API_KEY;
  delete process.env.MCP_API_KEY;
  const req = { headers: { "x-api-key": "x" } };
  const res = mockRes();
  requireApiKey(req, res, () => assert.fail("no hauria de passar next"));
  assert.strictEqual(res.code, 500);
  assert.strictEqual(res.body.ok, false);
  process.env.MCP_API_KEY = prev;
});

test("requireApiKey: 401 sense capçalera", async () => {
  process.env.MCP_API_KEY = "test-key-32-chars-minimum!!";
  const req = { headers: {} };
  const res = mockRes();
  requireApiKey(req, res, () => assert.fail("no hauria de passar next"));
  assert.strictEqual(res.code, 401);
  assert.strictEqual(res.body.ok, false);
});

test("requireApiKey: next amb X-Api-Key vàlida", async () => {
  const key = "k".repeat(24);
  process.env.MCP_API_KEY = key;
  const req = { headers: { "x-api-key": key } };
  const res = mockRes();
  let nexted = false;
  requireApiKey(req, res, () => {
    nexted = true;
  });
  assert.strictEqual(nexted, true);
});

test("requireApiKey: next amb Authorization Bearer", async () => {
  const key = "bearer-secret-key-12345";
  process.env.MCP_API_KEY = key;
  const req = { headers: { authorization: `Bearer ${key}` } };
  const res = mockRes();
  let nexted = false;
  requireApiKey(req, res, () => {
    nexted = true;
  });
  assert.strictEqual(nexted, true);
});
