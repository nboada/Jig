# Native app API: design

Date: 2026-10-02
Status: draft, awaiting review

## Goal

Give a personal SwiftUI iPhone app (distributed through TestFlight) a way to read and edit the snippets and notes in a user's Jig. This spec covers the server side only. The iOS app gets its own spec once this lands.

Success: from the iPhone app you can sign in to your own Jig through the browser sheet, then list, search, read, create, edit, diff and restore snippets and notes. Nothing else in Jig changes behaviour, and the MCP endpoint keeps working as it does today.

## Scope

In scope for this spec:
- A JSON API at `/api/v1` for snippets and notes.
- Native sign-in through the existing OAuth server: custom-scheme redirects and an `app` scope.
- The consent page wording for native apps and for the `app` scope.

Not in this spec (later sub-projects):
- Locked notes and credentials. They need an unlock token tied to a grant (see "Later").
- Delete, pin, clone, trash, share links, AI check, settings.
- The SwiftUI app itself.

## Decisions

1. **Same rules as MCP.** The API hides locked notes, never touches credentials and can't delete. `lib/api.ts` must not import `credentials`, `crypto`, `shares` or `locked-notes`, directly or indirectly. The existing import check in `lib/mcp.test.ts` is extended to cover it.
2. **OAuth only, not `jig_` tokens.** `/api/v1` accepts only OAuth access tokens whose grant has the `app` scope. API tokens stay MCP-only, so a token pasted into an agent can't drive the app API.
3. **The `app` scope includes `mcp`.** An `app` grant also works on `/api/mcp`. Clients that don't ask for a scope get `mcp`, as today.
4. **Plain JSON, one shape per resource.** It reuses the `lib/` types (`SnippetSummary`, `Snippet`, `NoteSummary`, `Note`, `VersionSummary`, `VersionDiff`) as they are, so the server stays a thin layer.

## OAuth changes (`lib/oauth.ts`, `lib/db.ts`)

- `allowedRedirect` also accepts a private-use URI scheme in reverse-domain form, as RFC 8252 §7.1 describes: the scheme must contain a dot (e.g. `com.example.jig:/oauth`), with no host, user or fragment. Plain schemes like `myapp:` or `javascript:` stay rejected.
- Schema (idempotent): `ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'mcp'`, and the same for `oauth_grants`.
- `checkAuthorizeRequest` reads `scope` as a space-separated list (MCP SDK clients send every advertised scope). Any word other than `mcp` or `app` redirects back with `invalid_scope`; the grant gets `app` if it was asked for, otherwise `mcp`. `approve` stores the scope on the code, `exchangeCode` copies it to the grant, and the token response returns it.
- `verifyAccessToken` also returns `scope`. The MCP route accepts both scopes; `/api/v1` requires `app`.
- Discovery metadata: the authorization server lists `mcp` and `app`; the `/api/mcp` protected-resource document lists only `mcp`, so MCP connectors never ask for `app`.

## Consent page (`app/oauth/authorize/page.tsx`)

- For a custom-scheme redirect, the line about where approval goes says "Approving sends access back to the app that registered `com.example.jig`", instead of showing an empty host.
- For the `app` scope, the "It will be able to" list matches the API: search, read, create and update snippets and notes. The "can't see credentials or locked notes, or delete anything" line stays.

## API (`lib/api.ts` + thin route files under `app/api/v1/`)

All routes need `Authorization: Bearer <access token>` with the `app` scope, except `GET /api/v1`. Bodies and responses are JSON.

| Method | Path | Does | Calls |
|---|---|---|---|
| GET | `/api/v1` | Unauthenticated check that this URL is a Jig: `{ name: "jig", api: 1 }` | — |
| GET | `/api/v1/snippets?q=&language=&tag=&sort=` | List or search | `listSnippets` |
| POST | `/api/v1/snippets` | Create; body `SnippetInput` plus `message` | `createSnippet` |
| GET | `/api/v1/snippets/:slug?v=` | One snippet, latest or a version | `getSnippet` |
| PATCH | `/api/v1/snippets/:slug` | Update; body `SnippetPatch` (with `baseVersion`); returns `{ snippet, changed }` | `updateSnippet` |
| GET | `/api/v1/snippets/:slug/versions` | History | `listVersions` |
| GET | `/api/v1/snippets/:slug/diff?from=&to=` | Diff between versions (`to` defaults to latest) | `getVersionPair` + `compareVersions` |
| POST | `/api/v1/snippets/:slug/restore` | Body `{ version, message? }` | `restoreVersion` |
| … | `/api/v1/notes/...` | The same seven routes for notes, with locked notes hidden or refused like MCP | the `notes.ts` equivalents |
| GET | `/api/v1/tags` | `{ snippets, notes }` tag counts for filters | `listTags`, `listNoteTags` |

- **Source.** Writes record `source` as `app:<grant name>`; the history views already show sources.
- **Errors.** `{ error: { code, message } }`, mapped as follows:
  - `invalid` → 400, `not_found` → 404, `conflict` → 409
  - a missing, wrong-scope or expired token → 401 with `WWW-Authenticate: Bearer error="invalid_token"`
  - anything else → 500 with a generic message
- **Structure.** `lib/api.ts` exports one function per operation taking `(db, input)` and returning plain data, plus `handle(req, fn)`, which does auth, JSON parsing and error mapping. Route files only wire the path to the function.
- **Proxy.** The `proxy.ts` matcher excludes `api/v1` the way it excludes `api/mcp`, so bearer requests aren't redirected to `/login`.
- **Validation.** It reuses the Zod schemas in `lib/validation.ts`, so size caps and slug rules match the dashboard and MCP.

## Testing

- `lib/oauth.test.ts`:
  - custom schemes: reverse-domain accepted; `myapp:`, `javascript:`, and a scheme with a host or fragment rejected
  - scope round trip: authorize, code, grant, token response, verify
  - `invalid_scope`
  - `mcp` stays the default
- `lib/api.test.ts` (in-memory PGlite), covering each operation, plus:
  - locked notes hidden and refused
  - `baseVersion` conflict → 409
  - unchanged update → `changed: false`
  - restore makes a new version
  - wrong-scope token → 401
- `lib/mcp.test.ts`: the forbidden-import check also walks `lib/api.ts`.
- Manual: run the OAuth flow with curl using a custom-scheme redirect, then call each route.

## Later (separate specs)

- **Unlock token.** A short-lived token tied to the grant, obtained with the dashboard password (rate limited like login) or through a web passkey page in the browser sheet. It opens locked notes and credential reveal for the app.
- **More API.** Pin, clone, delete to trash and restore from trash, then credentials once unlock exists.
- **The SwiftUI app.** First launch takes your Jig URL, checked with `GET /api/v1`; sign-in uses `ASWebAuthenticationSession`, with tokens in the Keychain. Then browsing, a Runestone editor, markdown notes, history and diff, and a share extension.
