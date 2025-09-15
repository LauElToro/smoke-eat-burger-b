import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { q, pool } from "../db";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { v4 as uuid } from "uuid";

const router = Router();

/* GET /rewards/tiers */
router.get("/tiers", async (_req, res) => {
  const tiers = await q(
    "SELECT id, code, name, description, cost_points AS costPoints, priority FROM reward_tiers ORDER BY priority ASC"
  );
  res.json({ tiers });
});

/* POST /rewards/redeem */
const redeemSchema = z.object({ body: z.object({ tierCode: z.string() }) });

router.post("/redeem", requireAuth, validate(redeemSchema), async (req, res) => {
  const uid = (req as any).user.id as string;
  const { tierCode } = req.body as { tierCode: string };

  const tiers = await q<{ id: string; cost_points: number }>(
    "SELECT id, cost_points FROM reward_tiers WHERE code = ?",
    [tierCode]
  );
  const tier = tiers[0];
  if (!tier) return res.status(404).json({ error: "tier_not_found" });

  // puntos del user
  const users = await q<{ points: number }>(
    "SELECT points FROM users WHERE id = ?",
    [uid]
  );
  const points = users[0]?.points ?? 0;
  if (points < tier.cost_points)
    return res.status(400).json({ error: "insufficient_points" });

  // transacción: descuenta y crea redemption
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("UPDATE users SET points = points - ? WHERE id = ?", [
      tier.cost_points,
      uid,
    ]);
    const rid = uuid();
    await conn.query(
      "INSERT INTO redemptions (id, user_id, tier_id, status) VALUES (?,?,?, 'PENDING')",
      [rid, uid, tier.id]
    );
    await conn.commit();
    res
      .status(201)
      .json({ redemption: { id: rid, userId: uid, tierId: tier.id, status: "PENDING" } });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

/* GET /rewards/mine */
router.get("/mine", requireAuth, async (req, res) => {
  const uid = (req as any).user.id as string;
  const list = await q(
    `SELECT r.id, r.status, r.created_at AS createdAt, r.notes,
            t.id AS tierId, t.code, t.name, t.description, t.cost_points AS costPoints, t.priority
       FROM redemptions r
       JOIN reward_tiers t ON t.id = r.tier_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC`,
    [uid]
  );

  res.json({
    redemptions: (list as any[]).map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      notes: r.notes,
      tier: {
        id: r.tierId,
        code: r.code,
        name: r.name,
        description: r.description,
        costPoints: r.costPoints,
        priority: r.priority,
      },
    })),
  });
});

export default router;
