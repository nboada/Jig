# Notes and credentials

Date: 2026-09-29
Status: awaiting review

## Goal

Add two kinds of content to Snippeta alongside snippets:

- **Notes**: free-form markdown, versioned like snippets, searchable, and readable and writable by agents over MCP.
- **Credentials**: logins, API keys and other secrets that only the owner can see, in the dashboard. Agents can never read them.

Also add rate limiting to the dashboard login, since credentials make the login password worth more.

Out of scope, and planned as a separate spec: **Instructions**, reusable agent guidance that an agent installs into a project as a Claude Code skill (`.claude/skills/<name>/SKILL.md`) or as an `AGENTS.md` section. WebMCP (browser-exposed tools) is also out of scope. If it is added later, credentials pages must expose no tools.

## Decisions

| Question | Decision |
| --- | --- |
| Who can read credential values | Only the owner, in the dashboard. Never over MCP. |
| Protection level | Values are encrypted at rest with a server key (`SNIPPETA_ENCRYPTION_KEY`), hidden until revealed, and the login is rate limited. There is no re-authentication and no client-side encryption. |
| Credential shape | Title, optional URL, tags, a plain note, and any number of labelled fields, each marked secret or not. |
| Credential history | None. Only current values are kept, plus an updated time. |
| Notes | Free-form markdown with full version history, like snippets. |
| Structure | Notes and credentials are separate modules and tables. Credentials code is never imported by the MCP code. |

## Data

New statements are appended to `SCHEMA` in `lib/db.ts`. Like the existing ones they must be idempotent (`IF NOT EXISTS`).

```sql
CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_versions (
  note_id text NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  body text NOT NULL,
  message text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, version)
);

CREATE TABLE IF NOT EXISTS credentials (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  url text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, attempted_at);
```

`credentials.fields` is an ordered array of `{ id, label, secret, value }`. When `secret` is true, `value` holds ciphertext. Otherwise it holds plain text.

The rule that every write is a single SQL statement still applies. Note writes use the same CTE pattern as `createSnippet` and `insertVersion`, including the `current_version = expected` optimistic lock.

## Encryption (`lib/crypto.ts`)

- The algorithm is AES-256-GCM via `crypto.subtle`, so there are no new dependencies.
- The key is `SNIPPETA_ENCRYPTION_KEY`: 32 bytes, base64 encoded, generated with `openssl rand -base64 32`. Add it to `.env.example` and the README deploy steps.
- Each encryption gets a fresh 12-byte random IV. The stored format is `v1:<iv base64url>:<ciphertext base64url>`, and the `v1` prefix leaves room for key rotation.
- The additional authenticated data is `<credential id>:<field id>`, so a ciphertext copied to another credential or field fails to decrypt.
- API: `encryptSecret(plain, context)`, `decryptSecret(stored, context)`, and `encryptionReady()`, which reports whether the key is present and valid.
- The key is imported once and cached, the same way `getDb()` caches the database.

## Notes (`lib/notes.ts`)

These mirror `lib/snippets.ts`:

- `listNotes(db, { query, tag, limit })`: every query word must appear in the title, slug, tags or body. Title and slug hits rank first.
- `getNote(db, slug, version?)`, `createNote(db, input, source)`, `updateNote(db, slug, patch, source)` (with `baseVersion` and a no-op when nothing changed), `listNoteVersions`, `restoreNoteVersion`, `deleteNote`, `listNoteTags`.
- Errors are thrown as `SnippetError` with the existing codes, so `run()` in `lib/mcp.ts` and the dashboard forms handle them unchanged.
- Validation schemas (`noteInputSchema`, `notePatchSchema`) live in `lib/validation.ts`. The body is capped at 200,000 characters, the same as a snippet file.
- Slugs use the existing `slugify` and a copy of the `availableSlug` logic scoped to the `notes` table. Snippets and notes have separate slug namespaces.
- History diffs: export `diffFile` from `lib/diff.ts` and add a `compareNotes(a, b)` that returns a `VersionDiff`. The title and tags are field changes, and the body is one file named `note.md`. This lets `DiffView` be reused unchanged.

## Credentials (`lib/credentials.ts`)

- `listCredentials(db, { query, tag })` searches the title, slug, URL, tags, note, field labels and the values of non-secret fields. It never searches secret values. The results show labels but no values.
- `getCredential(db, slug)` returns the credential with secret values replaced by `null`. Ciphertext never leaves this module.
- `revealField(db, slug, fieldId)` decrypts and returns one secret value. It is the only function that returns plaintext secrets.
- `createCredential(db, input)` and `updateCredential(db, slug, input)`:
  - On update, a secret field sent with an empty value keeps its stored ciphertext, matched by field `id`.
  - A new or changed secret value is encrypted.
  - Changing a field from secret to plain requires a new value to be entered.
- `deleteCredential(db, slug)`.
- If the key is missing or invalid, every function except `listCredentials` throws a `CredentialsUnavailable` error that the pages catch.
- If one value fails to decrypt, `revealField` returns a clear error for that field and does not throw for the whole page.

