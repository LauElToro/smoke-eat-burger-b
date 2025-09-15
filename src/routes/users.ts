import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { q } from "../db";
import { z } from "zod";
import { validate } from "../middleware/validate";


const router = Router();


router.get("/me", requireAuth, async (req, res) => {
const uid = (req as any).user.id as string;
const rows = await q<{id:string,email:string,role:'USER'|'ADMIN',points:number,referral_code:string}>(
"SELECT id,email,role,points,referral_code FROM users WHERE id = ?", [uid]
);
const u = rows[0];
res.json({ user: u ? { id: u.id, email: u.email, role: u.role, points: u.points, referralCode: u.referral_code } : null });
});


const roleSchema = z.object({ params: z.object({ id: z.string() }), body: z.object({ role: z.enum(["USER","ADMIN"]) }) });
router.post("/:id/role", requireAuth, requireRole("ADMIN"), validate(roleSchema), async (req, res) => {
const { id } = req.params; const { role } = req.body;
await q("UPDATE users SET role = ? WHERE id = ?", [role, id]);
res.json({ id, role });
});


export default router;