import request from "supertest";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import app from "../app.js";
import { resetDb } from "./setup.js";
import { q, pool } from "../db/index.js";
import { signJwt } from "../utils/auth.js";

async function getVerificationTokenByEmail(email: string): Promise<string | null> {
  const rows = await q<any>(
    "SELECT evt.token FROM email_verification_tokens evt JOIN users u ON u.id = evt.user_id WHERE u.email = ? ORDER BY evt.created_at DESC LIMIT 1",
    [email]
  );
  return rows[0]?.token ?? null;
}

async function getUserByEmail(email: string) {
  const rows = await q<any>("SELECT * FROM users WHERE email = ?", [email]);
  return rows[0] || null;
}

describe("E2E Smoke Eat Backend", () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("registro → no permite login sin verificar → verifica email → login ok", async () => {
    // Registro
    const reg = await request(app)
      .post("/auth/register")
      .send({ email: "user1@test.com", password: "secret123", confirmPassword: "secret123" })
      .expect(201);
    expect(reg.body).toMatchObject({ ok: true });

    // Intento de login (debe fallar por no verificado)
    const badLogin = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(400);
    expect(badLogin.body.error).toBe("email_unverified");

    // Buscar token y verificar
    const token = await getVerificationTokenByEmail("user1@test.com");
    expect(token).toBeTruthy();

    await request(app)
      .get("/auth/verify-email")
      .query({ token })
      .expect(200);

    // Login OK
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);
    expect(login.body).toHaveProperty("token");

    // /users/me
    const me = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(me.body.user.email).toBe("user1@test.com");
    expect(me.body.user.points).toBe(0);
    expect(me.body.user).toHaveProperty("referralCode");
  });

  it("compra suma puntos y respeta resto (cada $10.000 = 100 pts)", async () => {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);
    const token = login.body.token;

    // Compra 25.100 => bloques 2 (20.000) = 200 pts, remainder 5.100
    const earn = await request(app)
      .post("/rewards/earn/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 25100 })
      .expect(200);

    expect(earn.body.ok).toBe(true);
    expect(earn.body.earned).toBe(200);
    expect(earn.body.spendRemainder).toBe(5100);

    // Estado
    const me = await request(app)
      .get("/rewards/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(me.body.points).toBe(200);
    expect(me.body.spendRemainder).toBe(5100);
    expect(Array.isArray(me.body.history)).toBe(true);
  });

  it("referido: al registrar con referralCode y hacer su primera compra, el referidor gana 50 pts", async () => {
    // Obtener referralCode de user1
    const u1 = await getUserByEmail("user1@test.com");
    expect(u1?.referral_code).toBeTruthy();

    // Registrar user2 con código
    await request(app)
      .post("/auth/register")
      .send({ email: "user2@test.com", password: "secret123", confirmPassword: "secret123", referralCode: u1.referral_code })
      .expect(201);

    const token2 = await getVerificationTokenByEmail("user2@test.com");
    expect(token2).toBeTruthy();
    await request(app).get("/auth/verify-email").query({ token: token2 }).expect(200);

    const login2 = await request(app)
      .post("/auth/login")
      .send({ email: "user2@test.com", password: "secret123" })
      .expect(200);

    // Primera compra de user2: dispara bonus al referidor (user1)
    await request(app)
      .post("/rewards/earn/purchase")
      .set("Authorization", `Bearer ${login2.body.token}`)
      .send({ amount: 15000 }) // 100 pts a user2, 50 pts a user1 por referido
      .expect(200);

    // Estado de user1: 200 (previo) + 50 bonus = 250
    const login1 = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);

    const me1 = await request(app)
      .get("/rewards/me")
      .set("Authorization", `Bearer ${login1.body.token}`)
      .expect(200);

    expect(me1.body.points).toBe(250);
    // user2 tiene 100 por su compra
    const me2 = await request(app)
      .get("/rewards/me")
      .set("Authorization", `Bearer ${login2.body.token}`)
      .expect(200);
    expect(me2.body.points).toBe(100);
  });

  it("canje: falla sin puntos suficientes, luego éxito, genera voucher y descuenta puntos", async () => {
    const login1 = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);
    const t1 = login1.body.token;

    // Intentar canje caro: debería fallar
    const badRedeem = await request(app)
      .post("/rewards/redeem")
      .set("Authorization", `Bearer ${t1}`)
      .send({ tierCode: "ANY_COMBO_PLUS_SIDE" }) // 2600 pts
      .expect(400);
    expect(badRedeem.body.error).toBe("insufficient_points");

    // Canje accesible con 250 pts: "SIDE" (400) aún no alcanza → sumemos puntos
    // Sumamos una compra de 15.000 => +100 pts (total 350)
    await request(app)
      .post("/rewards/earn/purchase")
      .set("Authorization", `Bearer ${t1}`)
      .send({ amount: 15000 })
      .expect(200);

    // Otra compra de 5.000 no da bloque; otra de 5.000 suma 100 (total 450)
    await request(app)
      .post("/rewards/earn/purchase")
      .set("Authorization", `Bearer ${t1}`)
      .send({ amount: 5000 })
      .expect(200);
    await request(app)
      .post("/rewards/earn/purchase")
      .set("Authorization", `Bearer ${t1}`)
      .send({ amount: 5000 })
      .expect(200);

    const meBefore = await request(app)
      .get("/rewards/me")
      .set("Authorization", `Bearer ${t1}`)
      .expect(200);
    expect(meBefore.body.points).toBeGreaterThanOrEqual(400);

    const redeem = await request(app)
      .post("/rewards/redeem")
      .set("Authorization", `Bearer ${t1}`)
      .send({ tierCode: "SIDE" }) // 400 pts
      .expect(200);

    expect(redeem.body.ok).toBe(true);
    expect(redeem.body).toHaveProperty("voucherCode");

    const meAfter = await request(app)
      .get("/rewards/me")
      .set("Authorization", `Bearer ${t1}`)
      .expect(200);
    expect(meAfter.body.points).toBe(meBefore.body.points - 400);
    expect(meAfter.body.redemptions[0].status).toBe("PENDING");
  });

  it("admin: completar y cancelar redenciones", async () => {
    // Tomamos una redención pendiente de user1
    const login1 = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);
    const rlist = await request(app)
      .get("/rewards/redemptions")
      .set("Authorization", `Bearer ${login1.body.token}`)
      .expect(200);
    const pending = (rlist.body.redemptions || []).find((r: any) => r.status === "PENDING");
    expect(pending).toBeTruthy();

    // Admin JWT (no necesita existir en DB para pasar requireAdmin)
    const adminJwt = signJwt({ sub: "admin-id", role: "ADMIN" });

    // Completar
    await request(app)
      .post(`/rewards/admin/redemptions/${pending.id}/complete`)
      .set("Authorization", `Bearer ${adminJwt}`)
      .expect(200);

    // Intentar cancelar (ya está COMPLETED → invalid_state)
    await request(app)
      .post(`/rewards/admin/redemptions/${pending.id}/cancel`)
      .set("Authorization", `Bearer ${adminJwt}`)
      .expect(400);
  });
});
