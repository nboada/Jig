# Native App API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a personal SwiftUI iPhone app sign in to a Jig through OAuth and read and edit snippets and notes over a JSON API at `/api/v1`.

**Architecture:** The OAuth server learns two things: private-use (reverse-domain) redirect schemes, and an `app` scope stored on codes and grants. `lib/api.ts` holds one plain function per API operation over the existing `lib/` data functions and stays key-free, like `lib/mcp.ts`. `lib/api-http.ts` does bearer auth, JSON parsing and error mapping. Thin route files under `app/api/v1/` wire paths to it.

**Tech Stack:** Next.js 16 route handlers, Bun test with in-memory PGlite, Zod 4 (already in `lib/validation.ts`).

**Spec:** `docs/superpowers/specs/2026-10-02-native-api-design.md`

## Global Constraints

- Every schema change is an idempotent statement in `SCHEMA` in `lib/db.ts` (`ADD COLUMN IF NOT EXISTS ... DEFAULT`), since existing deploys apply it on their next request.
- Each write is a single SQL statement (Neon HTTP has no interactive transactions).
- `lib/api.ts` must never import `credentials`, `crypto`, `shares` or `locked-notes`, directly or indirectly.
- The API hides locked notes (lists skip them; every per-note route answers 404 "No note with the slug"), never touches credentials, and has no delete.
- `/api/v1` accepts only OAuth access tokens whose grant has scope `app`. `jig_` API tokens are refused there.
- Clients that send no `scope` get `mcp`, exactly as today. `app` grants also work on `/api/mcp`.
- Writes record `source` as `app:<grant name>`.
- Error body: `{ "error": { "code", "message" } }`. Mapping: `invalid` → 400, `not_found` → 404, `conflict` → 409, bad or missing token → 401 with `WWW-Authenticate: Bearer error="invalid_token"`, anything else → 500 with the message "Something went wrong. Try again."
- Code comments only for a non-obvious why. Match the surrounding style.
- **No commits or pushes.** The user commits when they say so (pushing master deploys). Each task ends with tests passing and the change left in the working tree.

## Review Focus

1. **Route params arrive URL-encoded or malformed** (a slug like `Foo Bar`, `../x`, or `v=abc`). Expect 404 or 400, never a 500. Pinned by the "bad input" test in Task 3.
2. **A body that is valid JSON but not an object** (`[]`, `null`, `"x"`) or isn't JSON at all. Expect 400 "The body must be a JSON object." Pinned in Task 4.
3. **A locked note reached by any route, including diff and restore with a valid version.** Expect 404, not 400, so the API never confirms the note exists. Pinned in Task 3.
4. **A refreshed token losing its scope.** After `refreshTokens`, an `app` grant must still be `app`. Pinned in Task 1.
5. **Tag counts leaking locked notes' tags.** `/api/v1/tags` must count only unlocked notes. Pinned in Task 3.

---

### Task 1: OAuth custom schemes and the `app` scope

**Files:**
- Modify: `lib/oauth.ts` (`SCOPE`, `allowedRedirect`, `AuthorizeRequest`, `checkAuthorizeRequest`, `approve`, `tokens`, `exchangeCode`, `refreshTokens`, `verifyAccessToken`)
- Modify: `lib/db.ts` (append two statements to `SCHEMA`)
- Modify: `lib/oauth-http.ts` (`scopes_supported` in both metadata functions)
- Modify: `app/api/mcp/route.ts` (pass the grant's scope)
- Test: `lib/oauth.test.ts`

**Interfaces:**
- Produces:
  - `export const SCOPES = ["mcp", "app"] as const; export type Scope = (typeof SCOPES)[number];`. `SCOPE` stays exported as `"mcp"`, the default.
  - `verifyAccessToken(db, token): Promise<{ name: string; expiresAt: number; scope: Scope } | null>`
  - `AuthorizeRequest` gains `scope: Scope`.
  - The `Tokens.scope` field carries the grant's scope.

- [ ] **Step 1: Write the failing tests** (append inside `describe("oauth", ...)` in `lib/oauth.test.ts`)

```ts
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test lib/oauth.test.ts`
Expected: FAIL. `allowedRedirect(APP_CALLBACK)` is false, `request.scope` is undefined.

- [ ] **Step 3: Add the schema columns** (append to the `SCHEMA` array in `lib/db.ts`, after the `oauth_grants` table)

```ts
  `ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'mcp'`,
  `ALTER TABLE oauth_grants ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'mcp'`,
```

- [ ] **Step 4: Implement in `lib/oauth.ts`**

Replace `export const SCOPE = "mcp";` with:

```ts
export const SCOPES = ["mcp", "app"] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPE: Scope = "mcp";
```

Replace `allowedRedirect`:

```ts
// RFC 8252 §7.1: native apps use a private-use scheme in reverse-domain form, with no host.
const APP_SCHEME = /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:$/;

export function allowedRedirect(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return APP_SCHEME.test(url.protocol) && !url.host && uri.startsWith(`${url.protocol}/`) && !uri.startsWith(`${url.protocol}//`);
}

export const isAppRedirect = (uri: string) => !/^https?:/.test(uri);
```

In `AuthorizeRequest` add `scope: Scope;`. In `checkAuthorizeRequest`, before the `resource` check, add:

```ts
  const scope = (params.scope?.trim() || SCOPE) as Scope;
  if (!SCOPES.includes(scope)) return back("invalid_scope", `The scope must be one of: ${SCOPES.join(", ")}.`);
```

and return `{ client, redirectUri, codeChallenge: params.code_challenge, state: params.state, resource: params.resource, scope }`.

In `approve`, store the scope:

```ts
     INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, resource, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5, $7, now() + make_interval(secs => $6))`,
    [await sha256(code), request.client.id, request.redirectUri, request.codeChallenge, request.resource ?? null, CODE_TTL_SECONDS, request.scope],
```

Change `tokens` to take the scope:

```ts
function tokens(access: string, refresh: string, scope: string): Tokens {
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope };
}
```

In `exchangeCode`, copy the scope to the grant and return it:

```ts
     INSERT INTO oauth_grants (id, client_id, name, access_hash, access_expires_at, refresh_hash, scope)
     SELECT $2, c.client_id, cl.name, $3, now() + make_interval(secs => $4), $5, c.scope
     ...
     RETURNING id, scope`,
```

and replace the `return tokens(access, refresh);` with `return tokens(access, refresh, rows[0].scope as string);`.

In `refreshTokens`, change `RETURNING id` to `RETURNING id, scope` and return `tokens(access, refresh, rows[0].scope as string)`.

In `verifyAccessToken`, select and return the scope:

```ts
  const rows = await db.query<{ name: string; access_expires_at: string; scope: Scope }>(
    `WITH used AS (...unchanged...)
     SELECT name, access_expires_at, scope FROM oauth_grants WHERE access_hash = $1 AND access_expires_at > now()`,
    [await sha256(token)],
  );
  if (!rows[0]) return null;
  return { name: rows[0].name, expiresAt: Math.floor(new Date(rows[0].access_expires_at).getTime() / 1000), scope: rows[0].scope };
```

- [ ] **Step 5: Update metadata and the MCP route**

In `lib/oauth-http.ts`, import `SCOPES` instead of `SCOPE` and set `scopes_supported: [...SCOPES]` in both `protectedResourceMetadata` and `authorizationServerMetadata`.

In `app/api/mcp/route.ts`, change the OAuth branch to:

```ts
    return app ? { token: bearer, clientId: app.name, scopes: [app.scope], expiresAt: app.expiresAt } : undefined;
