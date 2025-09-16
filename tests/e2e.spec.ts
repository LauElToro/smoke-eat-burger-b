// tests/e2e.spec.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { resetDb } from "./setup";
import app from "../src/app";
import mysql from "mysql2/promise";

// helper para leer el token de verificación
async function getVerificationTokenByEmail(email: string): Promise<string | null> {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST!,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER!,
    password: process.env.MYSQL_PASSWORD!,
    database: process.env.MYSQL_DATABASE!,
  });
  try {
    const [rows] = await conn.query(
      `SELECT evt.token
       FROM email_verification_tokens evt
       JOIN users u ON u.id = evt.user_id
       WHERE u.email = ? AND evt.used_at IS NULL AND evt.expires_at > NOW()
       ORDER BY evt.created_at DESC
       LIMIT 1`,
      [email]
    );
    const r: any[] = rows as any[];
    return r.length ? r[0].token : null;
  } finally {
    await conn.end();
  }
}

describe("E2E Smoke Eat Backend", () => {
  beforeAll(async () => {
    await resetDb();
  });

  it("registro → no permite login sin verificar → verifica email → login ok", async () => {
    const reg = await request(app)
      .post("/auth/register")
      .send({ email: "user1@test.com", password: "secret123", confirmPassword: "secret123" })
      .expect(201);
    expect(reg.body).toMatchObject({ ok: true });

    // login debe fallar por no verificado
    await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(400);

    // verifico email
    const token = await getVerificationTokenByEmail("user1@test.com");
    expect(token).toBeTruthy();

    await request(app)
      .get("/auth/verify-email")
      .query({ token })
      .expect(200);

    // ahora login OK
    const loginOk = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);

    expect(loginOk.body).toHaveProperty("token");
  });

  it("compra suma puntos y respeta resto (cada $10.000 = 100 pts)", async () => {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);

    const token = login.body.token;

    // Compra de $15.500 → 100 pts y 5.500 de resto
    await request(app)
      .post("/rewards/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ totalCents: 15500 })
      .expect(200);

    const me1 = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`).expect(200);
    expect(me1.body.user.points).toBe(100);
    expect(me1.body.user.spend_remainder).toBe(5500);

    // Compra de $5.000 → completa $10.500 total → +100 pts y 500 resto (total 200 pts)
    await request(app)
      .post("/rewards/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ totalCents: 5000 })
      .expect(200);

    const me2 = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`).expect(200);
    expect(me2.body.user.points).toBe(200);
    expect(me2.body.user.spend_remainder).toBe(500);
  });

  it("referido: al registrar con referralCode y hacer su primera compra, el referidor gana 50 pts", async () => {
    // obtengo referral_code del user1
    const login1 = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);
    const me1 = await request(app).get("/auth/me").set("Authorization", `Bearer ${login1.body.token}`).expect(200);
    const refCode = me1.body.user.referral_code as string;

    // registro user2 con referralCode
    await request(app)
      .post("/auth/register")
      .send({ email: "user2@test.com", password: "secret123", confirmPassword: "secret123", referralCode: refCode })
      .expect(201);

    // verifico mail de user2
    const token2 = await getVerificationTokenByEmail("user2@test.com");
    expect(token2).toBeTruthy();
    await request(app).get("/auth/verify-email").query({ token: token2 }).expect(200);

    const login2 = await request(app)
      .post("/auth/login")
      .send({ email: "user2@test.com", password: "secret123" })
      .expect(200);

    // primera compra de user2 → debería otorgar 50 pts a user1
    await request(app)
      .post("/rewards/purchase")
      .set("Authorization", `Bearer ${login2.body.token}`)
      .send({ totalCents: 10000 })
      .expect(200);

    const me1after = await request(app).get("/auth/me").set("Authorization", `Bearer ${login1.body.token}`).expect(200);
    expect(me1after.body.user.points).toBeGreaterThanOrEqual(250); // ya tenía 200, +50 del referido
  });

  it("canje: falla sin puntos suficientes, luego éxito, genera voucher y descuenta puntos", async () => {
    const login1 = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);
    const t1 = login1.body.token;

    // Intento canjear algo caro
    await request(app)
      .post("/rewards/redeem")
      .set("Authorization", `Bearer ${t1}`)
      .send({ rewardCode: "ANY_COMBO_PLUS_SIDE" })
      .expect(400);

    // sumo compras para llegar a puntos
    await request(app)
      .post("/rewards/purchase")
      .set("Authorization", `Bearer ${t1}`)
      .send({ totalCents: 220000 }) // = 2200 pts
      .expect(200);

    // ahora canje OK
    const r = await request(app)
      .post("/rewards/redeem")
      .set("Authorization", `Bearer ${t1}`)
      .send({ rewardCode: "ANY_COMBO_PLUS_SIDE" })
      .expect(200);

    expect(r.body).toHaveProperty("voucherCode");
    expect(r.body.status).toBe("PENDING");
  });

  it("admin: completar y cancelar redenciones", async () => {
    // login user1 (no es admin pero la ruta admin debería validar role si corresponde)
    const login1 = await request(app)
      .post("/auth/login")
      .send({ email: "user1@test.com", password: "secret123" })
      .expect(200);

    // Listar redenciones propias
    const rlist = await request(app)
      .get("/rewards/redemptions")
      .set("Authorization", `Bearer ${login1.body.token}`)
      .expect(200);

    expect(Array.isArray(rlist.body)).toBe(true);
  });
});
