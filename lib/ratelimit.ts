import type { Db } from "./db";

/**
 * Failed dashboard logins are counted per IP in the database, because Vercel
 * runs several server instances and an in-memory count would be per instance.
 */

const MAX_FAILURES = 10;
const WINDOW_MINUTES = 15;

/** The client's IP from Vercel's x-forwarded-for header: the first entry. */
export function clientIpFrom(forwardedFor: string | null): string {
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

/** Blocked once the IP has MAX_FAILURES failures inside the window. */
export async function checkLogin(
  db: Db,
  ip: string,
  now = new Date(),
): Promise<{ blocked: boolean; retryAfterMinutes: number }> {
  const rows = await db.query<{ attempted_at: string }>(
    `SELECT attempted_at FROM login_attempts
     WHERE ip = $1 AND attempted_at > $2::timestamptz - interval '${WINDOW_MINUTES} minutes'
     ORDER BY attempted_at DESC
     OFFSET ${MAX_FAILURES - 1} LIMIT 1`,
    [ip, now.toISOString()],
  );
  if (!rows[0]) return { blocked: false, retryAfterMinutes: 0 };
  // The block lifts when the MAX_FAILURES-th most recent failure leaves the window.
  const lifts = new Date(rows[0].attempted_at).getTime() + WINDOW_MINUTES * 60_000;
  return { blocked: true, retryAfterMinutes: Math.max(1, Math.ceil((lifts - now.getTime()) / 60_000)) };
}

/** Records a failure and prunes attempts that are outside the window for every IP. */
export async function recordFailure(db: Db, ip: string, now = new Date()): Promise<void> {
  await db.query(
    `WITH pruned AS (
       DELETE FROM login_attempts WHERE attempted_at <= $2::timestamptz - interval '${WINDOW_MINUTES} minutes'
     )
     INSERT INTO login_attempts (ip, attempted_at) VALUES ($1, $2::timestamptz)`,
    [ip, now.toISOString()],
  );
}

export async function clearFailures(db: Db, ip: string): Promise<void> {
  await db.query(`DELETE FROM login_attempts WHERE ip = $1`, [ip]);
}