```

and drop the now-unused `SCOPE` import.

- [ ] **Step 6: Run the tests**

Run: `bun test lib/oauth.test.ts && bun run typecheck`
Expected: all pass, no type errors.

---

### Task 2: Consent page wording for apps and the `app` scope

**Files:**
- Modify: `app/oauth/authorize/page.tsx`

**Interfaces:**
- Consumes: `isAppRedirect(uri)` and `AuthorizeRequest.scope` from Task 1.

- [ ] **Step 1: Show where approval goes for an app redirect**

Import `isAppRedirect` from `@/lib/oauth`. Replace the paragraph under the heading with:

```tsx
              <p className="text-body text-text-2">
                {isAppRedirect(request.redirectUri) ? (
                  <>
                    {"Approving sends access back to the app that registered "}
                    <span className="font-mono text-text">{new URL(request.redirectUri).protocol.slice(0, -1)}</span>
                    {" on this device. Only allow it if you just started signing in from that app."}
                  </>
                ) : (
                  <>
                    {"Approving sends access back to "}
                    <span className="font-mono text-text">{new URL(request.redirectUri).host}</span>
                    {". Only allow it if you just started connecting from there."}
                  </>
                )}
              </p>
```

The "It will be able to" list already matches the `app` scope (search, read, create and update snippets and notes; no credentials, locked notes or deletes), so leave it as is.

- [ ] **Step 2: Check it**

Run: `bun run typecheck && bun test lib/guards.test.ts`
Expected: pass. The manual check of the page is in Task 5.

---

### Task 3: `lib/api.ts`, the API operations

**Files:**
- Create: `lib/api.ts`
- Modify: `lib/notes.ts` (`listNoteTags` gains `hideLocked`)
- Test: `lib/api.test.ts`

**Interfaces:**
- Consumes: `listSnippets`, `getSnippet`, `createSnippet`, `updateSnippet`, `listVersions`, `getVersionPair`, `restoreVersion`, `listTags`, `SnippetError` (`lib/snippets.ts`); the note equivalents (`lib/notes.ts`); `compareVersions` and `compareNotes` (`lib/diff.ts`); `parseSort` (`lib/sort.ts`).
- Produces (all `async`; every one throws `SnippetError` for caller-visible problems):
  - `type Body = Record<string, unknown>`
  - `snippetsApi.list(db, q: URLSearchParams): SnippetSummary[]`
  - `snippetsApi.get(db, slug, q): Snippet`
  - `snippetsApi.create(db, body: Body, source): Snippet`
  - `snippetsApi.update(db, slug, body, source): { snippet: Snippet; changed: boolean }`
  - `snippetsApi.versions(db, slug): VersionSummary[]`
  - `snippetsApi.diff(db, slug, q): VersionDiff`
  - `snippetsApi.restore(db, slug, body, source): Snippet`
  - `notesApi` has the same seven, with `Note` / `NoteSummary` / `NoteVersionSummary`, and `update` returns `{ note, changed }`.
  - `tagsApi(db): { snippets: TagCount[]; notes: TagCount[] }`

- [ ] **Step 1: Write the failing tests** (`lib/api.test.ts`)

```ts
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { notesApi, snippetsApi, tagsApi } from "./api";
import { pgliteDb, prepare, type Db } from "./db";
import { SnippetError } from "./snippets";

