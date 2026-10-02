import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { protectedResourceMetadata } from "./oauth-http";
import {
  allowedRedirect,
  approve,
  checkAuthorizeRequest,
  exchangeCode,
  isAppRedirect,
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

  const APP_CALLBACK = "com.example.jig:/oauth";

  test("redirect addresses: reverse-domain app schemes are allowed, other schemes are not", () => {
    expect(allowedRedirect(APP_CALLBACK)).toBe(true);
    expect(allowedRedirect("com.example.app:/cb")).toBe(true);
    expect(allowedRedirect("myapp:/cb")).toBe(false);
    expect(allowedRedirect("javascript:alert(1)")).toBe(false);
    expect(allowedRedirect("data:text/html,hi")).toBe(false);
    expect(allowedRedirect("com.example.app://evil.example/cb")).toBe(false);
    expect(allowedRedirect("com.example.app:/cb#frag")).toBe(false);
  });

  async function authorizeApp(scope?: string) {
    const client = await registerClient(db, { client_name: "Jig for iPhone", redirect_uris: [APP_CALLBACK] });
    const request = await checkAuthorizeRequest(
      db,
      {
        client_id: client.id,
        redirect_uri: APP_CALLBACK,
        response_type: "code",
        code_challenge: await pkceChallenge(verifier),
        code_challenge_method: "S256",
        ...(scope === undefined ? {} : { scope }),
      },
      RESOURCE,
    );
    return { client, request };
  }

  test("an app grant keeps its scope through the code, the token and a refresh", async () => {
    const { client, request } = await authorizeApp("app");
    if ("redirect" in request) throw new Error(request.redirect);
    expect(request.scope).toBe("app");
    const back = new URL(await approve(db, request));
    expect(back.protocol).toBe("com.example.jig:");

    const tokens = await exchangeCode(db, { code: back.searchParams.get("code")!, clientId: client.id, codeVerifier: verifier });
    expect(tokens.scope).toBe("app");
    expect((await verifyAccessToken(db, tokens.access_token))?.scope).toBe("app");

    const next = await refreshTokens(db, { refreshToken: tokens.refresh_token, clientId: client.id });
    expect(next.scope).toBe("app");
    expect((await verifyAccessToken(db, next.access_token))?.scope).toBe("app");
  });

  test("no scope means mcp, and unknown scopes go back to the app", async () => {
    const plain = await authorizeApp();
    if ("redirect" in plain.request) throw new Error(plain.request.redirect);
    expect(plain.request.scope).toBe("mcp");

    const bad = await authorizeApp("admin");
    expect("redirect" in bad.request && new URL(bad.request.redirect).searchParams.get("error")).toBe("invalid_scope");
  });

  test("existing flows still get mcp tokens", async () => {
    const { client, code } = await authorize();
    const tokens = await exchangeCode(db, { code, clientId: client.id, redirectUri: CALLBACK, codeVerifier: verifier, resource: RESOURCE });
    expect(tokens.scope).toBe("mcp");
    expect((await verifyAccessToken(db, tokens.access_token))?.scope).toBe("mcp");
  });

  test("scope is a space-separated list: app wins, mcp app is what SDK clients send, unknown words are refused", async () => {
    const both = await authorizeApp("mcp app");
    expect("redirect" in both.request ? null : both.request.scope).toBe("app");
    const mcp = await authorizeApp(" mcp ");
    expect("redirect" in mcp.request ? null : mcp.request.scope).toBe("mcp");
    const bad = await authorizeApp("mcp admin");
    expect("redirect" in bad.request && new URL(bad.request.redirect).searchParams.get("error")).toBe("invalid_scope");
  });

  test("the MCP resource only advertises the mcp scope, so connectors don't ask for app", () => {
    expect(protectedResourceMetadata(new Request("https://jig.example/.well-known/oauth-protected-resource/api/mcp")).scopes_supported).toEqual(["mcp"]);
  });

  test("https redirects are never mistaken for app ones, whatever their case or spacing", () => {
    expect(isAppRedirect("HTTPS://evil.com/cb")).toBe(false);
    expect(isAppRedirect(" https://evil.com/cb")).toBe(false);
    expect(isAppRedirect("http://localhost:1/cb")).toBe(false);
    expect(isAppRedirect("com.example.jig:/oauth")).toBe(true);
  });
});
