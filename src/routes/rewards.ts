import { Router, Request, Response } from "express";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/authJwt.js";

export const rewardsRouter = Router();

const POINTS_PER_10K = Number(process.env.POINTS_PER_10K || 100);
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS || 50);

// Catálogo mínimo para el test
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
        "especial-okhaoma", // es doble
        "especial-mega-bacone", // es doble
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

// POST /rewards/purchase
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

    // idempotencia (si mandás idempotencyKey)
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

    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT id, points, points_remainder_cents, referred_by_id FROM users WHERE id = ? FOR UPDATE",
      [userId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "user_not_found" });
    }
    const u = rows[0] as any;

    const carry = Number(u.points_remainder_cents || 0);
    const available = carry + totalCents;
    const blocks = Math.floor(available / 10000);
    const gainedPoints = blocks * POINTS_PER_10K;
    const newRemainder = available % 10000;

    await conn.query<ResultSetHeader>(
      "UPDATE users SET points = points + ?, points_remainder_cents = ?, updated_at = NOW() WHERE id = ?",
      [gainedPoints, newRemainder, userId]
    );

    await conn.query<ResultSetHeader>(
      "INSERT INTO reward_events (id, user_id, kind, points, meta, created_at) " +
        "VALUES (UUID(), ?, 'purchase', ?, JSON_OBJECT('totalCents', ?, 'blocks', ?, 'carryBefore', ?, 'paymentMethod', ?, 'idempotencyKey', ?), NOW())",
      [userId, gainedPoints, totalCents, blocks, carry, paymentMethod || null, idemp || null]
    );

    // bono de referido en la primera compra del referido
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
          "INSERT INTO reward_events (id, user_id, kind, points, meta, created_at) " +
            "VALUES (UUID(), ?, 'referral_bonus', ?, JSON_OBJECT('referredUserId', ?), NOW())",
          [u.referred_by_id, REFERRAL_BONUS, userId]
        );
      }
    }

    await conn.commit();
    return res.status(200).json({
      ok: true,
      pointsAwarded: gainedPoints,
      remainderCents: newRemainder,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[rewards/purchase] error", err);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    conn.release();
  }
});

// POST /rewards/redeem
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
      "INSERT INTO reward_events (id, user_id, kind, points, meta, created_at) " +
        "VALUES (UUID(), ?, 'redeem', ?, JSON_OBJECT('rewardCode', ?), NOW())",
      [userId, -reward.cost, reward.code]
    );

    await conn.query<ResultSetHeader>(
      "INSERT INTO reward_redemptions (id, user_id, reward_code, points_cost, status, voucher_code, created_at, updated_at) " +
        "VALUES (UUID(), ?, ?, ?, ?, ?, NOW(), NOW())",
      [userId, reward.code, reward.cost, status, voucher]
    );

    await conn.commit();
    // ✅ el test espera que venga status PENDING
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
rewardsRouter.get("/catalog", requireAuth, async (_req: Request, res: Response) => {
  return res.status(200).json({ rewards: REWARDS });
});
// GET /rewards/redemptions (admin)
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
