# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Snippeta is a single-user cloud library of code snippets. It has two front doors onto the same data layer:
- A Next.js 16 dashboard (App Router, React 19, Tailwind 4) behind a password login.
- An MCP endpoint at `/api/mcp` (Streamable HTTP, bearer-token auth) that coding agents call to search, fetch, create, update and restore snippets.

The package manager is Bun (`bun.lock`).

## Commands

```bash
bun install
cp .env.example .env.local   # set ADMIN_PASSWORD and SESSION_SECRET
bun run dev                  # next dev
bun run build / bun run start
bun run typecheck            # tsc --noEmit
bun run test                 # bun test lib (in-memory PGlite, no DB needed)
bun test lib/snippets.test.ts -t "slugify"   # a single test or describe block by name
```

If `DATABASE_URL` is unset, the app uses PGlite (Postgres compiled to WASM) and stores data in `.data/pglite`. If it is set, the app uses Neon's HTTP driver. Other env vars: `ADMIN_PASSWORD`, `SESSION_SECRET` (falls back to `ADMIN_PASSWORD`), `SNIPPETA_TIMEZONE` (default `Australia/Sydney`), and `SNIPPETA_ENCRYPTION_KEY` (32 bytes base64, needed only for credentials).

## Architecture

**Data layer (`lib/`)**: all business logic lives here and takes a `Db` as its first argument. This lets tests pass an in-memory PGlite, while the app passes `getDb()`.
- `lib/db.ts`: a minimal `Db { query(text, params) }` interface with two drivers. The schema is a list of `CREATE ... IF NOT EXISTS` statements that runs on first use, so there are no migration files. To change the schema, edit `SCHEMA` and make sure every statement stays idempotent.
- **No interactive transactions.** Neon's HTTP driver can't hold one open, so each write must be a single SQL statement. Multi-table writes use CTEs (`WITH s AS (INSERT/UPDATE ... RETURNING) INSERT ...`). Keep to this pattern.
- `lib/snippets.ts`: CRUD and versioning. `snippets` holds the latest metadata and `current_version`. `snippet_versions` holds a **full snapshot** of every version (not deltas), including files, instructions and dependencies, which are stored as jsonb.
  - `insertVersion` bumps the version with `WHERE current_version = expected` as an optimistic lock. If a concurrent save wins, this one throws a `SnippetError("conflict")`. `baseVersion` in a patch gives agents the same protection explicitly.
  - An update that leaves every content field unchanged saves nothing (`changed: false`).
  - A restore never rewrites history. It saves a copy of the old version as a new version.
  - Errors callers are meant to see are `SnippetError` with code `not_found | conflict | invalid`. Anything else is treated as a server error.
- `lib/validation.ts`: Zod schemas (Zod 4) shared by the dashboard and MCP. They cover slug format, size caps and the dedupe of tags and dependencies.
- `lib/languages.ts`: the allowed language ids. Each id doubles as its Shiki grammar name, and file extensions map to languages.
- `lib/diff.ts`: version-to-version diffs of metadata fields and per-file unified diffs. The dashboard's `DiffView` uses these, and so does the MCP `diff_snippet_versions` tool.
- `lib/tokens.ts`: MCP API tokens (`snp_...`). Only the SHA-256 hash is stored, and `verifyToken` also updates `last_used_at`.

**MCP (`lib/mcp.ts` + `app/api/mcp/route.ts`)**: `registerTools` registers the tools on `mcp-handler` / `@modelcontextprotocol/server`. `SERVER_INSTRUCTIONS` is the guidance agents receive. Tool output is formatted markdown text, not JSON. Every handler is wrapped in `run()`, which turns a `SnippetError` into an `isError` result. Each version records who saved it in its `source` field: `mcp:<token name>` for agents, `web` for the dashboard. Deleting a snippet is deliberately **not** exposed over MCP.

**Auth has two layers**:
- `proxy.ts` (the Next 16 replacement for middleware) does an optimistic redirect to `/login` using the HMAC-signed session cookie from `lib/session.ts`. The proxy runs without a database, so the session check is pure crypto. `/login` and `/api/mcp` are excluded from its matcher.
- `requireAuth()` in `lib/auth.ts` is the real guard. Every server action in `app/actions.ts` and every protected page must call it.
- `/api/mcp` uses bearer tokens through `withMcpAuth` instead.

**Dashboard (`app/`)**: pages under the `(app)` route group are server components that call `lib/` directly. Mutations go through the server actions in `app/actions.ts`. The snippet form sends all its fields as a single JSON `payload` form field so the file list stays structured.

**Build config** (`next.config.ts`): PGlite must remain in `serverExternalPackages`, because bundling it breaks its WASM file lookups. `outputFileTracingRoot` and the Turbopack root are pinned to this directory because a parent directory has its own lockfile. On Vercel, the project's Root Directory is `snippeta`.
