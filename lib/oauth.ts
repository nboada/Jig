import { z } from "zod";
import type { Db } from "./db";
import { sha256 } from "./signing";

/**
 * OAuth 2.1 for the MCP endpoint, so apps like Claude can connect with a sign-in instead of a
 * pasted token. Jig is its own authorization server:
 * - Apps register themselves (RFC 7591) as public clients: no secret, PKCE (S256) required.
 * - The owner signs in to the dashboard and approves on /oauth/authorize, which issues a code
 *   good for 5 minutes and one use.
 * - The code buys an access token (1 hour) and a refresh token. Refreshing replaces both, so a
 *   stolen refresh token dies the first time either side uses it.
 * Like API tokens, only SHA-256 hashes of codes and tokens are stored. Every write is a single
 * statement (see lib/db.ts). An approved app gets exactly what an API token gets: snippets and
 * notes, never credentials or locked notes.
 */

export const ACCESS_TTL_SECONDS = 3600;
const CODE_TTL_SECONDS = 300;
export const SCOPE = "mcp";

const ACCESS_PREFIX = "jigo_at_";
const REFRESH_PREFIX = "jigo_rt_";
const CODE_PREFIX = "jigo_ac_";

/** An OAuth error, sent to the app as `{ error, error_description }`. */
export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const random = (prefix: string) => prefix + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

/** The PKCE challenge for a verifier: base64url(SHA-256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

/** Where an app may be sent back to: any https address, or http on this computer (desktop apps). */
export function allowedRedirect(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export type OAuthClient = { id: string; name: string; redirectUris: string[] };

function toClient(row: Record<string, unknown>): OAuthClient {
  return { id: row.id as string, name: row.name as string, redirectUris: row.redirect_uris as string[] };
}

const Registration = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().max(100).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

/**
 * Registers an app. Anyone may register (that's how apps find their way in), but a registration
 * alone gets nothing: the owner still has to approve it. Registrations never approved are cleared
 * after a day.
 */
export async function registerClient(db: Db, input: unknown): Promise<OAuthClient> {
  const parsed = Registration.safeParse(input);
  if (!parsed.success) throw new OAuthError("invalid_client_metadata", "redirect_uris is required.");
  const { redirect_uris, client_name, token_endpoint_auth_method } = parsed.data;
  if (token_endpoint_auth_method && token_endpoint_auth_method !== "none") {
    throw new OAuthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method none) are supported.");
  }
  const bad = redirect_uris.find((uri) => !allowedRedirect(uri));
  if (bad) throw new OAuthError("invalid_redirect_uri", `Redirect URI not allowed: ${bad}`);
  const rows = await db.query(
    `WITH stale AS (
       DELETE FROM oauth_clients c
       WHERE c.created_at < now() - interval '1 day' AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = c.id)
     )
     INSERT INTO oauth_clients (id, name, redirect_uris) VALUES ($1, $2, $3::jsonb) RETURNING *`,
    [crypto.randomUUID(), client_name?.trim() || "An app", JSON.stringify(redirect_uris)],
  );
  return toClient(rows[0]);
}

export async function getClient(db: Db, id: string): Promise<OAuthClient | null> {
  const rows = await db.query(`SELECT * FROM oauth_clients WHERE id = $1`, [id]);
  return rows[0] ? toClient(rows[0]) : null;
}

export type AuthorizeRequest = {
  client: OAuthClient;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
};

/**
 * Checks the parameters of a request to /oauth/authorize. Problems with the app or its redirect
 * address can't be sent back to it (that address isn't trusted yet), so they throw; anything else
 * is sent back to the app as `?error=`, which `redirectError` builds.
 */
export async function checkAuthorizeRequest(
  db: Db,
  params: Record<string, string | undefined>,
  resourceUrl: string,
): Promise<AuthorizeRequest | { redirect: string }> {
  const client = params.client_id ? await getClient(db, params.client_id) : null;
  if (!client) throw new OAuthError("invalid_client", "This app isn't registered with Jig. Try connecting again from the app.");
  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!client.redirectUris.includes(redirectUri)) {
    throw new OAuthError("invalid_request", "The app's return address doesn't match the one it registered.");
  }
  const back = (error: string, description: string) => ({ redirect: redirectError(redirectUri, error, description, params.state) });
  if (params.response_type !== "code") return back("unsupported_response_type", "Only response_type=code is supported.");
  if (!params.code_challenge || params.code_challenge_method !== "S256") {
    return back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  if (params.resource && params.resource !== resourceUrl) return back("invalid_target", `The resource must be ${resourceUrl}.`);
  return { client, redirectUri, codeChallenge: params.code_challenge, state: params.state, resource: params.resource };
}

