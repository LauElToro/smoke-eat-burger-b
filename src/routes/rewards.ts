import { Router, Request, Response } from "express";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/authJwt.js";

export const rewardsRouter = Router();

const POINTS_PER_10K = Number(process.env.POINTS_PER_10K || 100);
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS || 50);

// Catálogo mínimo para el test
type Reward = { code: string; name: string; cost: number };
const REWARDS: Reward[] = [{ code: "ANY_COMBO_PLUS_SIDE", name: "Combo + Guarnición", cost: 2000 }];
const getReward = (code: string) => REWARDS.find((r) => r.code === code);

// POST /rewards/purchase
rewardsRouter.post("/purchase", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId as string;
  const totalCents = Number(req.body?.totalCents || 0);
  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    return res.status(400).json({ error: "invalid_total" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

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
        "VALUES (UUID(), ?, 'purchase', ?, JSON_OBJECT('totalCents', ?, 'blocks', ?, 'carryBefore', ?), NOW())",
      [userId, gainedPoints, totalCents, blocks, carry]
    );

    // bono de referido en la *primera* compra del referido
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