## Login rate limiting (`lib/ratelimit.ts`)

- `checkLogin(db, ip, now?)`: blocked when there are 10 or more failures from this IP within the last 15 minutes. It returns `{ blocked, retryAfterMinutes }`.
- `recordFailure(db, ip)`, `clearFailures(db, ip)`, and pruning of rows older than 15 minutes, done within the insert.
- The `login` action in `app/actions.ts` reads the IP from `x-forwarded-for` (the first entry, falling back to `unknown`). It checks before comparing the password, records a failure on a wrong password, and clears on success.
- If the rate-limit query fails, the login is refused.

## MCP (`lib/mcp.ts`)

New tools, following the style of the snippet tools (Zod input schemas, markdown text output, `run()` wrapper, `source` = `mcp:<token name>`):

| Tool | Notes |
| --- | --- |
| `search_notes` | `query`, `tag`, `limit`. Read-only hint. |
| `get_note` | `slug`, optional `version`. Read-only hint. |
| `create_note` | `title`, `body`, `tags`, optional `slug`, `message`. |
| `update_note` | `slug`, optional `title`, `body`, `tags`, `message`, `baseVersion`. |
| `list_note_versions` | `slug`. Read-only hint. |
| `restore_note_version` | `slug`, `version`, `message`. |

There is no delete tool and no diff tool for notes. `SERVER_INSTRUCTIONS` gains a paragraph on notes and one line: credentials are stored in Snippeta but are never available to agents, so ask the user for any secret.

`lib/mcp.ts` must not import `lib/credentials.ts` or `lib/crypto.ts`. A test enforces this.

## Dashboard

- **Navigation** in `app/(app)/layout.tsx`: Snippets · Notes · Credentials · Connect. The "New" button becomes a `<details>` menu with New snippet, New note and New credential, so no client JavaScript is needed.
- **Notes**: `/notes`, `/notes/new`, `/notes/[slug]`, `/notes/[slug]/edit`, `/notes/[slug]/history`, following the snippet page layouts.
  - The note body is shown through `CodeBlock` as markdown source, with no markdown renderer.
  - The edit form is a title, tags, a body textarea and a change message.
  - The history page uses `compareNotes` with `DiffView`, and restore works as it does for snippets.
- **Credentials**: `/credentials`, `/credentials/new`, `/credentials/[slug]`, `/credentials/[slug]/edit`.
  - **Detail**: plain fields are shown in full. Secret fields show `••••••` with Reveal and Copy buttons, which call a `revealSecret` server action (`requireAuth()` then `revealField`). Revealed values live only in client component state.
  - **Edit**: the fields editor supports add, remove, rename, reorder and a secret toggle. Secret inputs render empty with an "unchanged" placeholder. The note field warns: "Don't put secrets here. This note isn't encrypted."
  - **Delete** uses `ConfirmButton`.
  - If the key is missing, the pages show a setup message with the `openssl` command.
- **Server actions** are added to `app/actions.ts`: `saveNote`, `removeNote`, `restoreNote`, `saveCredential`, `removeCredential`, `revealSecret`. Every action calls `requireAuth()` first.

## Errors

| Situation | Behaviour |
| --- | --- |
| Note not found, conflict, invalid input | `SnippetError` codes, shown as an MCP error or a form error. |
| Encryption key missing or invalid | Credentials pages show a setup message. Everything else works. |
| A stored value won't decrypt | That field shows "Can't decrypt this value. Was the encryption key changed?" |
| Rate-limit check fails | The login is refused with a generic error. |
| Blocked IP | "Too many attempts, try again in N minutes." |

## Testing

All tests run in `bun test lib` against in-memory PGlite. Test files: `notes.test.ts`, `crypto.test.ts`, `credentials.test.ts`, `ratelimit.test.ts`, `mcp.test.ts`.

- **Notes**: create, update, a save with no changes, `baseVersion` conflict, concurrent-save conflict, restore, search across title, body and tags, and `compareNotes`.
- **Crypto**:
  - A value encrypts and decrypts back to the original, and IVs are unique across encryptions.
  - Tampered ciphertext fails, a mismatched credential or field context fails, and the wrong key fails.
  - A missing key reports not ready.
- **Credentials**:
  - The raw `fields` jsonb never contains the plaintext secret.
  - `getCredential` returns `null` for secrets.
  - An empty secret on update keeps the stored value, and a changed secret is re-encrypted.
  - Search matches plain values and never matches secret ones.
- **Rate limiting**: the 10th failure blocks, the block lifts after 15 minutes (injected `now`), and success clears the failures.
- **MCP guard**: `lib/mcp.ts` source has no import of `credentials` or `crypto`, and the registered tool names contain no "credential".
- `bun run typecheck` passes.

## Docs to update

- README: notes and credentials, the new MCP tools, `SNIPPETA_ENCRYPTION_KEY` in the setup and deploy steps, and removal of "Login rate limiting" from "Not built yet".
- CLAUDE.md: the credentials isolation rule and the new env var.
