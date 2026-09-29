import type { Db } from "./db";

/**
 * Failed dashboard logins are counted per IP in the database, because Vercel
 * runs several server instances and an in-memory count would be per instance.
 * The attempt is recorded before it is counted (see `login` in app/actions.ts),
 * so parallel requests can't all slip through the check at once.
 */

const MAX_ATTEMPTS = 10;
const WINDOW_MINUTES = 15;
/**
 * Across every IP: past this many password attempts in the window, password logins stop for
 * everyone until it passes, so a botnet can't get ten guesses per address. Passkey sign-in
 * doesn't count this, so the owner can still get in with a passkey while it lasts.
 */
const MAX_ATTEMPTS_EVERYWHERE = 100;

/**
 * The client's IP. Vercel sets x-real-ip (and the first x-forwarded-for entry) itself; behind a
 * host that doesn't, both headers come from the client and can't be trusted.
 */
export function clientIpFrom(forwardedFor: string | null, realIp: string | null = null): string {
  return realIp?.trim() || forwardedFor?.split(",")[0]?.trim() || "unknown";
}

/**
 * Blocked once the IP has MORE THAN MAX_ATTEMPTS attempts recorded inside the window, or, with
 * `everywhere`, once all IPs together have more than MAX_ATTEMPTS_EVERYWHERE.
 */
export async function checkLogin(
  db: Db,
  ip: string,
  now = new Date(),
  { everywhere = false }: { everywhere?: boolean } = {},
): Promise<{ blocked: boolean; retryAfterMinutes: number; everywhere?: boolean }> {
  const rows = await db.query<{ attempted_at: string; everywhere: boolean }>(
    `(SELECT attempted_at, false AS everywhere FROM login_attempts
      WHERE ip = $1 AND attempted_at > $2::timestamptz - interval '${WINDOW_MINUTES} minutes'
      ORDER BY attempted_at DESC
      OFFSET ${MAX_ATTEMPTS} LIMIT 1)
     UNION ALL
     (SELECT attempted_at, true FROM login_attempts
      WHERE $3 AND attempted_at > $2::timestamptz - interval '${WINDOW_MINUTES} minutes'
      ORDER BY attempted_at DESC
      OFFSET ${MAX_ATTEMPTS_EVERYWHERE} LIMIT 1)`,
    [ip, now.toISOString(), everywhere],
  );
  if (!rows.length) return { blocked: false, retryAfterMinutes: 0 };
  // The block lifts when the attempt past the limit leaves the window (the later of the two).
  const lifts = Math.max(...rows.map((r) => new Date(r.attempted_at).getTime())) + WINDOW_MINUTES * 60_000;
  return {
    blocked: true,
    retryAfterMinutes: Math.max(1, Math.ceil((lifts - now.getTime()) / 60_000)),
    ...(rows.some((r) => r.everywhere) ? { everywhere: true } : {}),
  };
}

/** Records an attempt and prunes attempts that are outside the window for every IP. */
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
