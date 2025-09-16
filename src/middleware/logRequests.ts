import type { Request, Response, NextFunction } from "express";

export function logRequests(req: Request, res: Response, next: NextFunction) {
  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    console.log(`[req] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
}

export function logErrors(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error("[error]", err?.message || err, err?.stack || "");
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_error" });
}