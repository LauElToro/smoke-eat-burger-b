import { Router, Request, Response } from "express";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/authJwt.js";

export const rewardsRouter = Router();

/**
 * REGLA DE CONVERSIÓN
 * $10.000 => 600 pts  =>  0.06 pts / peso  =>  0.0006 pts / centavo
 * Usamos micro-puntos (1 punto = 10.000 micro) para evitar coma flotante:
 *   micro por centavo = (POINTS_PER_10K / 10.000 pesos) * (1 peso / 100 centavos) * 10.000 micro/pto
 *                     = POINTS_PER_10K / 100
 * Con 600 => 6 micro por centavo.
 */
const POINTS_PER_10K = Number(process.env.POINTS_PER_10K || 600); // 👈 default 600
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS || 50);

const MICRO_DEN = 10_000;                     // 10.000 micro = 1 punto
const MICRO_PER_CENT = Math.round(POINTS_PER_10K / 100); // 600/100 = 6
const CENTS_PER_10K_PESOS = 10_000 * 100;     // $10.000 en centavos (1.000.000)

/** Catálogo mínimo para el test */
type Reward = { code: string; name: string; cost: number; description?: string; meta?: any };

export const REWARDS: Reward[] = [
  /* ====== SIDES ====== */
  {
    code: "SIDE_BASIC",
    name: "Guarnición básica",
    cost: 800,
    description: "Elegí Papas clásicas o Papas chips.",
    meta: {
      type: "side",
      allowedIds: ["papas-clasicas", "papas-chips"],
    },
  },
  {
    code: "SIDE_PREMIUM",
    name: "Guarnición premium",
    cost: 1200,
    description: "Papas con cheddar o Nuggets x6.",
    meta: {
      type: "side",
      allowedIds: ["papas-con-cheddar", "Nuggets"],
    },
  },

  /* ====== KIDS ====== */
  {
    code: "KIDS_BURGER",
    name: "Menú Infantil (burger)",
    cost: 1000,
    description: "Cheeseburger simple + papas chips.",
    meta: { type: "kids", allowedIds: ["kids-cheese"] },
  },
  {
    code: "KIDS_NUGGETS",
    name: "Menú Infantil (nuggets)",
    cost: 1400,
    description: "Nuggets x6 + papas chips.",
    meta: { type: "kids", allowedIds: ["kids-nuggets"] },
  },

  /* ====== COMBOS GENERALES (incluyen papas) ====== */
  {
    code: "COMBO_SIMPLE_ANY",
    name: "Combo Simple (cualquiera)",
    cost: 1600,
    description: "Cualquier burger simple con papas.",
    meta: {
      type: "combo",
      patties: 1,
      allowedIds: [
        "cheese-simple",
        "doblecheese-simple",
        "spacy-simple",
        "especial-cuarto-libra",
      ],
    },
  },
  {
    code: "COMBO_DOUBLE_ANY",
    name: "Combo Doble (cualquiera)",
    cost: 2000,
    description: "Cualquier burger doble con papas.",
    meta: {
      type: "combo",
      patties: 2,
      allowedIds: [
        "cheese-doble",
        "doblecheese-doble",
        "spacy-doble",
        "especial-okhaoma",
        "especial-mega-bacone",
      ],
    },
  },
  {
    code: "COMBO_TRIPLE_ANY",
    name: "Combo Triple (cualquiera)",
    cost: 2400,
    description: "Cualquier burger triple con papas.",
    meta: {
      type: "combo",
      patties: 3,
      allowedIds: ["cheese-triple", "doblecheese-triple", "spacy-triple"],
    },
  },

  /* ====== COMBOS + EXTRA ====== */
  {
    code: "COMBO_ANY_PLUS_SIDE",
    name: "Combo + Guarnición",
    cost: 2600,
    description: "Cualquier combo más una guarnición básica.",
    meta: { type: "bundle", side: "basic" },
  },

  /* ====== ESPECIALES PUNTUALES ====== */
  {
    code: "SPECIAL_OKHAOMA_COMBO",
    name: "Okhaoma (combo)",
    cost: 2200,
    description: "Doble con cebolla a la parrilla + papas.",
    meta: { type: "special", allowedIds: ["especial-okhaoma"] },
  },
  {
    code: "SPECIAL_MEGA_BACONE_COMBO",
    name: "Mega Bacone (combo)",
    cost: 2300,
    description: "Doble con bacon crocante + papas.",
    meta: { type: "special", allowedIds: ["especial-mega-bacone"] },
  },
  {
    code: "SPECIAL_QUARTER_LIBRA_COMBO",
    name: "1/4 de libra (combo)",
    cost: 1800,
    description: "Homenaje 1/4 lb + papas.",
    meta: { type: "special", allowedIds: ["especial-cuarto-libra"] },
  },
];

