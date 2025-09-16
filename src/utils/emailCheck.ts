import dns from "node:dns/promises";
import { config } from "../config";

const DISPOSABLE = new Set([
  "mailinator.com","10minutemail.com","tempmail.com","guerrillamail.com","yopmail.com",
]);

export async function checkEmailAccept(email: string): Promise<{ ok: true } | { ok: false; error: string }>{
  if (config.signupEmailCheck === "off") return { ok: true };
  const m = /^[^@\s]+@([^@\s]+)$/.exec(email);
  if (!m) return { ok: false, error: "invalid_email" } as const;
  const domain = m[1].toLowerCase();

  if (DISPOSABLE.has(domain)) {
    if (config.signupEmailCheck === "strict") return { ok: false, error: "disposable" } as const;
  }

  if (config.mailMxCheck) {
    try {
      const mx = await dns.resolveMx(domain);
      if (!mx || mx.length === 0) return { ok: false, error: "no_mx" } as const;
    } catch {
      return { ok: false, error: "no_mx" } as const;
    }
  }
  return { ok: true } as const;
}