let db: Db;
const SOURCE = "app:Jig for iPhone";
const q = (init: Record<string, string> = {}) => new URLSearchParams(init);
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e) => (e instanceof SnippetError ? e.code : "server"),
  );

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE snippets, snippet_versions, notes, note_versions`);
});

const debounce = {
  title: "Debounce",
  language: "javascript",
  tags: ["util"],
  files: [{ name: "debounce.js", content: "export const debounce = () => {};" }],
  message: "First",
};

describe("snippets api", () => {
  test("create, list, get, update, history, diff and restore", async () => {
    const created = await snippetsApi.create(db, debounce, SOURCE);
    expect(created.slug).toBe("debounce");

    expect((await snippetsApi.list(db, q({ q: "debo" }))).map((s) => s.slug)).toEqual(["debounce"]);
    expect((await snippetsApi.list(db, q({ tag: "util", sort: "title" }))).length).toBe(1);

    const { snippet, changed } = await snippetsApi.update(
      db,
      "debounce",
      { files: [{ name: "debounce.js", content: "export const debounce = (fn) => fn;" }], baseVersion: 1, message: "Pass fn" },
      SOURCE,
    );
    expect(changed).toBe(true);
    expect(snippet.version).toBe(2);

    expect((await snippetsApi.get(db, "debounce", q({ v: "1" }))).version).toBe(1);
    const versions = await snippetsApi.versions(db, "debounce");
    expect(versions.map((v) => [v.version, v.source])).toEqual([
      [2, SOURCE],
      [1, SOURCE],
    ]);

    const diff = await snippetsApi.diff(db, "debounce", q({ from: "1" }));
    expect(diff.files.length).toBe(1);

    const restored = await snippetsApi.restore(db, "debounce", { version: 1 }, SOURCE);
    expect(restored.version).toBe(3);
    expect(restored.files[0].content).toBe(debounce.files[0].content);
  });

  test("conflicts, no-op updates and missing snippets", async () => {
    await snippetsApi.create(db, debounce, SOURCE);
    await snippetsApi.update(db, "debounce", { title: "Debounce 2" }, SOURCE);
    expect(await code(snippetsApi.update(db, "debounce", { title: "Stale", baseVersion: 1 }, SOURCE))).toBe("conflict");
    expect((await snippetsApi.update(db, "debounce", { title: "Debounce 2" }, SOURCE)).changed).toBe(false);
    expect(await code(snippetsApi.get(db, "nope", q()))).toBe("not_found");
    expect(await code(snippetsApi.versions(db, "nope"))).toBe("not_found");
  });

  test("bad input is invalid or not found, never a server error", async () => {
    await snippetsApi.create(db, debounce, SOURCE);
    expect(await code(snippetsApi.get(db, "debounce", q({ v: "abc" })))).toBe("invalid");
    expect(await code(snippetsApi.get(db, "debounce", q({ v: "0" })))).toBe("invalid");
    expect(await code(snippetsApi.get(db, "debounce", q({ v: "99" })))).toBe("not_found");
    expect(await code(snippetsApi.get(db, "Foo Bar", q()))).toBe("not_found");
    expect(await code(snippetsApi.get(db, "../x", q()))).toBe("not_found");
    expect(await code(snippetsApi.diff(db, "debounce", q()))).toBe("invalid");
    expect(await code(snippetsApi.restore(db, "debounce", {}, SOURCE))).toBe("invalid");
    expect(await code(snippetsApi.restore(db, "debounce", { version: "1" }, SOURCE))).toBe("invalid");
    expect(await code(snippetsApi.create(db, { title: "" }, SOURCE))).toBe("invalid");
  });
});

describe("notes api", () => {
  test("create, list, get, update, history, diff and restore", async () => {
    await notesApi.create(db, { title: "Deploy checklist", body: "1. Build", tags: ["ops"] }, SOURCE);
    expect((await notesApi.list(db, q({ q: "deploy" }))).map((n) => n.slug)).toEqual(["deploy-checklist"]);
    const { note, changed } = await notesApi.update(db, "deploy-checklist", { body: "1. Build\n2. Ship", baseVersion: 1 }, SOURCE);
    expect([note.version, changed]).toEqual([2, true]);
    expect((await notesApi.get(db, "deploy-checklist", q({ v: "1" }))).body).toBe("1. Build");
    expect((await notesApi.versions(db, "deploy-checklist")).length).toBe(2);
    expect((await notesApi.diff(db, "deploy-checklist", q({ from: "1", to: "2" }))).files.length).toBe(1);
    expect((await notesApi.restore(db, "deploy-checklist", { version: 1, message: "Back" }, SOURCE)).version).toBe(3);
  });

  test("locked notes don't exist, even with a valid version", async () => {
    await notesApi.create(db, { title: "Plugin keys", body: "ACF: abc123", tags: ["secret-tag"] }, SOURCE);
    await notesApi.update(db, "plugin-keys", { body: "ACF: def456" }, SOURCE);
    await db.query(`UPDATE notes SET locked_at = now()`);

    expect(await notesApi.list(db, q())).toEqual([]);
    expect(await notesApi.list(db, q({ q: "plugin" }))).toEqual([]);
    for (const attempt of [
      notesApi.get(db, "plugin-keys", q()),
      notesApi.get(db, "plugin-keys", q({ v: "1" })),
      notesApi.update(db, "plugin-keys", { body: "x" }, SOURCE),
      notesApi.versions(db, "plugin-keys"),
      notesApi.diff(db, "plugin-keys", q({ from: "1", to: "2" })),
      notesApi.restore(db, "plugin-keys", { version: 1 }, SOURCE),
    ]) {
      expect(await code(attempt)).toBe("not_found");
    }
    expect((await tagsApi(db)).notes).toEqual([]);
  });
});

test("tags counts snippets and unlocked notes", async () => {
  await snippetsApi.create(db, debounce, SOURCE);
  await notesApi.create(db, { title: "Ops", body: "x", tags: ["ops"] }, SOURCE);
  expect(await tagsApi(db)).toEqual({ snippets: [{ tag: "util", count: 1 }], notes: [{ tag: "ops", count: 1 }] });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test lib/api.test.ts`
