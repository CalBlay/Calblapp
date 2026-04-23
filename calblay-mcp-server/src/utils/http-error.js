/** Error amb codi HTTP per al gestor central (`apiErrorHandler`). */
export class HttpError extends Error {
  /**
   * @param {number} status - 400, 404, 429, 500, …
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}
