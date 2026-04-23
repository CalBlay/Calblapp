/** @type {Map<string, { start: number, count: number }>} */
const buckets = new Map();

/**
 * Límit in-memory per IP (req.ip). Sense dependències noves.
 * Desactiva amb CHAT_RATE_LIMIT_DISABLED=1.
 * CHAT_RATE_LIMIT_MAX (defecte 60), CHAT_RATE_LIMIT_WINDOW_MS (defecte 60000).
 */
export function chatRateLimit(req, res, next) {
  const off = String(process.env.CHAT_RATE_LIMIT_DISABLED || "").toLowerCase();
  if (off === "1" || off === "true" || off === "yes") {
    return next();
  }

  const windowMs = Math.max(1000, Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || 60_000));
  const max = Math.max(1, Number(process.env.CHAT_RATE_LIMIT_MAX || 60));

  const key = req.ip || "unknown";
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > max) {
    const retrySec = Math.ceil((windowMs - (now - b.start)) / 1000);
    res.set("Retry-After", String(Math.max(1, retrySec)));
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }
  next();
}
