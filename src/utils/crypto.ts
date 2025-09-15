import bcrypt from "bcryptjs";
import { config } from "../config";


export async function hashPassword(pw: string) { return bcrypt.hash(pw, config.bcryptRounds); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }