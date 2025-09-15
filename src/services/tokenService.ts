import jwt from "jsonwebtoken";
import { config } from "../config";
export function signJwt(payload: object) { return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn }); }
export function verifyJwt<T=any>(token: string): T { return jwt.verify(token, config.jwtSecret) as T; }