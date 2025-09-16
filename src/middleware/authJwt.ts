import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Secret, JwtPayload } from "jsonwebtoken";
import type { RowDataPacket } from "mysql2/promise";
import { config } from "../config.js";
import { pool } from "../db.js";

type TokenPayload = JwtPayload & {
  sub?: string;
  role?: "user" | "admin";
};

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization || (req.headers.Authorization as any);
  if (!h || typeof h !== "string") return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ error: "unauthorized" });

  try {
    const decoded = jwt.verify(token, config.jwtSecret as Secret) as TokenPayload | string;

    if (typeof decoded === "string") {
      return res.status(401).json({ error: "unauthorized" });
    }

    const userId = typeof decoded.sub === "string" ? decoded.sub : undefined;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    (req as any).userId = userId;
    (req as any).userRole = decoded.role ?? "user";
    next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Autentica primero y luego chequea rol *en DB* (evita falsos 403 si el JWT no trae role)
  requireAuth(req, res, async () => {
    try {
      const userId = (req as any).userId as string;
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT role FROM users WHERE id = ? LIMIT 1",
        [userId]
      );
      if (rows.length === 0) return res.status(401).json({ error: "unauthorized" });

      const role = (rows[0] as any).role as string;
      if (role !== "admin") return res.status(403).json({ error: "forbidden" });

      (req as any).userRole = "admin";
      next();
    } catch {
      return res.status(500).json({ error: "internal_error" });
    }
  });
}
