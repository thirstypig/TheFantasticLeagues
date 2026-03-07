import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async Express route handler to catch rejected promises
 * and forward them to the global error handler via next(err).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
