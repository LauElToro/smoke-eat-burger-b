import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../utils/config";
import { pool } from "../db";

declare global {
  namespace Express {
    interface UserPayload {
      id: string;
      role: "user" | "admin";
    }
    interface Request {
      user?: UserPayload;
    }
  }
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: "unauthorized" });

    const decoded = jwt.verify(token, config.jwt.secret) as Express.UserPayload;
    if (!decoded?.id) return res.status(401).json({ error: "unauthorized" });

    // opcional: verificar que el user exista y siga activo
    const [rows] = await pool.query(
      "SELECT id, role FROM users WHERE id = ? LIMIT 1",
      [decoded.id]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const row = rows[0] as any;
    req.user = { id: row.id, role: row.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: "unauthorized" });
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "forbidden" });
}
