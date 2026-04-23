import crypto from "node:crypto";

function extractApiKey(req) {
  const raw = req.headers["x-api-key"];
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.trim();
  }
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t !== "") return t;
  }
  return null;
}

/**
 * API key via `X-Api-Key` o `Authorization: Bearer <key>`.
 * Comparació amb timingSafeEqual per evitar fuites per temps.
 */
export function requireApiKey(req, res, next) {
  const expected = process.env.MCP_API_KEY;
  if (!expected || String(expected).trim() === "") {
    return res.status(500).json({ ok: false, error: "MCP_API_KEY is not configured" });
  }

  const provided = extractApiKey(req);
  if (!provided) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  return next();
}
