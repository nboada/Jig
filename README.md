# Jig

Your own cloud library of reusable code snippets (JavaScript, PHP, CSS, Liquid and more) that your AI agents can reach over MCP. Ask Claude Code, Codex or Kimi to "add the GSAP snippet from Jig" and they fetch it, install its dependencies and wire it into the project.

Every edit is saved as a new version, so when a snippet stops working you can see exactly what changed and roll it back, from the dashboard or from an agent. Jig also keeps versioned notes, and a private list of logins and API keys that agents can never read. Anything can be shared with someone outside through a secret link that expires.

Each person runs their own copy, with their own database. Nothing is shared with anyone else.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnboada%2Fjig&project-name=jig&repository-name=jig&env=ADMIN_PASSWORD%2CJIG_TIMEZONE&envDefaults=%7B%22JIG_TIMEZONE%22%3A%22UTC%22%7D&envDescription=ADMIN_PASSWORD+is+the+password+for+your+dashboard%3B+use+a+long+one.+JIG_TIMEZONE+is+an+IANA+time+zone+for+dates%2C+e.g.+Europe%2FLondon.&envLink=https%3A%2F%2Fgithub.com%2Fnboada%2Fjig%23environment-variables&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

## Get started

1. **Click Deploy with Vercel.** Vercel copies this repository into your GitHub account and creates a free [Neon](https://neon.tech) Postgres database for it. You don't need to set up a database yourself: the tables are created the first time the app runs.
2. **Choose a password** when Vercel asks for `ADMIN_PASSWORD`. Use a long one, since it protects everything in your library. Set `JIG_TIMEZONE` to your time zone, such as `Europe/London` or `America/New_York`.
3. **Open your new site and log in.**
4. **Connect your agents.** Open **Connect**, create a token for each agent and run the setup command it shows.
5. **Optional: turn on credentials.** The first time you open **Credentials**, click **Generate a key**, add it to Vercel as `JIG_ENCRYPTION_KEY` and redeploy. Keep a copy in your password manager.
6. **Recommended: run it next to your database.** In Vercel, open your project's **Settings → Functions → Function Region** and pick the region of your Neon database (shown under **Storage**), then redeploy. Every page makes a few database queries, and with both in the same region each one takes milliseconds instead of a trip across an ocean.

## What you get

- **Snippets**: title, language, one or more files, and optionally dependencies to install and instructions for agents. Files are edited in a code editor with syntax colours, and a **Format** button tidies each file (Prettier for JS/TS, CSS/SCSS, HTML, Vue, JSON, YAML and Markdown, plus PHP, Liquid and SQL). File names follow the snippet's title. Every save is a new version with a diff and one-click restore.
- **Notes**: a rich editor (headings, bold, lists, checklists, quotes, code blocks, links) that saves plain markdown, with the same version history. Agents can search, read and save them.
- **Credentials**: logins and API keys for your own reference, with any field marked secret. Secret values are encrypted and only shown when you click Reveal or Copy. They are never available over MCP.
- **Organising**: each section opens as a list beside the item you're viewing, or as a grid of cards. Sort by recently edited, newest or title; each section remembers its own layout and order. Pin items to keep them at the top, search as you type (code included), and right-click any item to pin, clone, copy the prompt for your agent, share or delete it.
- **Sharing**: send a snippet, note or credential to someone without an account through a secret read-only link. Links can expire (1 hour to never), stop after a number of views, and be turned off at any time. Credential links always need a passcode, sent separately, and lock after 5 wrong tries. Only a hash of each link is stored, so a link is shown once, when you make it.
- **Installable**: in Chrome or Edge, **Install Jig** from the address bar gives it its own window and Dock icon.
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

Snippets and notes can only be deleted from the dashboard, never by an agent. When filtering by language, `javascript` also finds TypeScript, JSX and TSX, and `css` also finds SCSS.

## Keyboard shortcuts

| Key | What it does |
| --- | --- |
| `1` `2` `3` | Snippets, Notes, Credentials |
| `N` | New item in the current section |
| `G` / `L` | Grid or list layout |
| `↑` `↓` | Move through the list |
| `⌘S` | Save, on new and edit pages |

The others are ignored while you type, and on new and edit pages, so they can't throw away unsaved work.

## Connect an agent

The Connect page shows these commands with your URL and token filled in.

```bash
# Claude Code (available in every project)
claude mcp add --transport http --scope user jig https://YOUR_DOMAIN/api/mcp \
  --header "Authorization: Bearer jig_..."

# Kimi Code CLI
kimi mcp add --transport http jig https://YOUR_DOMAIN/api/mcp \
  --header "Authorization: Bearer jig_..."
```

```toml
# Codex: ~/.codex/config.toml, plus export JIG_TOKEN=jig_... in your shell profile
[mcp_servers.jig]
url = "https://YOUR_DOMAIN/api/mcp"
bearer_token_env_var = "JIG_TOKEN"
```

Tokens are stored as SHA-256 hashes, shown once, and can be revoked on the Connect page. Each version records which token saved it.

## Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Yes | The password for your dashboard. After 10 wrong attempts from one address, logins from it are paused for 15 minutes. |
| `DATABASE_URL` | Set for you | Postgres connection string. The Deploy button's Neon database sets it. Leave it empty locally to use a built-in database stored in `.data/`. |
| `JIG_ENCRYPTION_KEY` | For credentials | Encrypts saved secrets: 32 random bytes in base64. The Credentials page generates one for you. If it is lost, saved secrets cannot be recovered. |
| `SESSION_SECRET` | No | Signs the login cookie. Defaults to `ADMIN_PASSWORD`. Set a random value (`openssl rand -hex 32`) if you want changing the password to be independent of sessions. |
| `JIG_TIMEZONE` | No | Time zone for dates in the dashboard, e.g. `Europe/London`. Defaults to `Australia/Sydney`. |

Changing a variable in Vercel only takes effect after a redeploy.

### Forgot your password?

Your password is the `ADMIN_PASSWORD` environment variable, so anyone who can sign in to your Vercel account can recover it:

1. Open your project on [vercel.com](https://vercel.com/dashboard) and go to **Settings → Environment Variables**.
2. Find `ADMIN_PASSWORD`. Reveal it to see it, or edit it to set a new one.
3. If you changed it, redeploy (**Deployments → ⋯ → Redeploy**). New values only apply to new deployments.

Changing it signs out every open session, unless you set `SESSION_SECRET`. Your snippets, notes and credentials are not affected; credentials are encrypted with `JIG_ENCRYPTION_KEY`, not the password.

## Updating your copy

The Deploy button makes an independent copy, not a fork, so it doesn't update itself. To pull in new versions:

```bash
git remote add upstream https://github.com/nboada/jig.git   # once
git pull upstream master
git push
```

Vercel redeploys on push. New tables and columns are created automatically on the next request.

## Run locally

```bash
bun install
cp .env.example .env.local   # set ADMIN_PASSWORD
bun run dev
```

Without `DATABASE_URL` the app uses PGlite (Postgres in WASM) stored in `.data/`, so there is nothing else to install. To turn on credentials locally, open **Credentials** and click **Create encryption key**: it is written to `.env.local` for you.

## Scripts

- `bun run dev`, `bun run build`, `bun run start`
- `bun run test`: data layer, encryption, sharing, rate limiting and MCP tools against an in-memory PGlite
- `bun run typecheck`

## Not built yet

- OAuth, which the claude.ai web and desktop connectors need. CLI agents work with bearer tokens today.

## License

[MIT](LICENSE)

Built by [TALKK](https://talkk.com.au).
