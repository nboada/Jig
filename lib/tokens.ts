import type { Db } from "./db";
import { sha256 } from "./signing";

/**
 * API tokens let agents reach the MCP endpoint. Only a SHA-256 hash is stored,
 * so a token is shown once, when it is created.
 */

export type ApiToken = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

const TOKEN_PREFIX = "jig_";
/** Tokens created before the rename to Jig keep working. */
const LEGACY_PREFIX = "snp_";

function toToken(row: Record<string, unknown>): ApiToken {
  return {
    id: row.id as string,
    name: row.name as string,
    prefix: row.prefix as string,
    createdAt: new Date(row.created_at as string).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string).toISOString() : null,
  };
}

export async function createToken(db: Db, name: string): Promise<{ token: string; record: ApiToken }> {
  const label = name.trim().slice(0, 60) || "Agent";
  const token = TOKEN_PREFIX + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const rows = await db.query(
    `INSERT INTO api_tokens (id, name, token_hash, prefix) VALUES ($1, $2, $3, $4) RETURNING *`,
    [crypto.randomUUID(), label, await sha256(token), token.slice(0, TOKEN_PREFIX.length + 6)],
  );
  return { token, record: toToken(rows[0]) };
}

/**
 * Returns the token's record when it is valid, and notes when it was last used (to the nearest
 * few minutes, so a busy agent doesn't write to the database on every request).
 */
export async function verifyToken(db: Db, token: string | undefined): Promise<ApiToken | null> {
  if (!token?.startsWith(TOKEN_PREFIX) && !token?.startsWith(LEGACY_PREFIX)) return null;
  const rows = await db.query(
    `WITH used AS (
       UPDATE api_tokens SET last_used_at = now()
       WHERE token_hash = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes')
     )
     SELECT * FROM api_tokens WHERE token_hash = $1`,
    [await sha256(token)],
  );
  return rows[0] ? toToken(rows[0]) : null;
}

export async function listTokens(db: Db): Promise<ApiToken[]> {
  const rows = await db.query(`SELECT * FROM api_tokens ORDER BY created_at DESC`);
  return rows.map(toToken);
}

export async function revokeToken(db: Db, id: string): Promise<void> {
  await db.query(`DELETE FROM api_tokens WHERE id = $1`, [id]);
}
