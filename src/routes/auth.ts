import { Router, Request, Response } from "express";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../db.js";
import { config } from "../config.js";
import { isValidEmail, isDisposableDomain } from "../utils/email.js";
import { sendVerificationEmail } from "../utils/mailer.js";
import { requireAuth } from "../middleware/authJwt.js";

export const authRouter = Router();

type UserRow = RowDataPacket & {
  id: string;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  points: number;
  points_remainder_cents: number;
  email_verified_at: Date | null;
  referral_code: string | null;
  referred_by_id: string | null;
};

function genReferralCode(): string {
  // 8 chars alfanum en mayúsculas
  return crypto.randomBytes(6).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
}

function genEmailToken(): string {
  // 64 hex chars
  return crypto.randomBytes(32).toString("hex");
}

function jwtSign(user: { id: string; role: "user" | "admin" }) {
  // types de jsonwebtoken a veces piden union 'number | StringValue'; casteamos seguro
  const expiresIn = ((process.env.JWT_EXPIRES_IN as any) || "7d") as jwt.SignOptions["expiresIn"];
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn });
}

// POST /auth/register
authRouter.post("/register", async (req: Request, res: Response) => {
  const { email, password, confirmPassword, referralCode } = req.body || {};

  if (!isValidEmail(String(email || ""))) {
    return res.status(400).json({ error: "invalid_email" });
  }
  if (isDisposableDomain(String(email))) {
    return res.status(400).json({ error: "disposable_email_not_allowed" });
  }
  if (typeof password !== "string" || password.length < 6 || password !== confirmPassword) {
    return res.status(400).json({ error: "invalid_password" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [exists] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    if (exists.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: "email_in_use" });
    }

    const [cntRows] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS c FROM users");
    const count = Number((cntRows[0] as any).c || 0);
    const role: "user" | "admin" = count === 0 ? "admin" : "user";

    let referredById: string | null = null;
    if (referralCode && typeof referralCode === "string") {
      const [refRows] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE referral_code = ? LIMIT 1",
        [referralCode.trim().toUpperCase()]
      );
      if (refRows.length > 0) {
        referredById = (refRows[0] as any).id as string;
      }
    }

    let myRef = genReferralCode();
    for (let i = 0; i < 5; i++) {
      const [dup] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE referral_code = ? LIMIT 1",
        [myRef]
      );
      if (dup.length === 0) break;
      myRef = genReferralCode();
    }

    const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 10));

    await conn.query<ResultSetHeader>(
      "INSERT INTO users (id, email, password_hash, role, points, points_remainder_cents, email_verified_at, referral_code, referred_by_id, created_at, updated_at) " +
        "VALUES (UUID(), ?, ?, ?, 0, 0, NULL, ?, ?, NOW(), NOW())",
      [email, hash, role, myRef, referredById]
    );

    const [urows] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    const userId = (urows[0] as any).id as string;

    const token = genEmailToken();
    await conn.query<ResultSetHeader>(
      "INSERT INTO email_verification_tokens (token, user_id, expires_at, used_at, created_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 48 HOUR), NULL, NOW())",
      [token, userId]
    );

    await conn.commit();

    try {
      await sendVerificationEmail(email, token);
    } catch (e) {
      console.warn("[sendVerificationEmail] warn:", e);
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    // 🔧 usar la misma conexión del beginTransaction
    await conn.rollback();
    console.error("[auth/register] fail:", err);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    conn.release();
  }
});

// GET /auth/verify-email?token=...
authRouter.get("/verify-email", async (req: Request, res: Response) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).json({ error: "invalid_token" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT evt.user_id, evt.expires_at, evt.used_at, u.email_verified_at " +
        "FROM email_verification_tokens evt " +
        "JOIN users u ON u.id = evt.user_id " +
        "WHERE evt.token = ? FOR UPDATE",
      [token]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: "invalid_token" });
    }

    const rec = rows[0] as any;
    if (rec.used_at) {
      await conn.rollback();
      return res.status(400).json({ error: "token_used" });
    }
    if (new Date(rec.expires_at).getTime() < Date.now()) {
      await conn.rollback();
      return res.status(400).json({ error: "token_expired" });
    }

    // marcar verificado
    await conn.query<ResultSetHeader>(
      "UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = ?",
      [rec.user_id]
    );
    await conn.query<ResultSetHeader>(
      "UPDATE email_verification_tokens SET used_at = NOW() WHERE token = ?",
      [token]
    );

    await conn.commit();
    return res.status(200).json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error("[auth/verify-email] fail:", err);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    conn.release();
  }
});

// POST /auth/login
authRouter.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(String(email || "")) || typeof password !== "string") {
    return res.status(400).json({ error: "invalid_credentials" });
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, email, password_hash, role, points, points_remainder_cents, email_verified_at, referral_code FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  if (rows.length === 0) return res.status(400).json({ error: "invalid_credentials" });

  const u = rows[0] as any as UserRow;
  if (!u.email_verified_at) {
    return res.status(400).json({ error: "email_not_verified" });
  }

  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(400).json({ error: "invalid_credentials" });

  const token = jwtSign({ id: u.id, role: u.role });

  return res.status(200).json({
    token,
    user: {
      id: u.id,
      email: u.email,
      role: u.role,
      points: u.points,
      // ambos nombres por compat
      spend_remainder: u.points_remainder_cents,
      pointsRemainderCents: u.points_remainder_cents,
      referral_code: u.referral_code,
    },
  });
});
// GET /auth/me
authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, email, role, points, points_remainder_cents, referral_code FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "user_not_found" });
  const u = rows[0] as any;

  return res.status(200).json({
    user: {
      id: u.id,
      email: u.email,
      role: u.role,
      points: u.points,
      // 👇 lo que esperan los tests
      spend_remainder: u.points_remainder_cents,
      // y mantenemos el actual para el frontend
      pointsRemainderCents: u.points_remainder_cents,
      referral_code: u.referral_code,
    },
  });
});

export default authRouter;
