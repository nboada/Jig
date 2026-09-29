/**
 * Single-user login for the dashboard. The cookie holds an expiry timestamp
 * signed with HMAC-SHA256, so checking it needs no database and runs in the proxy.
 */

export const SESSION_COOKIE = "jig_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const value = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!value) throw new Error("Set ADMIN_PASSWORD (and SESSION_SECRET) to use the dashboard.");
  return value;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Buffer.from(signature).toString("base64url");
}

/** Compares two strings in constant time for equal lengths. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function createSessionValue(now = Date.now()): Promise<string> {
  const expires = String(Math.floor(now / 1000) + SESSION_MAX_AGE);
  return `${expires}.${await sign(expires)}`;
}

export async function isValidSession(value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) * 1000 < now) return false;
  try {
    return safeEqual(signature, await sign(expires));
  } catch {
    return false;
  }
}

export function checkPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && safeEqual(password, expected!);
}
