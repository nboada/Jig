import { beforeAll, beforeEach, expect, test } from "bun:test";
import { respond } from "./api-http";
import { snippetsApi } from "./api";
import { pgliteDb, prepare, type Db } from "./db";
import { approve, checkAuthorizeRequest, exchangeCode, pkceChallenge, registerClient } from "./oauth";
import { SnippetError } from "./snippets";
import { createToken } from "./tokens";

let db: Db;
const verifier = "b".repeat(50);
const CALLBACK = "com.example.jig:/oauth";

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE oauth_clients, oauth_codes, oauth_grants, api_tokens, snippets, snippet_versions`);
});

async function accessToken(scope: string) {
  const client = await registerClient(db, { client_name: "Jig for iPhone", redirect_uris: [CALLBACK] });
  const request = await checkAuthorizeRequest(
    db,
    { client_id: client.id, redirect_uri: CALLBACK, response_type: "code", code_challenge: await pkceChallenge(verifier), code_challenge_method: "S256", scope },
    "https://jig.example/api/mcp",
  );
  if ("redirect" in request) throw new Error(request.redirect);
  const code = new URL(await approve(db, request)).searchParams.get("code")!;
  return (await exchangeCode(db, { code, clientId: client.id, codeVerifier: verifier })).access_token;
}

const req = (token?: string, init: RequestInit = {}) =>
  new Request("https://jig.example/api/v1/snippets", {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
  });

test("app tokens get through and their writes are signed with the app's name", async () => {
  const token = await accessToken("app");
  const res = await respond(
    db,
    req(token, { method: "POST", body: JSON.stringify({ title: "Hi", language: "javascript", files: [{ name: "a.js", content: "1" }] }) }),
    async ({ source, body }) => snippetsApi.create(db, await body(), source),
    201,
  );
  expect(res.status).toBe(201);
  expect((await res.json()).slug).toBe("hi");
  expect((await snippetsApi.versions(db, "hi"))[0].source).toBe("app:Jig for iPhone");
});

test("no token, an mcp token or a jig_ API token is refused with 401", async () => {
  const mcp = await accessToken("mcp");
  const { token: apiToken } = await createToken(db, "agent");
  for (const token of [undefined, "nonsense", mcp, apiToken]) {
    const res = await respond(db, req(token), async () => "secret");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
    expect((await res.json()).error.code).toBe("unauthorized");
  }
});

test("errors map to status codes, and unexpected ones don't leak", async () => {
  const token = await accessToken("app");
  const cases: [Error, number, string][] = [
    [new SnippetError("bad", "invalid"), 400, "invalid"],
    [new SnippetError("gone", "not_found"), 404, "not_found"],
    [new SnippetError("stale", "conflict"), 409, "conflict"],
    [new Error("db password is hunter2"), 500, "server_error"],
  ];
  for (const [error, status, code] of cases) {
    const res = await respond(db, req(token), async () => {
      throw error;
    });
    expect(res.status).toBe(status);
    const json = await res.json();
    expect(json.error.code).toBe(code);
    if (status === 500) expect(json.error.message).toBe("Something went wrong. Try again.");
  }
});

test("bodies must be JSON objects", async () => {
  const token = await accessToken("app");
  for (const raw of ["[]", "null", '"x"', "{not json"]) {
    const res = await respond(db, req(token, { method: "POST", body: raw }), async ({ body }) => body());
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe("The body must be a JSON object.");
  }
});
