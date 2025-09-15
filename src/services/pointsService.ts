import { pool } from "../db";
import { config } from "../config";
import { v4 as uuid } from "uuid";


export async function awardPointsForOrder(userId: string, amountARS: number) {
const conn = await pool.getConnection();
try {
await conn.beginTransaction();
const [users] = await conn.query<any[]>("SELECT id, spend_remainder, points, referred_by_id, first_purchase_at FROM users WHERE id = ? FOR UPDATE", [userId]);
if (!users.length) throw new Error("user not found");
const u = users[0];


const total = Number(u.spend_remainder) + amountARS;
const units = Math.floor(total / 10000);
const points = units * config.pointsPer10k;
const remainder = total % 10000;


const orderId = uuid();
await conn.query("INSERT INTO orders (id, user_id, amount_ars, points_added) VALUES (?,?,?,?)", [orderId, userId, amountARS, points]);


const firstPurchaseAt = u.first_purchase_at ? u.first_purchase_at : new Date();
await conn.query("UPDATE users SET points = points + ?, spend_remainder = ?, first_purchase_at = IFNULL(first_purchase_at, ?) WHERE id = ?", [points, remainder, firstPurchaseAt, userId]);


// bonus a referente si es la primera compra del referido
if (!u.first_purchase_at && u.referred_by_id) {
await conn.query("UPDATE users SET points = points + ? WHERE id = ?", [config.referralBonus, u.referred_by_id]);
}


await conn.commit();
return { id: orderId, userId, amountARS, pointsAdded: points };
} catch (e) {
await conn.rollback();
throw e;
} finally {
conn.release();
}
}