import { Router } from "express";
import { requireAuth } from "../middleware/authJwt";
import { q } from "../db";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string; // unificamos
  try {
    const [rows] = await q<any>(
      "SELECT id, email, role, points, points_remainder_cents AS pointsRemainderCents, referral_code AS referralCode FROM users WHERE id = ?",
      [userId]
    );
    const user = (rows as any[])[0];
    if (!user) return res.status(404).json({ error: "not_found" });
    return res.json({ user });
  } catch (err) {
    console.error("[users/me] fail:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

router.get("/referrals", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  try {
    const [rows] = await q<any>(
      "SELECT id, email, created_at FROM users WHERE referred_by_id = ? ORDER BY created_at DESC",
      [userId]
    );
    return res.json({ referrals: rows });
  } catch (err) {
    console.error("[users/referrals] fail:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;