Expected: FAIL with `Cannot find module './api'`.

- [ ] **Step 3: Let `listNoteTags` skip locked notes** (`lib/notes.ts`)

```ts
export async function listNoteTags(db: Db, { hideLocked = false }: { hideLocked?: boolean } = {}): Promise<{ tag: string; count: number }[]> {
  const rows = await db.query<{ tag: string; count: number | string }>(
    `SELECT tag, count(*) AS count FROM notes, jsonb_array_elements_text(tags) AS tag
     ${hideLocked ? "WHERE locked_at IS NULL" : ""}
     GROUP BY tag ORDER BY count(*) DESC, tag`,
  );
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}
```

- [ ] **Step 4: Write `lib/api.ts`**

```ts
import type { Db } from "./db";
import { compareNotes, compareVersions } from "./diff";
import {
  createNote,
  getNote,
  getNoteVersionPair,
  listNotes,
  listNoteTags,
  listNoteVersions,
  restoreNoteVersion,
  updateNote,
} from "./notes";
import { parseSort } from "./sort";
import {
  createSnippet,
  getSnippet,
  getVersionPair,
  listSnippets,
  listTags,
  listVersions,
  restoreVersion,
  SnippetError,
  updateSnippet,
} from "./snippets";
import type { NoteInput, NotePatch, SnippetInput, SnippetPatch } from "./validation";

export type Body = Record<string, unknown>;

const text = (q: URLSearchParams, key: string) => q.get(key)?.trim() || undefined;

function version(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && !/^\d+$/.test(value)) throw new SnippetError(`${name} must be a whole number.`, "invalid");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new SnippetError(`${name} must be a whole number of at least 1.`, "invalid");
  return n;
}

function required(n: number | undefined, name: string): number {
  if (n === undefined) throw new SnippetError(`${name} is required.`, "invalid");
  return n;
}

function bodyVersion(body: Body): number {
  if (typeof body.version !== "number") throw new SnippetError("version must be a number.", "invalid");
  return required(version(body.version, "version"), "version");
}

const message = (body: Body) => (typeof body.message === "string" ? body.message : undefined);
const missing = (kind: string, slug: string) => new SnippetError(`No ${kind} with the slug "${slug}".`, "not_found");

export const snippetsApi = {
  list: (db: Db, q: URLSearchParams) =>
    listSnippets(db, { query: text(q, "q"), language: text(q, "language"), tag: text(q, "tag"), sort: parseSort(q.get("sort")) }),

  async get(db: Db, slug: string, q: URLSearchParams) {
    const snippet = await getSnippet(db, slug, version(q.get("v"), "v"));
    if (!snippet) throw missing("snippet", slug);
    return snippet;
  },

  create: (db: Db, body: Body, source: string) => createSnippet(db, body as SnippetInput, source),

  update: (db: Db, slug: string, body: Body, source: string) => updateSnippet(db, slug, body as SnippetPatch, source),

  versions: (db: Db, slug: string) => listVersions(db, slug),

  async diff(db: Db, slug: string, q: URLSearchParams) {
    const from = required(version(q.get("from"), "from"), "from");
    const [a, b] = await getVersionPair(db, slug, from, version(q.get("to"), "to"));
    return compareVersions(a, b);
  },

  restore: (db: Db, slug: string, body: Body, source: string) => restoreVersion(db, slug, bodyVersion(body), source, message(body)),
};

async function readableNote(db: Db, slug: string) {
  const note = await getNote(db, slug);
  if (!note || note.locked) throw missing("note", slug);
}

export const notesApi = {
  list: (db: Db, q: URLSearchParams) =>
    listNotes(db, { query: text(q, "q"), tag: text(q, "tag"), sort: parseSort(q.get("sort")), hideLocked: true }),

  async get(db: Db, slug: string, q: URLSearchParams) {
    await readableNote(db, slug);
    const note = await getNote(db, slug, version(q.get("v"), "v"));
    if (!note) throw missing("note", slug);
    return note;
  },

  create: (db: Db, body: Body, source: string) => createNote(db, body as NoteInput, source),

  async update(db: Db, slug: string, body: Body, source: string) {
    await readableNote(db, slug);
    return updateNote(db, slug, body as NotePatch, source);
  },

  async versions(db: Db, slug: string) {
    await readableNote(db, slug);
    return listNoteVersions(db, slug);
  },

  async diff(db: Db, slug: string, q: URLSearchParams) {
    await readableNote(db, slug);
    const from = required(version(q.get("from"), "from"), "from");
    const [a, b] = await getNoteVersionPair(db, slug, from, version(q.get("to"), "to"));
    return compareNotes(a, b);
  },

  async restore(db: Db, slug: string, body: Body, source: string) {
    await readableNote(db, slug);
    return restoreNoteVersion(db, slug, bodyVersion(body), source, message(body));
  },
};

export async function tagsApi(db: Db) {
  const [snippets, notes] = await Promise.all([listTags(db), listNoteTags(db, { hideLocked: true })]);
  return { snippets, notes };
}
```

