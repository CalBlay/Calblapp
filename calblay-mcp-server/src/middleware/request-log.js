/**
 * Log mínim per operació (Cloud Run / logs estructurats).
 */
export function requestLog(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const path = req.originalUrl || req.url || "";
    console.log(`[http] ${req.method} ${path} ${res.statusCode} ${ms}ms`);
  });
  next();
}
