const BASE_DISPOSABLE_SET = new Set<string>([
  // Muy comunes
  "mailinator.com",
  "yopmail.com",
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",
  "tempmail.org",
  "temp-mail.org",
  "tempmailo.com",
  "tempmail.dev",
  "tempmail.ninja",
  "tempmail.plus",
  "maildrop.cc",
  "mohmal.com",
  "guerrillamail.com",
  "sharklasers.com",
  "grr.la",
  "guerrillamailblock.com",
  "getnada.com",
  "dropmail.me",
  "mailnesia.com",
  "trashmail.com",
  "trash-mail.com",
  "trashmail.de",
  "dispostable.com",
  "mailcatch.com",
  "throwawaymail.com",
  "minuteinbox.com",
  "tempail.com",
  "spambox.xyz",
  "fakemail.net",
  "spamgourmet.com",
  "jetable.org",
  "mailtm.com",
  "mytemp.email",
  "owlymail.com",
  "gmx.us", // a veces usado para throwaway (ojo: puede ser legítimo)
  // Variantes y alias comunes
  "guerrillamail.de",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamail.biz",
  "guerrillamail.info",
  "guerrillamailblock.com",
]);

/**
 * Normaliza y extrae el dominio desde un email o dominio.
 */
function extractDomain(input: string): string | null {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();

  // Si ya parece un dominio (no contiene "@")
  if (!s.includes("@")) {
    return s.replace(/\.+$/, "");
  }

  // email
  const at = s.lastIndexOf("@");
  if (at === -1 || at === s.length - 1) return null;
  const domain = s.slice(at + 1).replace(/\.+$/, "");
  return domain || null;
}

/**
 * Chequeo de formato razonable, sin resolver DNS.
 * Permite subdominios y TLDs modernos. No intenta cubrir 100% RFC5322.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const s = email.trim();

  // Tamaños mínimos razonables
  if (s.length < 6 || s.length > 254) return false;

  // Regex práctica (sin unicode complejo). Acepta + en local-part.
  const re =
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

  if (!re.test(s)) return false;

  // Evitar puntos consecutivos en local-part
  const [local] = s.split("@");
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;

  return true;
}

/**
 * Determina si el dominio (o el dominio del email) pertenece a un proveedor desechable.
 * - Compara exacto y por sufijo (subdominios).
 * - Permite ampliar lista vía env DISPOSABLE_EXTRA (comma-separated).
 */
export function isDisposableDomain(emailOrDomain: string): boolean {
  const domain = extractDomain(emailOrDomain);
  if (!domain) return false;

  // Ampliar con env
  const extra = (process.env.DISPOSABLE_EXTRA || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  const BLOCK = new Set<string>([...BASE_DISPOSABLE_SET, ...extra]);

  // match exacto o por sufijo (subdominios)
  for (const bad of BLOCK) {
    if (domain === bad) return true;
    if (domain.endsWith("." + bad)) return true;
  }
  return false;
}