Notes for the implementer:
- `updateSnippet` and `listVersions` already throw `SnippetError("not_found")` for unknown slugs (via `requireSnippet`), so they need no pre-check.
- `getSnippet`/`getNote` return `null` for unknown slugs, including malformed ones like `Foo Bar`. If either throws a non-`SnippetError` on a malformed slug, guard with `slugSchema.safeParse(slug).success` and throw `missing(...)` before querying.
- If a missing version makes `getVersionPair` throw something other than `SnippetError("not_found")`, map it to `not_found` here. The test pins the expected codes.

- [ ] **Step 5: Run the tests**

Run: `bun test lib/api.test.ts && bun run typecheck`
Expected: all pass. Adjust the implementation, not the tests, if a code comes back different.

---

### Task 4: HTTP layer, routes, proxy and import guard

**Files:**
- Create: `lib/api-http.ts`
- Create: `app/api/v1/route.ts`
- Create: `app/api/v1/tags/route.ts`
- Create: `app/api/v1/snippets/route.ts`, `app/api/v1/snippets/[slug]/route.ts`, `app/api/v1/snippets/[slug]/versions/route.ts`, `app/api/v1/snippets/[slug]/diff/route.ts`, `app/api/v1/snippets/[slug]/restore/route.ts`
- Create: the same five under `app/api/v1/notes/`
- Modify: `proxy.ts` (matcher)
- Modify: `lib/mcp.test.ts` (walk `api.ts` too)
- Test: `lib/api-http.test.ts`

**Interfaces:**
- Consumes: `snippetsApi`, `notesApi`, `tagsApi`, `Body` (Task 3); `verifyAccessToken` returning `scope` (Task 1); `verifyToken` (`lib/tokens.ts`).
- Produces:
  - `authorize(db, req): Promise<{ source: string } | null>`
  - `respond(db, req, fn: (ctx: { source: string; body: () => Promise<Body> }) => Promise<unknown>, status?: number): Promise<Response>`

- [ ] **Step 1: Write the failing tests** (`lib/api-http.test.ts`)

```ts
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
    req(token, { method: "POST", body: JSON.stringify({ title: "Hi", files: [{ name: "a.js", content: "1" }] }) }),
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test lib/api-http.test.ts`
Expected: FAIL with `Cannot find module './api-http'`.

- [ ] **Step 3: Write `lib/api-http.ts`**

