import { Router } from "express";
import { requireAdmin } from "../middleware/authJwt";
import { sendMail } from "../utils/mailer";

const router = Router();

// POST /_ops/test-email { to?: string }
router.post("/_ops/test-email", requireAdmin, async (req, res) => {
  const to = String(req.body?.to || process.env.MAIL_TEST_TO || "");
  if (!to) return res.status(400).json({ error: "missing_to" });
  try {
    const r = await sendMail({
      to,
      subject: "Prueba de email - Smoke Eat Burger",
      html: "<b>OK!</b> Este es un envío de prueba."
    });
    return res.json(r);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "send_fail" });
  }
});

export default router;