import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import {
  allowedRedirect,
  approve,
  checkAuthorizeRequest,
  exchangeCode,
  listGrants,
  OAuthError,
  pkceChallenge,
  refreshTokens,
  registerClient,
  revokeByToken,
  revokeGrant,
  verifyAccessToken,
} from "./oauth";

let db: Db;
const RESOURCE = "https://jig.example/api/mcp";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const verifier = "a".repeat(43) + "-._~xyz";

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE oauth_clients, oauth_codes, oauth_grants`);
});

async function authorize(extra: Record<string, string> = {}) {
  const client = await registerClient(db, { client_name: "Claude", redirect_uris: [CALLBACK] });
  const request = await checkAuthorizeRequest(
    db,
    {
      client_id: client.id,
      redirect_uri: CALLBACK,
      response_type: "code",
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
      state: "st4te",
      resource: RESOURCE,
      ...extra,
    },
    RESOURCE,
  );
  if ("redirect" in request) throw new Error(request.redirect);
  const back = new URL(await approve(db, request));
  return { client, code: back.searchParams.get("code")!, state: back.searchParams.get("state") };
}

describe("oauth", () => {
  test("redirect addresses: https anywhere, http only on this computer", () => {
    expect(allowedRedirect(CALLBACK)).toBe(true);
    expect(allowedRedirect("http://localhost:6274/callback")).toBe(true);
    expect(allowedRedirect("http://127.0.0.1:33418/cb")).toBe(true);
    expect(allowedRedirect("http://evil.example/cb")).toBe(false);
    expect(allowedRedirect("javascript:alert(1)")).toBe(false);
    expect(allowedRedirect("https://claude.ai/cb#frag")).toBe(false);
  });

  test("registration rejects bad redirects and confidential clients", async () => {
    await expect(registerClient(db, { redirect_uris: ["http://evil.example/cb"] })).rejects.toBeInstanceOf(OAuthError);
    await expect(registerClient(db, { redirect_uris: [CALLBACK], token_endpoint_auth_method: "client_secret_basic" })).rejects.toBeInstanceOf(OAuthError);
    await expect(registerClient(db, {})).rejects.toBeInstanceOf(OAuthError);
  });

  test("the full flow: approve, trade the code, use the token, refresh, revoke", async () => {
    const { client, code, state } = await authorize();
    expect(state).toBe("st4te");

    const tokens = await exchangeCode(db, { code, clientId: client.id, redirectUri: CALLBACK, codeVerifier: verifier, resource: RESOURCE });
    expect(tokens.token_type).toBe("Bearer");
    expect((await verifyAccessToken(db, tokens.access_token))?.name).toBe("Claude");
    expect((await listGrants(db)).map((g) => g.name)).toEqual(["Claude"]);

    const [row] = await db.query<{ access_hash: string }>(`SELECT access_hash FROM oauth_grants`);
    expect(row.access_hash).not.toBe(tokens.access_token);

    const next = await refreshTokens(db, { refreshToken: tokens.refresh_token, clientId: client.id });
    expect(await verifyAccessToken(db, tokens.access_token)).toBeNull();
    expect(await verifyAccessToken(db, next.access_token)).not.toBeNull();
    await expect(refreshTokens(db, { refreshToken: tokens.refresh_token, clientId: client.id })).rejects.toBeInstanceOf(OAuthError);

    await revokeByToken(db, next.refresh_token);
    expect(await verifyAccessToken(db, next.access_token)).toBeNull();
    expect(await listGrants(db)).toEqual([]);
  });

  test("a code is used up even by a failed trade, and needs the right verifier and client", async () => {
    const { client, code } = await authorize();
    const other = "b".repeat(50);
    await expect(exchangeCode(db, { code, clientId: client.id, codeVerifier: other })).rejects.toBeInstanceOf(OAuthError);
    await expect(exchangeCode(db, { code, clientId: client.id, codeVerifier: verifier })).rejects.toBeInstanceOf(OAuthError);

    const second = await authorize();
    await expect(exchangeCode(db, { code: second.code, clientId: client.id, codeVerifier: verifier })).rejects.toBeInstanceOf(OAuthError);
  });

  test("expired codes and tokens don't work", async () => {
    const { client, code } = await authorize();
    await db.query(`UPDATE oauth_codes SET expires_at = now() - interval '1 second'`);
    await expect(exchangeCode(db, { code, clientId: client.id, codeVerifier: verifier })).rejects.toBeInstanceOf(OAuthError);

    const fresh = await authorize();
    const tokens = await exchangeCode(db, { code: fresh.code, clientId: fresh.client.id, codeVerifier: verifier });
    await db.query(`UPDATE oauth_grants SET access_expires_at = now() - interval '1 second'`);
    expect(await verifyAccessToken(db, tokens.access_token)).toBeNull();
    const next = await refreshTokens(db, { refreshToken: tokens.refresh_token, clientId: fresh.client.id });
    expect(await verifyAccessToken(db, next.access_token)).not.toBeNull();
  });

  test("authorize: unknown apps and mismatched return addresses throw; other problems go back to the app", async () => {
    const client = await registerClient(db, { redirect_uris: [CALLBACK] });
    const base = { client_id: client.id, redirect_uri: CALLBACK, response_type: "code", code_challenge: "x", code_challenge_method: "S256" };
    await expect(checkAuthorizeRequest(db, { ...base, client_id: "nope" }, RESOURCE)).rejects.toBeInstanceOf(OAuthError);
    await expect(checkAuthorizeRequest(db, { ...base, redirect_uri: "https://evil.example/cb" }, RESOURCE)).rejects.toBeInstanceOf(OAuthError);

    const noPkce = await checkAuthorizeRequest(db, { ...base, code_challenge_method: "plain" }, RESOURCE);
    expect("redirect" in noPkce && new URL(noPkce.redirect).searchParams.get("error")).toBe("invalid_request");
    const wrongResource = await checkAuthorizeRequest(db, { ...base, resource: "https://other.example/mcp" }, RESOURCE);
    expect("redirect" in wrongResource && new URL(wrongResource.redirect).searchParams.get("error")).toBe("invalid_target");
  });

  test("revoking from the Connect page ends the app's access", async () => {
    const { client, code } = await authorize();
    const tokens = await exchangeCode(db, { code, clientId: client.id, codeVerifier: verifier });
    const [grant] = await listGrants(db);
    await revokeGrant(db, grant.id);
    expect(await verifyAccessToken(db, tokens.access_token)).toBeNull();
    await expect(refreshTokens(db, { refreshToken: tokens.refresh_token, clientId: client.id })).rejects.toBeInstanceOf(OAuthError);
  });
});
