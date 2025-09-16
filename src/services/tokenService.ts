import jwt from "jsonwebtoken";
import { config } from "../config";

type Payload = {
  sub: string;
  role: "user" | "admin";
};

export function signToken(payload: Payload): string {
  // El tercer parámetro debe ser un objeto con opciones, NO un string suelto.
  const expiresIn = (config.jwtExpiresIn as jwt.SignOptions["expiresIn"]) || "7d";
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}