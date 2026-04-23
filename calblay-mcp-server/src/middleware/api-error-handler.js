import { HttpError } from "../utils/http-error.js";

export function apiErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const status =
    err instanceof HttpError
      ? err.status
      : Number(err.status || err.statusCode) || 500;
  let message = String(err.message || "Internal error");
  if (status >= 500 && process.env.NODE_ENV === "production") {
    message = "Internal error";
  }
  res.status(status).json({ ok: false, error: message });
}
