/** Express 4: captura promeses rebutjades i les passa al pipeline d’errors (4 arguments). */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
