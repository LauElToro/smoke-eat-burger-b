import { Router } from "express";
import { requireAuth } from "../middleware/authJwt";

const router = Router();

router.get("/", requireAuth, async (_req, res) => {
  return res.json({ ok: true, items: [] });
});

export default router;