export function redirectError(redirectUri: string, error: string, description: string, state?: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

/** Issues a one-use code for an approved request, and returns the app's return address with it. */
export async function approve(db: Db, request: AuthorizeRequest): Promise<string> {
  const code = random(CODE_PREFIX);
  await db.query(
    `WITH expired AS (DELETE FROM oauth_codes WHERE expires_at < now())
     INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
    [await sha256(code), request.client.id, request.redirectUri, request.codeChallenge, request.resource ?? null, CODE_TTL_SECONDS],
  );
  const url = new URL(request.redirectUri);
  url.searchParams.set("code", code);
  if (request.state) url.searchParams.set("state", request.state);
  return url.toString();
}

export type Tokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

function tokens(access: string, refresh: string): Tokens {
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope: SCOPE };
}

const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

/**
 * Trades a code for tokens. The code is used up whether or not the trade succeeds, so a wrong
 * verifier can't be retried against it.
 */
export async function exchangeCode(
  db: Db,
  { code, clientId, redirectUri, codeVerifier, resource }: { code?: string; clientId?: string; redirectUri?: string; codeVerifier?: string; resource?: string },
): Promise<Tokens> {
  if (!code || !clientId || !codeVerifier) throw new OAuthError("invalid_request", "code, client_id and code_verifier are required.");
  if (!VERIFIER.test(codeVerifier)) throw new OAuthError("invalid_grant", "The code_verifier is malformed.");
  const access = random(ACCESS_PREFIX);
  const refresh = random(REFRESH_PREFIX);
  const rows = await db.query(
    `WITH c AS (DELETE FROM oauth_codes WHERE code_hash = $1 RETURNING *)
     INSERT INTO oauth_grants (id, client_id, name, access_hash, access_expires_at, refresh_hash)
     SELECT $2, c.client_id, cl.name, $3, now() + make_interval(secs => $4), $5
     FROM c JOIN oauth_clients cl ON cl.id = c.client_id
     WHERE c.expires_at > now() AND c.client_id = $6 AND c.code_challenge = $7
       AND ($8::text IS NULL OR c.redirect_uri = $8)
       AND ($9::text IS NULL OR c.resource IS NULL OR c.resource = $9)
     RETURNING id`,
    [
      await sha256(code),
      crypto.randomUUID(),
      await sha256(access),
      ACCESS_TTL_SECONDS,
      await sha256(refresh),
      clientId,
      await pkceChallenge(codeVerifier),
      redirectUri ?? null,
      resource ?? null,
    ],
  );
  if (!rows.length) throw new OAuthError("invalid_grant", "The code is invalid, expired or already used.");
  return tokens(access, refresh);
}

/** Replaces an app's access and refresh tokens; the old refresh token stops working. */
export async function refreshTokens(db: Db, { refreshToken, clientId }: { refreshToken?: string; clientId?: string }): Promise<Tokens> {
  if (!refreshToken?.startsWith(REFRESH_PREFIX) || !clientId) throw new OAuthError("invalid_grant", "The refresh token is invalid.");
  const access = random(ACCESS_PREFIX);
  const refresh = random(REFRESH_PREFIX);
  const rows = await db.query(
    `UPDATE oauth_grants
     SET access_hash = $3, access_expires_at = now() + make_interval(secs => $4), refresh_hash = $5, last_used_at = now()
     WHERE refresh_hash = $1 AND client_id = $2
     RETURNING id`,
    [await sha256(refreshToken), clientId, await sha256(access), ACCESS_TTL_SECONDS, await sha256(refresh)],
  );
  if (!rows.length) throw new OAuthError("invalid_grant", "The refresh token is invalid or was revoked.");
  return tokens(access, refresh);
}

/**
 * The approved app an access token belongs to, while the token is current. Notes when it was last
 * used, to the nearest few minutes (like API tokens).
 */
export async function verifyAccessToken(db: Db, token: string | undefined): Promise<{ name: string; expiresAt: number } | null> {
  if (!token?.startsWith(ACCESS_PREFIX)) return null;
  const rows = await db.query<{ name: string; access_expires_at: string }>(
    `WITH used AS (
       UPDATE oauth_grants SET last_used_at = now()
       WHERE access_hash = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes')
     )
     SELECT name, access_expires_at FROM oauth_grants WHERE access_hash = $1 AND access_expires_at > now()`,
    [await sha256(token)],
  );
  if (!rows[0]) return null;
  return { name: rows[0].name, expiresAt: Math.floor(new Date(rows[0].access_expires_at).getTime() / 1000) };
}

/** Revokes the approval an access or refresh token belongs to (RFC 7009: unknown tokens are fine). */
export async function revokeByToken(db: Db, token: string): Promise<void> {
  const hash = await sha256(token);
  await db.query(`DELETE FROM oauth_grants WHERE access_hash = $1 OR refresh_hash = $1`, [hash]);
}

export type Grant = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

/** The apps approved to reach the MCP endpoint, for the Connect page. */
export async function listGrants(db: Db): Promise<Grant[]> {
  const rows = await db.query(`SELECT id, name, created_at, last_used_at FROM oauth_grants ORDER BY created_at DESC`);
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    createdAt: new Date(row.created_at as string).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string).toISOString() : null,
  }));
}

export async function revokeGrant(db: Db, id: string): Promise<void> {
  await db.query(`DELETE FROM oauth_grants WHERE id = $1`, [id]);
}
