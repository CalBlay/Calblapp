export function requireApiKey(req, res, next) {
  const expected = process.env.MCP_API_KEY;
  if (!expected) {
    return res.status(500).json({ error: "MCP_API_KEY is not configured" });
  }

  const provided = req.headers["x-api-key"];
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}
