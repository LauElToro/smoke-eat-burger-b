import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config";

export async function hashPassword(pw: string) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pw, salt);
}

export async function comparePassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function signJwt(payload: object) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "30d" });
}