```ts
import type { Body } from "./api";
import type { Db } from "./db";
import { verifyAccessToken } from "./oauth";
import { SnippetError } from "./snippets";

const STATUS = { invalid: 400, not_found: 404, conflict: 409 } as const;

function reply(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

const failure = (code: string, message: string, status: number, headers?: Record<string, string>) =>
  reply({ error: { code, message } }, status, headers);

export async function authorize(db: Db, req: Request): Promise<{ source: string } | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const grant = await verifyAccessToken(db, bearer);
  return grant?.scope === "app" ? { source: `app:${grant.name}` } : null;
}

async function readBody(req: Request): Promise<Body> {
  const value = await req.json().catch(() => undefined);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SnippetError("The body must be a JSON object.", "invalid");
  }
  return value as Body;
}

export async function respond(
  db: Db,
  req: Request,
  fn: (ctx: { source: string; body: () => Promise<Body> }) => Promise<unknown>,
  status = 200,
): Promise<Response> {
  const auth = await authorize(db, req);
  if (!auth) {
    return failure("unauthorized", "Sign in to Jig again.", 401, { "WWW-Authenticate": 'Bearer error="invalid_token"' });
  }
  try {
    return reply(await fn({ source: auth.source, body: () => readBody(req) }), status);
  } catch (error) {
    if (error instanceof SnippetError) return failure(error.code, error.message, STATUS[error.code]);
    console.error("API request failed:", error);
    return failure("server_error", "Something went wrong. Try again.", 500);
  }
}
```

Check `SnippetError`'s `code` type in `lib/snippets.ts` (`not_found | conflict | invalid`); `STATUS[error.code]` must typecheck against it.

- [ ] **Step 4: Run the tests**

Run: `bun test lib/api-http.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the route files**

`app/api/v1/route.ts`:

```ts
export const GET = () => Response.json({ name: "jig", api: 1 }, { headers: { "Cache-Control": "no-store" } });
```

`app/api/v1/tags/route.ts`:

```ts
import { tagsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, () => tagsApi(db));
}
```

`app/api/v1/snippets/route.ts`:

```ts
import { snippetsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const db = await getDb();
  return respond(db, req, () => snippetsApi.list(db, new URL(req.url).searchParams));
}

export async function POST(req: Request) {
  const db = await getDb();
  return respond(db, req, async ({ source, body }) => snippetsApi.create(db, await body(), source), 201);
}
```

`app/api/v1/snippets/[slug]/route.ts`:

```ts
import { snippetsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/snippets/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => snippetsApi.get(db, slug, new URL(req.url).searchParams));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/v1/snippets/[slug]">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, async ({ source, body }) => snippetsApi.update(db, slug, await body(), source));
}
```

`app/api/v1/snippets/[slug]/versions/route.ts`:

```ts
import { snippetsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/snippets/[slug]/versions">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => snippetsApi.versions(db, slug));
}
```

`app/api/v1/snippets/[slug]/diff/route.ts`:

```ts
import { snippetsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: RouteContext<"/api/v1/snippets/[slug]/diff">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, () => snippetsApi.diff(db, slug, new URL(req.url).searchParams));
}
```

`app/api/v1/snippets/[slug]/restore/route.ts`:

```ts
import { snippetsApi } from "@/lib/api";
import { respond } from "@/lib/api-http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext<"/api/v1/snippets/[slug]/restore">) {
  const [db, { slug }] = await Promise.all([getDb(), ctx.params]);
  return respond(db, req, async ({ source, body }) => snippetsApi.restore(db, slug, await body(), source));
}
```

Create the same five files under `app/api/v1/notes/`, replacing `snippetsApi` with `notesApi` and `/api/v1/snippets/` with `/api/v1/notes/` in every `RouteContext` literal. If `RouteContext` isn't generated yet when typechecking, run `bun run build` once (it generates route types) or fall back to `{ params }: { params: Promise<{ slug: string }> }`.

- [ ] **Step 6: Keep the proxy off `/api/v1`** (`proxy.ts`)

```ts
export const config = {
  matcher: ["/((?!api/mcp|api/v1|_next/static|_next/image).*)"],
};
```

- [ ] **Step 7: Extend the import guard** (`lib/mcp.test.ts`)

Turn the walk into a helper and run it for both entry points:

```ts
  function reachable(entry: string): Set<string> {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      for (const match of source.matchAll(IMPORT_RE)) {
        const candidate = `${match[1]}.ts`;
        if (existsSync(join(import.meta.dir, candidate))) stack.push(candidate);
      }
    }
    return seen;
  }

  for (const entry of ["mcp.ts", "api.ts"]) {
    test(`${entry} does not import the credentials, crypto, shares or locked-notes modules, even indirectly`, () => {
      const seen = reachable(entry);
      expect(seen.has("notes.ts")).toBe(true);
      for (const forbidden of ["credentials.ts", "crypto.ts", "shares.ts", "locked-notes.ts"]) {
        expect(seen.has(forbidden)).toBe(false);
      }
    });
  }
