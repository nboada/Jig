import type { Db } from "./db";
import { safeEqual, seal, unseal } from "./signing";


export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-jig_session" : "jig_session";
export const SESSION_IDLE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_RENEW_SECONDS = 24 * 60 * 60;

export const MIN_PASSWORD_LENGTH = 12;

const VALID_AFTER = "sessions-valid-after";

export type Session = { issuedAt: number; expires: number; sid: string };

export async function createSession(
  db: Db,
  now = Date.now(),
  issuedAt = now,
  sid = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url"),
): Promise<{ value: string; maxAge: number }> {
  const expires = Math.min(Math.floor(now / 1000) + SESSION_IDLE_SECONDS, Math.floor(issuedAt / 1000) + SESSION_ABSOLUTE_SECONDS);
  const value = await seal(db, "session", [String(issuedAt), sid], expires);
  return { value, maxAge: Math.max(0, expires - Math.floor(now / 1000)) };
}

export async function readSession(db: Db, value: string | undefined, now = Date.now()): Promise<Session | null> {
  const fields = await unseal(db, "session", value, now);
  const issuedAt = Number(fields?.[0]);
  if (!fields || fields.length !== 2 || !Number.isFinite(issuedAt)) return null;
  const [row] = await db.query<{ valid_after: string | null; revoked: boolean }>(
    `SELECT (SELECT value FROM app_secrets WHERE name = $1) AS valid_after,
            EXISTS (SELECT 1 FROM revoked_sessions WHERE sid = $2) AS revoked`,
    [VALID_AFTER, fields[1]],
  );
  if (row.revoked || (row.valid_after !== null && issuedAt <= Number(row.valid_after))) return null;
  return { issuedAt, expires: Number(value!.split(".")[2]), sid: fields[1] };
}

export async function revokeSession(db: Db, session: Session): Promise<void> {
  await db.query(
    `WITH pruned AS (DELETE FROM revoked_sessions WHERE expires_at < now())
     INSERT INTO revoked_sessions (sid, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT (sid) DO NOTHING`,
    [session.sid, session.expires],
  );
}

export async function endAllSessions(db: Db, now = Date.now()): Promise<void> {
  await db.query(
    `INSERT INTO app_secrets (name, value) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [VALID_AFTER, String(now)],
  );
}

export async function sessionsValidAfter(db: Db): Promise<number> {
  const rows = await db.query<{ value: string }>(`SELECT value FROM app_secrets WHERE name = $1`, [VALID_AFTER]);
  return rows[0] ? Number(rows[0].value) : 0;
}

export function sessionLooksCurrent(value: string | undefined, now = Date.now()): boolean {
  const parts = value?.split(".") ?? [];
  return parts.length === 4 && Number(parts[2]) * 1000 > now;
}

export function passwordProblem(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return "ADMIN_PASSWORD is not set on the server.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `ADMIN_PASSWORD is too short. Set one of at least ${MIN_PASSWORD_LENGTH} characters in your host's environment variables and redeploy.`;
  }
  return null;
}

export function checkPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return passwordProblem() === null && safeEqual(password, expected!);
}
