import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { awardPointsForOrder } from "../services/pointsService";
import { q } from "../db";


const router = Router();


const createOrderSchema = z.object({ body: z.object({ amountARS: z.number().int().positive() }) });
router.post("/", requireAuth, validate(createOrderSchema), async (req, res) => {
const uid = (req as any).user.id as string;
const { amountARS } = req.body;
const order = await awardPointsForOrder(uid, amountARS);
return res.status(201).json({ order });
});


router.get("/my", requireAuth, async (req, res) => {
const uid = (req as any).user.id as string;
const orders = await q<{id:string,amount_ars:number,points_added:number,created_at:string}>(
"SELECT id, amount_ars AS amountARS, points_added AS pointsAdded, created_at AS createdAt FROM orders WHERE user_id = ? ORDER BY created_at DESC",
[uid]
);
res.json({ orders });
});


export default router;