```

This replaces the existing `"mcp.ts does not import ..."` test.

- [ ] **Step 8: Run everything**

Run: `bun run typecheck && bun run test`
Expected: all pass.

---

### Task 5: Docs and an end-to-end check

**Files:**
- Modify: `CLAUDE.md` (Architecture and Auth sections)

- [ ] **Step 1: Document it in `CLAUDE.md`**

After the **MCP** paragraph, add:

```markdown
**App API (`lib/api.ts` + `lib/api-http.ts` + `app/api/v1/`)**: JSON for the iPhone app, over the same `lib/` functions. `lib/api.ts` follows MCP's rules (locked notes hidden, no credentials, no delete), and **must never import `credentials`, `crypto`, `shares` or `locked-notes`**; `lib/mcp.test.ts` checks it too. Only OAuth access tokens whose grant has scope `app` get in (`jig_` tokens are MCP-only); the app signs in with a reverse-domain redirect scheme (`allowedRedirect`), and writes are recorded as `app:<grant name>`. Errors are `{ error: { code, message } }` with 400/404/409/401/500.
```

In the **Auth** list, change the `/api/mcp` bullet's first sentence to: "`/api/mcp` and `/api/v1` use bearer tokens instead (both are outside the proxy matcher)."

- [ ] **Step 2: Run the OAuth flow by hand against a local production build**

Run: `bun run build && PORT=3456 bun run start` in the background, then:

```bash
B=http://localhost:3456
curl -s $B/api/v1                                   # {"name":"jig","api":1}
curl -s -o /dev/null -w "%{http_code}\n" $B/api/v1/snippets   # 401
CLIENT=$(curl -s -X POST $B/oauth/register -H 'Content-Type: application/json' \
  -d '{"client_name":"Jig for iPhone","redirect_uris":["com.example.jig:/oauth"]}' | jq -r .client_id)
VERIFIER=$(openssl rand -base64 48 | tr -d '=+/' | cut -c1-64)
CHALLENGE=$(printf %s "$VERIFIER" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
echo "$B/oauth/authorize?client_id=$CLIENT&redirect_uri=com.example.jig:/oauth&response_type=code&code_challenge=$CHALLENGE&code_challenge_method=S256&scope=app"
```

Open the printed URL in Orca's browser while signed in, check the consent page says "the app that registered com.example.jig", and approve. The browser can't open the custom scheme. Read the `code` from the redirect attempt (Orca `network`, or the URL the page tried to open), then:

```bash
TOKEN=$(curl -s -X POST $B/oauth/token -d grant_type=authorization_code -d code=$CODE -d client_id=$CLIENT \
  -d code_verifier=$VERIFIER -d redirect_uri=com.example.jig:/oauth | jq -r .access_token)
curl -s $B/api/v1/snippets -H "Authorization: Bearer $TOKEN" | jq 'length'
curl -s $B/api/v1/tags -H "Authorization: Bearer $TOKEN"
```

Expected: the token response says `"scope":"app"`, the list returns your snippets, and `/api/mcp` still answers for an existing connector.

- [ ] **Step 3: Final check**

Run: `bun run typecheck && bun run test`
Expected: all pass. Leave the changes uncommitted for the user.
