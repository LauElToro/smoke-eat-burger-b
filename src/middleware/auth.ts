import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";


export type JwtUser = { id: string; role: "USER" | "ADMIN" };


export function requireAuth(req: Request, res: Response, next: NextFunction) {
const h = req.headers.authorization || "";
const token = h.startsWith("Bearer ") ? h.slice(7) : null;
if (!token) return res.status(401).json({ error: "missing token" });
try {
const payload = jwt.verify(token, config.jwtSecret) as JwtUser;
(req as any).user = payload;
next();
} catch {
return res.status(401).json({ error: "invalid token" });
}
}


export function requireRole(role: "ADMIN" | "USER") {
return (req: Request, res: Response, next: NextFunction) => {
const u = (req as any).user as JwtUser | undefined;
if (!u) return res.status(401).json({ error: "unauthorized" });
if (role === "USER") return next();
if (u.role === role) return next();
return res.status(403).json({ error: "forbidden" });
};
}