const getReward = (code: string) => REWARDS.find((r) => r.code === code);

/* ============================
   POST /rewards/purchase
   ============================ */
rewardsRouter.post("/purchase", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const totalCents = Number(req.body?.totalCents || 0);
  const idemp = (req.body?.idempotencyKey || "").toString().slice(0, 64);
  const paymentMethod = (req.body?.paymentMethod || "").toString(); // opcional, para auditar

  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    return res.status(400).json({ error: "invalid_total" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Idempotencia (si mandás idempotencyKey)
    if (idemp) {
      const [dup] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS c
           FROM reward_events
          WHERE user_id = ?
            AND kind = 'purchase'
            AND JSON_EXTRACT(meta, '$.idempotencyKey') = ?`,
        [userId, idemp]
      );
      if (Number((dup[0] as any).c || 0) > 0) {
        await conn.rollback();
        return res.status(200).json({ ok: true, duplicate: true });
      }
    }

    // Tomamos usuario con lock
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, points,
              points_remainder_cents,         -- resto de gasto hacia $10.000 (para UI)
              points_micro_remainder,         -- resto de micro-puntos (para precisión)
              referred_by_id
         FROM users
        WHERE id = ?
        FOR UPDATE`,
      [userId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "user_not_found" });
    }
    const u: any = rows[0];

    // === Precisión de puntos (micro) ===
    // Fallback: si no existe la columna, aproximamos desde remainder_cents.
    const microCarryExisting =
      u.points_micro_remainder != null
        ? Number(u.points_micro_remainder)
        : Math.max(0, Math.floor(Number(u.points_remainder_cents || 0) * (POINTS_PER_10K / 100)));

    const rawMicro = microCarryExisting + totalCents * MICRO_PER_CENT; // entero
    const gainedPoints = Math.floor(rawMicro / MICRO_DEN);
    const microAfter = rawMicro % MICRO_DEN;

    // === Resto de gasto hacia los próximos $10.000 (para “progreso”) ===
    const spendCarryBefore = Math.max(0, Number(u.points_remainder_cents || 0));
    const spendCarryAfter = (spendCarryBefore + totalCents) % CENTS_PER_10K_PESOS;

    // Actualizamos usuario
    await conn.query<ResultSetHeader>(
      `UPDATE users
          SET points = points + ?,
              points_micro_remainder = ?,        -- precisión puntos
              points_remainder_cents = ?,        -- progreso $10.000
              updated_at = NOW()
        WHERE id = ?`,
      [gainedPoints, microAfter, spendCarryAfter, userId]
    );

    // Registramos evento
    await conn.query<ResultSetHeader>(
      `INSERT INTO reward_events (id, user_id, kind, points, meta, created_at)
       VALUES (UUID(), ?, 'purchase', ?, JSON_OBJECT(
         'totalCents', ?, 
         'pointsPer10k', ?, 
         'microPerCent', ?, 
         'microBefore', ?, 
         'microAfter', ?, 
         'spendCarryBefore', ?, 
         'spendCarryAfter', ?, 
         'paymentMethod', ?, 
         'idempotencyKey', ?
       ), NOW())`,
      [
        userId,
        gainedPoints,
        totalCents,
        POINTS_PER_10K,
        MICRO_PER_CENT,
        microCarryExisting,
        microAfter,
        spendCarryBefore,
        spendCarryAfter,
        paymentMethod || null,
        idemp || null,
      ]
    );

    // Bono de referido en la 1ª compra del referido
    if (u.referred_by_id) {
      const [pc] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS c FROM reward_events WHERE user_id = ? AND kind = 'purchase'",
        [userId]
      );
      const purchasesSoFar = Number((pc[0] as any).c || 0);
      if (purchasesSoFar === 1) {
        await conn.query<ResultSetHeader>(
          "UPDATE users SET points = points + ?, updated_at = NOW() WHERE id = ?",
          [REFERRAL_BONUS, u.referred_by_id]
        );
        await conn.query<ResultSetHeader>(
          `INSERT INTO reward_events (id, user_id, kind, points, meta, created_at)
           VALUES (UUID(), ?, 'referral_bonus', ?, JSON_OBJECT('referredUserId', ?), NOW())`,
          [u.referred_by_id, REFERRAL_BONUS, userId]
        );
      }
    }

    await conn.commit();
    return res.status(200).json({
      ok: true,
      pointsAwarded: gainedPoints,               // p.ej. $3.950 => 237
      pointsMicroRemainderAfter: microAfter,     // para precisión futura
      remainderCents: spendCarryAfter,           // para “faltan $… para +600”
    });
  } catch (err) {
    await conn.rollback();
    console.error("[rewards/purchase] error", err);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    conn.release();
  }
});

