import type { Db } from "./db";


const MAX_ATTEMPTS = 10;
const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_EVERYWHERE = 100;

export function clientIpFrom(forwardedFor: string | null, realIp: string | null = null): string {
  return realIp?.trim() || forwardedFor?.split(",")[0]?.trim() || "unknown";
}

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
  const lifts = Math.max(...rows.map((r) => new Date(r.attempted_at).getTime())) + WINDOW_MINUTES * 60_000;
  return {
    blocked: true,
    retryAfterMinutes: Math.max(1, Math.ceil((lifts - now.getTime()) / 60_000)),
    ...(rows.some((r) => r.everywhere) ? { everywhere: true } : {}),
  };
}

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
