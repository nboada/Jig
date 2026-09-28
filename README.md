# Snippeta

A cloud library of reusable code snippets (JavaScript, PHP, CSS, Liquid and more) that your AI agents can reach over MCP. Ask Claude Code, Codex or Kimi to "add the GSAP snippet from Snippeta" and they fetch it, install its dependencies and wire it into the project.

Every edit is saved as a new version, so when a snippet stops working you can see exactly what changed and roll it back, from the dashboard or from an agent.

## What is in here

- **Dashboard** (Next.js 16): search, tags, a multi-file editor, version history with diffs, one-click restore, notes, and encrypted credentials.
- **MCP endpoint** at `/api/mcp` (Streamable HTTP, bearer token auth) with these tools:

| Tool | What it does |
| --- | --- |
| `search_snippets` | Find by keyword, language or tag. Also searches file contents. |
| `get_snippet` | Files, dependencies and integration instructions, latest or any version. Suggests matches for a wrong slug. |
| `create_snippet` | Save a new snippet (one or more files). |
| `update_snippet` | Save a new version. Only changed fields are needed. `baseVersion` stops an agent from overwriting a newer edit. |
| `list_snippet_versions` | History with change notes and who made each change. |
| `diff_snippet_versions` | Unified diff between two versions. |
| `restore_snippet_version` | Roll back by saving an old version as the newest one. Nothing is ever deleted from history. |
| `search_notes` | Find notes by keyword or tag, including the note text. |
| `get_note` | A note's text, latest or any version. |
| `create_note` / `update_note` | Save a note or a new version of one. `baseVersion` works as for snippets. |
| `list_note_versions` / `restore_note_version` | Note history and rollback. |

Deleting a snippet or note is only possible from the dashboard, never from an agent. Credentials are not reachable over MCP at all.

## A snippet

- Title, slug (stable, used by agents), description, primary language, tags
- One or more files, e.g. `lenis.js` and `lenis.css`
- Dependencies to install, e.g. `gsap@^3.13`
- Instructions for agents: where files go, setup steps, gotchas

## Notes and credentials

- **Notes**: free-form markdown with the same version history as snippets. Agents can search, read and save them over MCP.
- **Credentials**: logins and API keys for your own reference. Each has a title, URL, tags, a note and labelled fields, and any field can be marked secret. Secret values are encrypted with `SNIPPETA_ENCRYPTION_KEY` and only shown when you click Reveal or Copy. They are never available over MCP, and there is no history: changing a value replaces it.

## Run locally

```bash
cd snippeta
bun install
cp .env.example .env.local   # set ADMIN_PASSWORD, SESSION_SECRET and SNIPPETA_ENCRYPTION_KEY
bun run dev
```

Without `DATABASE_URL` the app uses PGlite (Postgres in WASM) stored in `.data/`, so there is nothing else to install.

## Deploy to Vercel

1. New Vercel project from this repo, **Root Directory: `snippeta`**. The framework is detected as Next.js and bun is used from `bun.lock`.
2. Storage tab: add a **Neon** Postgres database. This sets `DATABASE_URL`. Tables are created on the first request.
3. Environment variables: `ADMIN_PASSWORD`, `SESSION_SECRET` (`openssl rand -hex 32`), `SNIPPETA_ENCRYPTION_KEY` (`openssl rand -base64 32`, keep a copy: losing it makes saved secrets unreadable), optionally `SNIPPETA_TIMEZONE` (defaults to `Australia/Sydney`).
4. Optional: add a domain such as `snippets.talkk.com.au`.
5. Log in, open **Connect**, create a token per agent and copy the setup command it shows.

## Connect an agent

The Connect page shows these with your URL and token filled in.

```bash
# Claude Code (available in every project)
claude mcp add --transport http --scope user snippeta https://YOUR_DOMAIN/api/mcp \
  --header "Authorization: Bearer snp_..."

# Kimi Code CLI
kimi mcp add --transport http snippeta https://YOUR_DOMAIN/api/mcp \
  --header "Authorization: Bearer snp_..."
```

```toml
# Codex: ~/.codex/config.toml, plus export SNIPPETA_TOKEN=snp_... in your shell profile
[mcp_servers.snippeta]
url = "https://YOUR_DOMAIN/api/mcp"
bearer_token_env_var = "SNIPPETA_TOKEN"
```

Tokens are stored as SHA-256 hashes, shown once, and can be revoked on the Connect page. Each version records which token saved it.

## Scripts

- `bun run dev`, `bun run build`, `bun run start`
- `bun run test`: data layer, diffs and tokens against an in-memory PGlite
- `bun run typecheck`

## Not built yet

- OAuth, which the claude.ai web and desktop connectors need. CLI agents work with bearer tokens today.
- A syntax-highlighting code editor (the editor is a plain textarea with tab indenting).
