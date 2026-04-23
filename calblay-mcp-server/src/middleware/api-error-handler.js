import { HttpError } from "../utils/http-error.js";

export function apiErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const status =
    err instanceof HttpError
      ? err.status
      : Number(err.status || err.statusCode) || 500;
  const expose =
    String(process.env.MCP_EXPOSE_ERROR_MESSAGES || "").toLowerCase() === "1" ||
    String(process.env.MCP_EXPOSE_ERROR_MESSAGES || "").toLowerCase() === "true";
  let message = String(err.message || "Internal error");
  if (status >= 500 && process.env.NODE_ENV === "production" && !expose) {
    console.error("[apiErrorHandler]", req.method, req.path, err);
    message = "Internal error";
  } else if (status >= 500) {
    console.error("[apiErrorHandler]", req.method, req.path, err);
  }
  res.status(status).json({ ok: false, error: message });
}
