import { Router } from "express";
import { requireAuth } from "../middleware/authJwt";
import { q } from "../db";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  const userId = (req as any).user?.sub as string;
  try {
    const rows = await q<any>(
      "SELECT id, email, role, points, referral_code AS referralCode FROM users WHERE id = ?",
      [userId]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "not_found" });
    return res.json({ user });
  } catch (err) {
    console.error("[users/me] fail:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;