import { promises as dns } from "dns";
import disposable from "disposable-email-domains";

const DISPOSABLE = new Set<string>(disposable.map((d: string) => d.toLowerCase()));

export function isDisposableDomain(domain: string) {
  const d = domain.toLowerCase();
  return DISPOSABLE.has(d) || DISPOSABLE.has(d.replace(/^www\./, ""));
}

export async function domainHasMX(domain: string) {
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

export async function validateEmailForSignup(email: string) {
  const parts = email.split("@");
  if (parts.length !== 2) return { ok: false, reason: "invalid_format" as const };
  const domain = parts[1].toLowerCase();
  if (isDisposableDomain(domain)) return { ok: false, reason: "disposable" as const };
  if (!(await domainHasMX(domain))) return { ok: false, reason: "no_mx" as const };
  return { ok: true as const };
}
