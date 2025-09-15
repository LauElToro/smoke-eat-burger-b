import { Router } from "express";
import { q } from "../db";
import { hashPassword, verifyPassword } from "../utils/crypto";
import { signJwt } from "../services/tokenService";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { sendMail } from "../utils/email";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import { config } from "../config";

const router = Router();

function genReferralCode() {
  return crypto.randomBytes(4).toString("hex");
}

/* -------------------- REGISTER -------------------- */
const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    referralCode: z.string().optional(),
  }),
});

router.post("/register", validate(registerSchema), async (req, res) => {
  const { email, password, referralCode } = req.body as {
    email: string;
    password: string;
    referralCode?: string;
  };

  const existing = await q<{ id: string }>(
    "SELECT id FROM users WHERE email = ?",
    [email]
  );
  if (existing.length) return res.status(409).json({ error: "email_in_use" });

  const passwordHash = await hashPassword(password);

  let referredById: string | null = null;
  if (referralCode) {
    const ref = await q<{ id: string }>(
      "SELECT id FROM users WHERE referral_code = ?",
      [referralCode]
    );
    referredById = ref[0]?.id || null;
  }

  // referral_code único (hasta 5 intentos)
  let myRef = genReferralCode();
  for (let i = 0; i < 5; i++) {
    const clash = await q("SELECT 1 FROM users WHERE referral_code = ?", [
      myRef,
    ]);
    if (!clash.length) break;
    myRef = genReferralCode();
  }

  const id = uuid();
  await q(
    "INSERT INTO users (id, email, password_hash, role, points, spend_remainder, referral_code, referred_by_id) VALUES (?,?,?,?,?,?,?,?)",
    [id, email, passwordHash, "USER", 0, 0, myRef, referredById]
  );

  const token = signJwt({ id, role: "USER" as const });
  return res.json({
    user: { id, email, role: "USER" as const, referralCode: myRef },
    token,
  });
});

/* -------------------- LOGIN -------------------- */
const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const rows = await q<{
    id: string;
    email: string;
    password_hash: string;
    role: "USER" | "ADMIN";
    referral_code: string;
  }>(
    "SELECT id,email,password_hash,role,referral_code FROM users WHERE email = ?",
    [email]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  const token = signJwt({ id: user.id, role: user.role });
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      referralCode: user.referral_code,
    },
  });
});

/* -------------------- RECOVER -------------------- */
const recoverSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

router.post("/recover", validate(recoverSchema), async (req, res) => {
  const { email } = req.body as { email: string };

  const usr = await q<{ id: string; email: string }>(
    "SELECT id,email FROM users WHERE email = ?",
    [email]
  );

  // Responder 200 aunque no exista, para no filtrar validez de correos
  if (!usr.length) return res.json({ ok: true });

  const token = crypto.randomBytes(20).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60); // 1h

  await q(
    "INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?,?,?,?)",
    [uuid(), usr[0].id, token, expires]
  );

  const link = `${config.baseUrl}/auth/reset?token=${token}`;
  await sendMail(
    email,
    "Recuperar contraseña",
    `<p>Para resetear tu contraseña, hacé click: <a href="${link}">${link}</a></p>`
  );

  return res.json({ ok: true });
});

/* -------------------- RESET -------------------- */
const resetSchema = z.object({
  body: z.object({
    token: z.string(),
    newPassword: z.string().min(6),
  }),
});

router.post("/reset", validate(resetSchema), async (req, res) => {
  const { token, newPassword } = req.body as {
    token: string;
    newPassword: string;
  };

  const rows = await q<{
    id: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>(
    "SELECT id,user_id,expires_at,used_at FROM password_reset_tokens WHERE token = ?",
    [token]
  );

  const rec = rows[0];
  if (!rec) return res.status(400).json({ error: "invalid_or_expired" });
  if (rec.used_at) return res.status(400).json({ error: "invalid_or_expired" });
  if (new Date(rec.expires_at) < new Date())
    return res.status(400).json({ error: "invalid_or_expired" });

  const hash = await hashPassword(newPassword);
  await q("UPDATE users SET password_hash = ? WHERE id = ?", [
    hash,
    rec.user_id,
  ]);
  await q("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?", [
    rec.id,
  ]);

  return res.json({ ok: true });
});

export default router;
