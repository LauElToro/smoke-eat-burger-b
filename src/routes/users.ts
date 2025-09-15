import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { q } from "../db";
import { z } from "zod";
import { validate } from "../middleware/validate";


const router = Router();


router.get("/me", requireAuth, async (req, res) => {
  const uid = (req as any).user.id as string;
  const rows = await q<{id:string,email:string,role:'USER'|'ADMIN',points:number,referral_code:string,email_verified:number}>(
    "SELECT id,email,role,points,referral_code,email_verified FROM users WHERE id = ?", [uid]
  );
  const u = rows[0];
  res.json({
    user: u ? {
      id: u.id,
      email: u.email,
      role: u.role,
      points: u.points,
      referralCode: u.referral_code,
      emailVerified: !!u.email_verified
    } : null
  });
});



export default router;