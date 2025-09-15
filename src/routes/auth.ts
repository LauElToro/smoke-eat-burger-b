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
import { validateEmailForSignup } from "../utils/emailValidation";

const router = Router();

function genReferralCode() { return crypto.randomBytes(4).toString("hex"); }

/* ---------- REGISTER ---------- */
const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
    referralCode: z.string().optional(),
  }).refine((d) => d.password === d.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  }),
});

router.post("/register", validate(registerSchema), async (req, res) => {
  const { email, password, referralCode } = req.body as {
    email: string; password: string; confirmPassword: string; referralCode?: string;
  };

  // anti-disposable + MX
  const v = await validateEmailForSignup(email);
  if (!v.ok) return res.status(400).json({ error: v.reason });

  const existing = await q<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length) return res.status(409).json({ error: "email_in_use" });

  const passwordHash = await hashPassword(password);

  let referredById: string | null = null;
  if (referralCode) {
    const ref = await q<{ id: string }>("SELECT id FROM users WHERE referral_code = ?", [referralCode]);
    referredById = ref[0]?.id || null;
  }

  // referral_code único
  let myRef = genReferralCode();
  for (let i = 0; i < 5; i++) {
    const clash = await q("SELECT 1 FROM users WHERE referral_code = ?", [myRef]);
    if (!clash.length) break;
    myRef = genReferralCode();
  }

  const id = uuid();
  await q(
    "INSERT INTO users (id, email, password_hash, role, points, spend_remainder, referral_code, referred_by_id, email_verified_at) VALUES (?,?,?,?,?,?,?,?, NULL)",
    [id, email, passwordHash, "USER", 0, 0, myRef, referredById]
  );

  // token de verificación (24h)
  const vtoken = crypto.randomBytes(24).toString("hex");
  const vexp = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await q(
    "INSERT INTO email_verification_tokens (id, user_id, token, expires_at) VALUES (?,?,?,?)",
    [uuid(), id, vtoken, vexp]
  );

  const link = `${config.baseUrl.replace(/\/$/, "")}/verificar-email?token=${vtoken}`;
  await sendMail(
    email,
    "Verificá tu email",
    `<p>Confirmá tu cuenta haciendo click: <a href="${link}">${link}</a></p>`
  );

  return res.status(201).json({ ok: true, message: "verification_sent" });
});

/* ---------- LOGIN ---------- */
const loginSchema = z.object({ body: z.object({ email: z.string().email(), password: z.string() }) });

router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const rows = await q<{
    id: string; email: string; password_hash: string; role: "USER"|"ADMIN";
    referral_code: string; email_verified_at: string | null
  }>(
    "SELECT id,email,password_hash,role,referral_code,email_verified_at FROM users WHERE email = ?",
    [email]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  if (!user.email_verified_at) {
    return res.status(403).json({ error: "email_unverified" });
  }

  const token = signJwt({ id: user.id, role: user.role });
  return res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, referralCode: user.referral_code },
  });
});

/* ---------- VERIFY EMAIL ---------- */
router.get("/verify-email", async (req, res) => {
  const token = (req.query.token as string) || "";
  if (!token) return res.status(400).json({ error: "missing_token" });

  const rows = await q<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    "SELECT id,user_id,expires_at,used_at FROM email_verification_tokens WHERE token = ?",
    [token]
  );
  const rec = rows[0];
  if (!rec || rec.used_at || new Date(rec.expires_at) < new Date())
    return res.status(400).json({ error: "invalid_or_expired" });

  await q("UPDATE users SET email_verified_at = NOW() WHERE id = ?", [rec.user_id]);
  await q("UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?", [rec.id]);

  return res.json({ ok: true });
});

/* ---------- RESEND VERIFICATION ---------- */
const resendSchema = z.object({ body: z.object({ email: z.string().email() }) });

router.post("/resend-verification", validate(resendSchema), async (req, res) => {
  const { email } = req.body as { email: string };
  const users = await q<{ id: string; email_verified_at: string | null }>(
    "SELECT id,email_verified_at FROM users WHERE email = ?",
    [email]
  );
  const u = users[0];
  if (!u) return res.json({ ok: true });            // no delata si existe
  if (u.email_verified_at) return res.json({ ok: true });

  const vtoken = crypto.randomBytes(24).toString("hex");
  const vexp = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await q("INSERT INTO email_verification_tokens (id, user_id, token, expires_at) VALUES (?,?,?,?)",
    [uuid(), u.id, vtoken, vexp]
  );
  const link = `${config.baseUrl.replace(/\/$/, "")}/verificar-email?token=${vtoken}`;
  await sendMail(email, "Verificá tu email", `<p>Confirmá tu cuenta: <a href="${link}">${link}</a></p>`);
  return res.json({ ok: true });
});

/* ---------- RECOVER ---------- */
const recoverSchema = z.object({ body: z.object({ email: z.string().email() }) });

router.post("/recover", validate(recoverSchema), async (req, res) => {
  const { email } = req.body as { email: string };

  const usr = await q<{ id: string; email: string }>(
    "SELECT id,email FROM users WHERE email = ?",
    [email]
  );

  // Responde 200 aunque no exista
  if (!usr.length) return res.json({ ok: true });

  const token = crypto.randomBytes(20).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60); // 1h

  await q(
    "INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?,?,?,?)",
    [uuid(), usr[0].id, token, expires]
  );

  const link = `${config.baseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
  await sendMail(
    email,
    "Recuperar contraseña",
    `<p>Para resetear tu contraseña, hacé click: <a href="${link}">${link}</a></p>`
  );

  return res.json({ ok: true });
});

/* ---------- RESET ---------- */
const resetSchema = z.object({
  body: z.object({ token: z.string(), newPassword: z.string().min(6) }),
});

router.post("/reset", validate(resetSchema), async (req, res) => {
  const { token, newPassword } = req.body as { token: string; newPassword: string };

  const rows = await q<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    "SELECT id,user_id,expires_at,used_at FROM password_reset_tokens WHERE token = ?",
    [token]
  );
  const rec = rows[0];
  if (!rec || rec.used_at || new Date(rec.expires_at) < new Date())
    return res.status(400).json({ error: "invalid_or_expired" });

  const hash = await hashPassword(newPassword);
  await q("UPDATE users SET password_hash = ? WHERE id = ?", [hash, rec.user_id]);
  await q("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?", [rec.id]);

  return res.json({ ok: true });
});

export default router;