/* ============================
   POST /rewards/redeem
   ============================ */
rewardsRouter.post("/redeem", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const rewardCode = String(req.body?.rewardCode || "");
  const reward = getReward(rewardCode);
  if (!reward) return res.status(400).json({ error: "invalid_reward" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT points FROM users WHERE id = ? FOR UPDATE",
      [userId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "user_not_found" });
    }
    const points = Number((rows[0] as any).points || 0);
    if (points < reward.cost) {
      await conn.rollback();
      return res.status(400).json({ error: "not_enough_points" });
    }

    const voucher =
      "SEB-" + Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const status = "PENDING" as const;

    await conn.query<ResultSetHeader>(
      "UPDATE users SET points = points - ?, updated_at = NOW() WHERE id = ?",
      [reward.cost, userId]
    );

    await conn.query<ResultSetHeader>(
      `INSERT INTO reward_events (id, user_id, kind, points, meta, created_at)
       VALUES (UUID(), ?, 'redeem', ?, JSON_OBJECT('rewardCode', ?), NOW())`,
      [userId, -reward.cost, reward.code]
    );

    await conn.query<ResultSetHeader>(
      `INSERT INTO reward_redemptions
        (id, user_id, reward_code, points_cost, status, voucher_code, created_at, updated_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, NOW(), NOW())`,
      [userId, reward.code, reward.cost, status, voucher]
    );

    await conn.commit();
    return res.status(200).json({
      ok: true,
      voucherCode: voucher,
      status,
      reward: { code: reward.code, name: reward.name, cost: reward.cost },
    });
  } catch (err) {
    await conn.rollback();
    console.error("[rewards/redeem] error", err);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    conn.release();
  }
});

/* ============================
   GET /rewards/catalog
   ============================ */
rewardsRouter.get("/catalog", requireAuth, async (_req: Request, res: Response) => {
  return res.status(200).json({ rewards: REWARDS });
});

/* ============================
   GET /rewards/redemptions (admin)
   ============================ */
rewardsRouter.get("/redemptions", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, user_id, reward_code, points_cost, status, voucher_code, created_at, updated_at " +
        "FROM reward_redemptions ORDER BY created_at DESC"
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("[rewards/redemptions] error", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default rewardsRouter;
