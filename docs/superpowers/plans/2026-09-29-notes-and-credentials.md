# Notes and Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned markdown notes (dashboard + MCP) and dashboard-only encrypted credentials to Snippeta, plus login rate limiting.

**Architecture:** Notes mirror the snippet data layer (`notes` + `note_versions` tables, full snapshots, optimistic version lock) and get six MCP tools. Credentials live in one table whose secret field values are AES-256-GCM ciphertext; `lib/credentials.ts` and `lib/crypto.ts` are never imported (directly or transitively) by `lib/mcp.ts`. Failed logins are counted per IP in a `login_attempts` table.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Tailwind 4, Zod 4, Postgres via Neon HTTP / PGlite, Web Crypto (`crypto.subtle`), Bun test runner.

**Spec:** `docs/superpowers/specs/2026-09-29-notes-and-credentials-design.md`

## Global Constraints

- Package manager and test runner: Bun. `bun run test` runs `bun test lib`; `bun run typecheck` runs `tsc --noEmit`.
- Every database write is a single SQL statement (Neon's HTTP driver has no interactive transactions). Multi-table writes use CTEs.
- Every statement added to `SCHEMA` in `lib/db.ts` is idempotent (`IF NOT EXISTS`).
- `lib/mcp.ts`, and every module it imports transitively, must not import `lib/credentials.ts` or `lib/crypto.ts`.
- Plaintext secrets are returned only by `revealField`. Ciphertext never leaves `lib/credentials.ts`.
- Every server action except `login` calls `requireAuth()` first.
- Encryption key: `SNIPPETA_ENCRYPTION_KEY`, 32 bytes, base64 (`openssl rand -base64 32`). Stored format `v1:<iv base64url>:<ciphertext base64url>`. Additional data `<credential id>:<field id>`.
- Rate limit: blocked when there are 10 or more failures from one IP within the last 15 minutes.
- Note bodies are capped at 200,000 characters.
- Errors meant for users are `SnippetError` (`not_found | conflict | invalid`), `CredentialsUnavailable` or `DecryptError`.
- Match the existing style: sparse comments, a short docblock on exported functions, no new dependencies.
- This folder is not a git repository yet. The commit steps apply once `git init` has been run; until then, treat each commit step as a checkpoint where tests and typecheck must pass.

## Review Focus

- A credential URL such as `javascript:alert(1)` must never render as a clickable link. Only `http(s)` URLs are linked (`safeHref` test, Task 7).
- Search terms containing `%` or `_` must match literally in notes search, as they do for snippets (Task 3 test).
- Secrets with non-ASCII characters and long values (10,000 characters) must round-trip exactly (Task 1 test).
- An `x-forwarded-for` header with several IPs, or none, must still produce one stable key for rate limiting (`clientIpFrom` test, Task 2).
- Reordering fields must keep every secret decryptable, and a removed field's ID must no longer reveal anything (Task 5 tests).

---

### Task 1: Encryption module

**Files:**
- Create: `lib/crypto.ts`
- Create: `lib/crypto.test.ts`
- Modify: `.env.example`
- Modify: `CLAUDE.md` (env var line)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class CredentialsUnavailable extends Error`
  - `class DecryptError extends Error`
  - `encryptionReady(): boolean`
  - `assertEncryptionReady(): void` (throws `CredentialsUnavailable`)
  - `encryptSecret(plain: string, context: string): Promise<string>`
  - `decryptSecret(stored: string, context: string): Promise<string>` (throws `DecryptError`)

- [ ] **Step 1: Install dependencies**

Run: `bun install`
Expected: `node_modules/` is created without errors.

- [ ] **Step 2: Write the failing test**

Create `lib/crypto.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { CredentialsUnavailable, DecryptError, decryptSecret, encryptionReady, encryptSecret } from "./crypto";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const saved = process.env.SNIPPETA_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.SNIPPETA_ENCRYPTION_KEY = KEY_A;
});

afterAll(() => {
  if (saved === undefined) delete process.env.SNIPPETA_ENCRYPTION_KEY;
  else process.env.SNIPPETA_ENCRYPTION_KEY = saved;
});

describe("crypto", () => {
  test("round-trips a value and uses a fresh IV each time", async () => {
    const a = await encryptSecret("hunter2", "cred:field");
    const b = await encryptSecret("hunter2", "cred:field");
    expect(a).toMatch(/^v1:[\w-]+:[\w-]+$/);
    expect(a).not.toBe(b);
    expect(await decryptSecret(a, "cred:field")).toBe("hunter2");
    expect(await decryptSecret(b, "cred:field")).toBe("hunter2");
  });

  test("keeps non-ASCII and long values intact", async () => {
    const value = "pässwörd 🔑 " + "x".repeat(10_000);
    expect(await decryptSecret(await encryptSecret(value, "c:f"), "c:f")).toBe(value);
  });

  test("tampered ciphertext fails", async () => {
    const [prefix, iv, data] = (await encryptSecret("hunter2", "c:f")).split(":");
    const flipped = `${prefix}:${iv}:${data[0] === "A" ? "B" : "A"}${data.slice(1)}`;
    await expect(decryptSecret(flipped, "c:f")).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptSecret("garbage", "c:f")).rejects.toBeInstanceOf(DecryptError);
  });

  test("a value moved to another credential or field fails", async () => {
    const stored = await encryptSecret("hunter2", "cred-1:field-1");
    await expect(decryptSecret(stored, "cred-1:field-2")).rejects.toThrow("Can't decrypt");
    await expect(decryptSecret(stored, "cred-2:field-1")).rejects.toThrow("Can't decrypt");
  });

  test("the wrong key fails", async () => {
    const stored = await encryptSecret("hunter2", "c:f");
    process.env.SNIPPETA_ENCRYPTION_KEY = KEY_B;
    await expect(decryptSecret(stored, "c:f")).rejects.toThrow("Can't decrypt");
  });

  test("a missing or short key is reported", async () => {
    delete process.env.SNIPPETA_ENCRYPTION_KEY;
    expect(encryptionReady()).toBe(false);
    await expect(encryptSecret("x", "c:f")).rejects.toBeInstanceOf(CredentialsUnavailable);
    process.env.SNIPPETA_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(encryptionReady()).toBe(false);
    process.env.SNIPPETA_ENCRYPTION_KEY = KEY_A;
    expect(encryptionReady()).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test lib/crypto.test.ts`
Expected: FAIL with `Cannot find module './crypto'`.

- [ ] **Step 4: Write the implementation**

Create `lib/crypto.ts`:

```ts
/**
 * Encrypts credential secrets at rest with AES-256-GCM. The key comes from
 * SNIPPETA_ENCRYPTION_KEY (32 bytes, base64). Each value is bound to its
 * credential and field through the additional data, so ciphertext copied to
 * another place in the database does not decrypt.
 */

const PREFIX = "v1";

export class CredentialsUnavailable extends Error {
  constructor() {
    super("Credentials need SNIPPETA_ENCRYPTION_KEY: 32 random bytes in base64. Generate one with: openssl rand -base64 32");
  }
}

export class DecryptError extends Error {
  constructor() {
    super("Can't decrypt this value. Was the encryption key changed?");
  }
}

const encoder = new TextEncoder();
const fromBase64 = (value: string, encoding: "base64" | "base64url") => new Uint8Array(Buffer.from(value, encoding));
const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

function keyBytes(): Uint8Array | null {
  const value = process.env.SNIPPETA_ENCRYPTION_KEY?.trim();
  if (!value) return null;
  const bytes = fromBase64(value, "base64");
  return bytes.length === 32 ? bytes : null;
}

export function encryptionReady(): boolean {
  return keyBytes() !== null;
}

export function assertEncryptionReady(): void {
  if (!encryptionReady()) throw new CredentialsUnavailable();
}

let cached: { raw: string; key: Promise<CryptoKey> } | undefined;

function key(): Promise<CryptoKey> {
  const raw = process.env.SNIPPETA_ENCRYPTION_KEY?.trim() ?? "";
  if (cached?.raw !== raw) {
    const bytes = keyBytes();
    if (!bytes) return Promise.reject(new CredentialsUnavailable());
    cached = { raw, key: crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]) };
  }
  return cached.key;
}

export async function encryptSecret(plain: string, context: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    await key(),
    encoder.encode(plain),
  );
  return `${PREFIX}:${toBase64Url(iv)}:${toBase64Url(new Uint8Array(data))}`;
}

export async function decryptSecret(stored: string, context: string): Promise<string> {
  const [prefix, iv, data] = stored.split(":");
  if (prefix !== PREFIX || !iv || !data) throw new DecryptError();
  const k = await key();
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv, "base64url"), additionalData: encoder.encode(context) },
      k,
      fromBase64(data, "base64url"),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new DecryptError();
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test lib/crypto.test.ts && bun run typecheck`
Expected: 6 tests pass. Typecheck reports no errors.

- [ ] **Step 6: Document the env var**

Append to `.env.example`:

```
# Encrypts saved credentials. 32 random bytes in base64: openssl rand -base64 32
# Keep a copy somewhere safe: if it is lost, saved secrets cannot be recovered.
SNIPPETA_ENCRYPTION_KEY=
```

In `CLAUDE.md`, change the sentence starting "Other env vars:" to:

```
Other env vars: `ADMIN_PASSWORD`, `SESSION_SECRET` (falls back to `ADMIN_PASSWORD`), `SNIPPETA_TIMEZONE` (default `Australia/Sydney`), and `SNIPPETA_ENCRYPTION_KEY` (32 bytes base64, needed only for credentials).
```

- [ ] **Step 7: Commit**

```bash
git add lib/crypto.ts lib/crypto.test.ts .env.example CLAUDE.md
git commit -m "feat: add AES-GCM encryption for credential secrets"
```

---

### Task 2: Login rate limiting

**Files:**
- Modify: `lib/db.ts` (`SCHEMA`)
- Create: `lib/ratelimit.ts`
- Create: `lib/ratelimit.test.ts`
- Modify: `app/actions.ts` (`login`)
- Modify: `README.md` ("Not built yet")

**Interfaces:**
- Consumes: `Db` from `lib/db.ts`.
- Produces:
  - `clientIpFrom(forwardedFor: string | null): string`
  - `checkLogin(db: Db, ip: string, now?: Date): Promise<{ blocked: boolean; retryAfterMinutes: number }>`
  - `recordFailure(db: Db, ip: string, now?: Date): Promise<void>`
  - `clearFailures(db: Db, ip: string): Promise<void>`

- [ ] **Step 1: Add the table**

In `lib/db.ts`, append these two entries to the `SCHEMA` array, after the `snippets_updated_at_idx` entry:

```ts
  `CREATE TABLE IF NOT EXISTS login_attempts (
    ip text NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, attempted_at)`,
```

- [ ] **Step 2: Write the failing test**

Create `lib/ratelimit.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { checkLogin, clearFailures, clientIpFrom, recordFailure } from "./ratelimit";

let db: Db;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE login_attempts`);
});

const t0 = new Date("2026-01-01T00:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

async function fail(ip: string, times: number, when: Date) {
  for (let i = 0; i < times; i++) await recordFailure(db, ip, when);
}

describe("login rate limiting", () => {
  test("nine failures are allowed, the tenth blocks for the rest of the window", async () => {
    await fail("1.1.1.1", 9, at(0));
    expect(await checkLogin(db, "1.1.1.1", at(0))).toEqual({ blocked: false, retryAfterMinutes: 0 });
    await fail("1.1.1.1", 1, at(0));
    expect(await checkLogin(db, "1.1.1.1", at(0))).toEqual({ blocked: true, retryAfterMinutes: 15 });
    expect(await checkLogin(db, "1.1.1.1", at(5))).toEqual({ blocked: true, retryAfterMinutes: 10 });
    expect((await checkLogin(db, "1.1.1.1", at(15.01))).blocked).toBe(false);
  });

  test("other IPs are not affected", async () => {
    await fail("1.1.1.1", 10, at(0));
    expect((await checkLogin(db, "2.2.2.2", at(0))).blocked).toBe(false);
  });

  test("a successful login clears the failures", async () => {
    await fail("1.1.1.1", 10, at(0));
    await clearFailures(db, "1.1.1.1");
    expect((await checkLogin(db, "1.1.1.1", at(0))).blocked).toBe(false);
  });

  test("old attempts are pruned when a new one is recorded", async () => {
    await fail("1.1.1.1", 3, at(0));
    await recordFailure(db, "2.2.2.2", at(30));
    const rows = await db.query(`SELECT ip FROM login_attempts`);
    expect(rows.map((r) => r.ip)).toEqual(["2.2.2.2"]);
  });

  test("the client IP is the first x-forwarded-for entry", () => {
    expect(clientIpFrom("203.0.113.5, 10.0.0.1")).toBe("203.0.113.5");
    expect(clientIpFrom(" 203.0.113.5 ")).toBe("203.0.113.5");
    expect(clientIpFrom(null)).toBe("unknown");
    expect(clientIpFrom("  ")).toBe("unknown");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test lib/ratelimit.test.ts`
Expected: FAIL with `Cannot find module './ratelimit'`.

- [ ] **Step 4: Write the implementation**

Create `lib/ratelimit.ts`:

```ts
import type { Db } from "./db";

/**
 * Failed dashboard logins are counted per IP in the database, because Vercel
 * runs several server instances and an in-memory count would be per instance.
 */

const MAX_FAILURES = 10;
const WINDOW_MINUTES = 15;

/** The client's IP from Vercel's x-forwarded-for header: the first entry. */
export function clientIpFrom(forwardedFor: string | null): string {
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

/** Blocked once the IP has MAX_FAILURES failures inside the window. */
export async function checkLogin(
  db: Db,
  ip: string,
  now = new Date(),
): Promise<{ blocked: boolean; retryAfterMinutes: number }> {
  const rows = await db.query<{ attempted_at: string }>(
    `SELECT attempted_at FROM login_attempts
     WHERE ip = $1 AND attempted_at > $2::timestamptz - interval '${WINDOW_MINUTES} minutes'
     ORDER BY attempted_at DESC
     OFFSET ${MAX_FAILURES - 1} LIMIT 1`,
    [ip, now.toISOString()],
  );
  if (!rows[0]) return { blocked: false, retryAfterMinutes: 0 };
  // The block lifts when the MAX_FAILURES-th most recent failure leaves the window.
  const lifts = new Date(rows[0].attempted_at).getTime() + WINDOW_MINUTES * 60_000;
  return { blocked: true, retryAfterMinutes: Math.max(1, Math.ceil((lifts - now.getTime()) / 60_000)) };
}

/** Records a failure and prunes attempts that are outside the window for every IP. */
export async function recordFailure(db: Db, ip: string, now = new Date()): Promise<void> {
  await db.query(
    `WITH pruned AS (
       DELETE FROM login_attempts WHERE attempted_at <= $2::timestamptz - interval '${WINDOW_MINUTES} minutes'
     )
     INSERT INTO login_attempts (ip, attempted_at) VALUES ($1, $2::timestamptz)`,
    [ip, now.toISOString()],
  );
}

export async function clearFailures(db: Db, ip: string): Promise<void> {
  await db.query(`DELETE FROM login_attempts WHERE ip = $1`, [ip]);
}
```

- [ ] **Step 5: Run tests**

Run: `bun test lib/ratelimit.test.ts`
Expected: 5 tests pass.

- [ ] **Step 6: Wire it into the login action**

In `app/actions.ts`, change the first import line to also import `headers`:

```ts
import { cookies, headers } from "next/headers";
```

Add this import after the `@/lib/session` import:

```ts
import { checkLogin, clearFailures, clientIpFrom, recordFailure } from "@/lib/ratelimit";
```

Replace the whole `login` function with:

```ts
export async function login(_: FormState, form: FormData): Promise<FormState> {
  if (!process.env.ADMIN_PASSWORD) return { error: "ADMIN_PASSWORD is not set on the server." };
  const ip = clientIpFrom((await headers()).get("x-forwarded-for"));
  try {
    const db = await getDb();
    const { blocked, retryAfterMinutes } = await checkLogin(db, ip);
    if (blocked) {
      return { error: `Too many attempts, try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.` };
    }
    if (!checkPassword(String(form.get("password") ?? ""))) {
      await recordFailure(db, ip);
      return { error: "Wrong password." };
    }
    await clearFailures(db, ip);
  } catch (error) {
    // Refuse rather than allow unlimited guesses when the check itself fails.
    console.error("[snippeta] login check failed", error);
    return { error: "Could not check the login right now. Try again." };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  redirect(safeNext(form.get("next")));
}
```

- [ ] **Step 7: Update the README**

In `README.md`, delete this line from "Not built yet":

```
- Login rate limiting. Use a long `ADMIN_PASSWORD`.
```

- [ ] **Step 8: Run all tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: all tests pass. Typecheck reports no errors.

- [ ] **Step 9: Manual check**

Run `ADMIN_PASSWORD=test-password SESSION_SECRET=dev bun run dev`, open `http://localhost:3000/login`, and enter a wrong password 10 times.
Expected: attempts 1 to 10 show "Wrong password." The 11th shows "Too many attempts, try again in 15 minutes." Then stop the server and clear the local block with:

```bash
rm -rf .data/pglite
```

(That deletes local dev data only. Skip it if you have local snippets you want to keep, and wait 15 minutes instead.)

- [ ] **Step 10: Commit**

```bash
git add lib/db.ts lib/ratelimit.ts lib/ratelimit.test.ts app/actions.ts README.md
git commit -m "feat: rate limit failed dashboard logins per IP"
```

---

### Task 3: Notes data layer

**Files:**
- Modify: `lib/db.ts` (`SCHEMA`)
- Modify: `lib/validation.ts`
- Modify: `lib/snippets.ts` (export `parse`, generalise `availableSlug`)
- Create: `lib/notes.ts`
- Modify: `lib/diff.ts` (export `diffFile`, add `compareNotes`)
- Create: `lib/notes.test.ts`

**Interfaces:**
- Consumes: `Db`, `Row`; `slugify`, `SnippetError` from `lib/snippets.ts`.
- Produces (in `lib/snippets.ts`):
  - `parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S>` (now exported)
  - `availableSlug(db: Db, base: string, table?: "snippets" | "notes" | "credentials"): Promise<string>` (now exported)
- Produces (in `lib/validation.ts`): `noteInputSchema`, `notePatchSchema`, `type NoteInput`, `type NotePatch`
- Produces (in `lib/notes.ts`):
  - `type NoteSummary = { slug: string; title: string; tags: string[]; version: number; excerpt: string; updatedAt: string }`
  - `type NoteVersion = { slug: string; version: number; title: string; tags: string[]; body: string; message: string; source: string; createdAt: string }`
  - `type Note = NoteVersion & { currentVersion: number; createdAt: string; updatedAt: string; versionCreatedAt: string }`
  - `type NoteVersionSummary = Pick<NoteVersion, "version" | "title" | "message" | "source" | "createdAt">`
  - `listNotes(db, { query?, tag?, limit? }): Promise<NoteSummary[]>`
  - `listNoteTags(db): Promise<{ tag: string; count: number }[]>`
  - `getNote(db, slug, version?): Promise<Note | null>`
  - `createNote(db, input: NoteInput, source = "web"): Promise<Note>`
  - `updateNote(db, slug, patch: NotePatch, source = "web"): Promise<{ note: Note; changed: boolean }>`
  - `listNoteVersions(db, slug): Promise<NoteVersionSummary[]>`
  - `getNoteVersionPair(db, slug, from: number, to?: number): Promise<readonly [Note, Note]>`
  - `restoreNoteVersion(db, slug, version, source = "web", message?): Promise<Note>`
  - `deleteNote(db, slug): Promise<void>`
- Produces (in `lib/diff.ts`): `compareNotes(a: NoteVersion, b: NoteVersion): VersionDiff`

- [ ] **Step 1: Add the tables**

In `lib/db.ts`, append to `SCHEMA` (after the `login_attempts_ip_idx` entry from Task 2):

```ts
  `CREATE TABLE IF NOT EXISTS notes (
    id text PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    current_version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS note_versions (
    note_id text NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    version integer NOT NULL,
    title text NOT NULL,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    body text NOT NULL,
    message text NOT NULL DEFAULT '',
    source text NOT NULL DEFAULT 'web',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (note_id, version)
  )`,
  `CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at DESC)`,
```

- [ ] **Step 2: Add the validation schemas**

Append to `lib/validation.ts`, before the `export type SnippetInput` line:

```ts
const noteBodySchema = z.string().max(200_000, "Notes are capped at 200,000 characters");

export const noteInputSchema = z.object({
  title: z.string().trim().min(1, "Give the note a title").max(120),
  slug: slugSchema.optional(),
  tags: tagsSchema.default([]),
  body: noteBodySchema,
  message: z.string().trim().max(500).default(""),
});

export const notePatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  tags: tagsSchema.optional(),
  body: noteBodySchema.optional(),
  message: z.string().trim().max(500).default(""),
  /** When set, the update is refused if someone saved a newer version in the meantime. */
  baseVersion: z.number().int().positive().optional(),
});
```

Append at the end of the file:

```ts
export type NoteInput = z.input<typeof noteInputSchema>;
export type NotePatch = z.input<typeof notePatchSchema>;
```

- [ ] **Step 3: Share the slug and parse helpers**

In `lib/snippets.ts`, replace the `availableSlug` function with:

```ts
/** The base slug, or base-2, base-3 and so on when it is taken in `table`. */
export async function availableSlug(
  db: Db,
  base: string,
  table: "snippets" | "notes" | "credentials" = "snippets",
): Promise<string> {
  const rows = await db.query<{ slug: string }>(
    `SELECT slug FROM ${table} WHERE slug = $1 OR slug LIKE $2`,
    [base, `${base}-%`],
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

In the same file, change `function parse<S extends z.ZodType>` to `export function parse<S extends z.ZodType>`.

- [ ] **Step 4: Write the failing test**

Create `lib/notes.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { compareNotes } from "./diff";
import {
  createNote,
  deleteNote,
  getNote,
  getNoteVersionPair,
  listNotes,
  listNoteTags,
  listNoteVersions,
  restoreNoteVersion,
  updateNote,
} from "./notes";
import { createSnippet } from "./snippets";

let db: Db;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE notes, note_versions, snippets, snippet_versions`);
});

const deploy = {
  title: "Shopify theme deploys",
  tags: ["Shopify", "deploy"],
  body: "Run `shopify theme push --unpublished` first.\nThen publish from the admin.\n",
};
const slug = "shopify-theme-deploys";

describe("notes", () => {
  test("create stores version 1 and normalises tags", async () => {
    const n = await createNote(db, deploy);
    expect(n.slug).toBe(slug);
    expect(n.version).toBe(1);
    expect(n.currentVersion).toBe(1);
    expect(n.tags).toEqual(["shopify", "deploy"]);
    expect(n.body).toBe(deploy.body);
    expect(n.message).toBe("Created");
  });

  test("clashing titles get a numbered slug, explicit clashing slugs are refused", async () => {
    await createNote(db, deploy);
    expect((await createNote(db, deploy)).slug).toBe(`${slug}-2`);
    await expect(createNote(db, { ...deploy, slug })).rejects.toThrow("already taken");
  });

  test("note slugs are separate from snippet slugs", async () => {
    await createSnippet(db, { title: deploy.title, language: "text", files: [{ name: "a.txt", content: "x" }] });
    expect((await createNote(db, deploy)).slug).toBe(slug);
  });

  test("update creates a new version and keeps the old one", async () => {
    await createNote(db, deploy);
    const { note, changed } = await updateNote(db, slug, { body: "New body\n", message: "Rewrite" }, "mcp:claude");
    expect(changed).toBe(true);
    expect(note.version).toBe(2);
    expect(note.title).toBe(deploy.title);
    expect(note.source).toBe("mcp:claude");
    expect((await getNote(db, slug, 1))?.body).toBe(deploy.body);
    expect((await listNoteVersions(db, slug)).map((v) => [v.version, v.message])).toEqual([
      [2, "Rewrite"],
      [1, "Created"],
    ]);
  });

  test("an update with no real change saves nothing", async () => {
    await createNote(db, deploy);
    const { note, changed } = await updateNote(db, slug, { title: deploy.title, body: deploy.body });
    expect(changed).toBe(false);
    expect(note.version).toBe(1);
  });

  test("an update based on a stale version is refused", async () => {
    await createNote(db, deploy);
    await updateNote(db, slug, { body: "Changed" });
    await expect(updateNote(db, slug, { body: "Mine", baseVersion: 1 })).rejects.toThrow("was changed since version 1");
  });

  test("of two concurrent saves, one wins and the other is refused", async () => {
    await createNote(db, deploy);
    const results = await Promise.allSettled([
      updateNote(db, slug, { body: "A" }),
      updateNote(db, slug, { body: "B" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason.message)).toContain("changed by someone else");
    expect((await getNote(db, slug))?.currentVersion).toBe(2);
  });

  test("restore copies an old version forward", async () => {
    await createNote(db, deploy);
    await updateNote(db, slug, { body: "broken" });
    const restored = await restoreNoteVersion(db, slug, 1);
    expect(restored.version).toBe(3);
    expect(restored.body).toBe(deploy.body);
    expect(restored.message).toBe("Restored version 1");
    await expect(restoreNoteVersion(db, slug, 3)).rejects.toThrow("already the latest");
  });

  test("search matches titles, tags and body, ranks title hits first, escapes wildcards", async () => {
    await createNote(db, deploy);
    await createNote(db, { title: "Client: Acme", tags: ["client"], body: "Acme runs 100 percent on Shopify Plus." });

    expect((await listNotes(db)).length).toBe(2);
    expect((await listNotes(db, { query: "publish" })).map((n) => n.slug)).toEqual([slug]);
    expect((await listNotes(db, { query: "shopify" })).map((n) => n.slug)).toEqual([slug, "client-acme"]);
    expect((await listNotes(db, { tag: "Client" })).map((n) => n.slug)).toEqual(["client-acme"]);
    expect((await listNotes(db, { query: "100%" })).length).toBe(0);
    expect((await listNotes(db, { query: "publish" }))[0].excerpt).toBe(
      "Run `shopify theme push --unpublished` first. Then publish from the admin.",
    );
    expect(await listNoteTags(db)).toEqual([
      { tag: "client", count: 1 },
      { tag: "deploy", count: 1 },
      { tag: "shopify", count: 1 },
    ]);
  });

  test("delete removes the note and its history", async () => {
    await createNote(db, deploy);
    await deleteNote(db, slug);
    expect(await getNote(db, slug)).toBeNull();
    await expect(listNoteVersions(db, slug)).rejects.toThrow("No note");
  });

  test("compareNotes reports title, tag and body changes", async () => {
    await createNote(db, deploy);
    await updateNote(db, slug, {
      title: "Theme deploys",
      body: `${deploy.body}Roll back with \`shopify theme publish\`.\n`,
    });
    const diff = compareNotes(...(await getNoteVersionPair(db, slug, 1)));
    expect(diff.fields).toEqual([{ field: "title", from: "Shopify theme deploys", to: "Theme deploys" }]);
    expect(diff.files.map((f) => [f.name, f.status, f.additions, f.deletions])).toEqual([["note.md", "modified", 1, 0]]);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `bun test lib/notes.test.ts`
Expected: FAIL with `Cannot find module './notes'`.

- [ ] **Step 6: Write the notes module**

Create `lib/notes.ts`:

```ts
import type { Db, Row } from "./db";
import { availableSlug, parse, slugify, SnippetError } from "./snippets";
import { noteInputSchema, notePatchSchema, slugSchema, type NoteInput, type NotePatch } from "./validation";

/** The listing view of a note: its latest title and tags plus the start of its text. */
export type NoteSummary = {
  slug: string;
  title: string;
  tags: string[];
  version: number;
  excerpt: string;
  updatedAt: string;
};

/** One saved version of a note: a full snapshot, like snippet versions. */
export type NoteVersion = {
  slug: string;
  version: number;
  title: string;
  tags: string[];
  body: string;
  message: string;
  source: string;
  createdAt: string;
};

export type Note = NoteVersion & {
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  versionCreatedAt: string;
};

export type NoteVersionSummary = Pick<NoteVersion, "version" | "title" | "message" | "source" | "createdAt">;

const iso = (value: unknown) => new Date(value as string).toISOString();

function toVersion(row: Row): NoteVersion {
  return {
    slug: row.slug as string,
    version: row.version as number,
    title: row.title as string,
    tags: row.tags as string[],
    body: row.body as string,
    message: row.message as string,
    source: row.source as string,
    createdAt: iso(row.created_at),
  };
}

export type NoteListOptions = { query?: string; tag?: string; limit?: number };

/**
 * Lists notes, newest first. Every word of `query` must appear somewhere in
 * the title, slug, tags or body; title and slug hits rank first.
 */
export async function listNotes(db: Db, options: NoteListOptions = {}): Promise<NoteSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const terms = (options.query ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const termParams = terms.map((term) => param(`%${term.replace(/[\\%_]/g, "\\$&")}%`));
  for (const p of termParams) {
    where.push(`(n.title ILIKE ${p} OR n.slug ILIKE ${p} OR n.tags::text ILIKE ${p} OR v.body ILIKE ${p})`);
  }
  if (options.tag) where.push(`n.tags @> jsonb_build_array(${param(options.tag.toLowerCase())}::text)`);

  const order = termParams.map((p) => `(n.title ILIKE ${p} OR n.slug ILIKE ${p})::int`);
  order.push("n.updated_at");
  const limit = param(Math.min(Math.max(options.limit ?? 100, 1), 500));

  const rows = await db.query(
    `SELECT n.slug, n.title, n.tags, n.current_version, n.updated_at, left(v.body, 400) AS excerpt
     FROM notes n
     JOIN note_versions v ON v.note_id = n.id AND v.version = n.current_version
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${order.map((o) => `${o} DESC`).join(", ")}
     LIMIT ${limit}`,
    params,
  );
  return rows.map((r) => ({
    slug: r.slug as string,
    title: r.title as string,
    tags: r.tags as string[],
    version: r.current_version as number,
    excerpt: (r.excerpt as string).replace(/\s+/g, " ").trim(),
    updatedAt: iso(r.updated_at),
  }));
}

/** All note tags in use, with how many notes carry each. */
export async function listNoteTags(db: Db): Promise<{ tag: string; count: number }[]> {
  const rows = await db.query<{ tag: string; count: number | string }>(
    `SELECT tag, count(*) AS count FROM notes, jsonb_array_elements_text(tags) AS tag
     GROUP BY tag ORDER BY count(*) DESC, tag`,
  );
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

/** Returns the latest version of a note, or a specific one when `version` is given. */
export async function getNote(db: Db, slug: string, version?: number): Promise<Note | null> {
  const rows = await db.query(
    `SELECT n.slug, n.current_version, n.created_at AS note_created_at, n.updated_at,
            v.version, v.title, v.tags, v.body, v.message, v.source, v.created_at
     FROM notes n
     JOIN note_versions v ON v.note_id = n.id AND v.version = COALESCE($2::int, n.current_version)
     WHERE n.slug = $1`,
    [slug, version ?? null],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...toVersion(row),
    currentVersion: row.current_version as number,
    createdAt: iso(row.note_created_at),
    updatedAt: iso(row.updated_at),
    versionCreatedAt: iso(row.created_at),
  };
}

async function requireNote(db: Db, slug: string, version?: number): Promise<Note> {
  const note = await getNote(db, slug, version);
  if (note) return note;
  throw new SnippetError(
    version ? `Note "${slug}" has no version ${version}` : `No note with the slug "${slug}"`,
    "not_found",
  );
}

export async function createNote(db: Db, input: NoteInput, source = "web"): Promise<Note> {
  const data = parse(noteInputSchema, input);

  let slug: string;
  if (data.slug) {
    slug = data.slug;
    if (await getNote(db, slug)) throw new SnippetError(`The slug "${slug}" is already taken`, "conflict");
  } else {
    slug = await availableSlug(db, slugify(data.title), "notes");
  }

  await db.query(
    `WITH n AS (
       INSERT INTO notes (id, slug, title, tags) VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id
     )
     INSERT INTO note_versions (note_id, version, title, tags, body, message, source)
     SELECT n.id, 1, $3, $4::jsonb, $5, $6, $7 FROM n`,
    [crypto.randomUUID(), slug, data.title, JSON.stringify(data.tags), data.body, data.message || "Created", source],
  );
  return requireNote(db, slug);
}

const NOTE_FIELDS = ["title", "tags", "body"] as const;

/**
 * Saves a new version. Fields left out of the patch carry over from the latest
 * version. Nothing is saved when the result is identical to the latest version.
 */
export async function updateNote(
  db: Db,
  slug: string,
  patch: NotePatch,
  source = "web",
): Promise<{ note: Note; changed: boolean }> {
  const data = parse(notePatchSchema, patch);
  const current = await requireNote(db, slug);

  if (data.baseVersion && data.baseVersion !== current.currentVersion) {
    throw new SnippetError(
      `"${slug}" was changed since version ${data.baseVersion} (it is now at version ${current.currentVersion}). Reload and apply your edits again.`,
      "conflict",
    );
  }

  const next = {
    title: data.title ?? current.title,
    tags: data.tags ?? current.tags,
    body: data.body ?? current.body,
  };
  const changed = NOTE_FIELDS.some((f) => JSON.stringify(next[f]) !== JSON.stringify(current[f]));
  if (!changed) return { note: current, changed: false };

  await insertNoteVersion(db, slug, current.currentVersion, next, data.message || "Updated", source);
  return { note: await requireNote(db, slug), changed: true };
}

/** Bumps the note to a new version in one statement, failing if another save got there first. */
async function insertNoteVersion(
  db: Db,
  slug: string,
  expected: number,
  next: Pick<NoteVersion, (typeof NOTE_FIELDS)[number]>,
  message: string,
  source: string,
) {
  const rows = await db.query(
    `WITH n AS (
       UPDATE notes
       SET title = $3, tags = $4::jsonb, current_version = current_version + 1, updated_at = now()
       WHERE slug = $1 AND current_version = $2
       RETURNING id, current_version
     )
     INSERT INTO note_versions (note_id, version, title, tags, body, message, source)
     SELECT n.id, n.current_version, $3, $4::jsonb, $5, $6, $7 FROM n
     RETURNING version`,
    [slug, expected, next.title, JSON.stringify(next.tags), next.body, message, source],
  );
  if (!rows.length) {
    throw new SnippetError(`"${slug}" was changed by someone else while saving. Reload and try again.`, "conflict");
  }
}

export async function listNoteVersions(db: Db, slug: string): Promise<NoteVersionSummary[]> {
  const rows = await db.query(
    `SELECT v.version, v.title, v.message, v.source, v.created_at
     FROM note_versions v JOIN notes n ON n.id = v.note_id
     WHERE n.slug = $1 ORDER BY v.version DESC`,
    [slug],
  );
  if (!rows.length) await requireNote(db, slug);
  return rows.map((r) => ({
    version: r.version as number,
    title: r.title as string,
    message: r.message as string,
    source: r.source as string,
    createdAt: iso(r.created_at),
  }));
}

export async function getNoteVersionPair(db: Db, slug: string, from: number, to?: number) {
  const [a, b] = await Promise.all([requireNote(db, slug, from), requireNote(db, slug, to)]);
  return [a, b] as const;
}

/** Rolls back by saving a new version whose content is a copy of an older one. */
export async function restoreNoteVersion(
  db: Db,
  slug: string,
  version: number,
  source = "web",
  message?: string,
): Promise<Note> {
  const [target, current] = await Promise.all([requireNote(db, slug, version), requireNote(db, slug)]);
  if (version === current.currentVersion) {
    throw new SnippetError(`Version ${version} is already the latest version of "${slug}"`, "invalid");
  }
  await insertNoteVersion(db, slug, current.currentVersion, target, message || `Restored version ${version}`, source);
  return requireNote(db, slug);
}

export async function deleteNote(db: Db, slug: string): Promise<void> {
  const rows = await db.query(`DELETE FROM notes WHERE slug = $1 RETURNING id`, [slugSchema.parse(slug)]);
  if (!rows.length) throw new SnippetError(`No note with the slug "${slug}"`, "not_found");
}
```

- [ ] **Step 7: Add `compareNotes`**

In `lib/diff.ts`:
- Add `import type { NoteVersion } from "./notes";` below the existing `SnippetVersion` import.
- Change `function diffFile(` to `export function diffFile(`.
- Append:

```ts
/** Compares two versions of a note. The body is shown as one file, note.md, so DiffView works unchanged. */
export function compareNotes(a: NoteVersion, b: NoteVersion): VersionDiff {
  const fields: FieldChange[] = [];
  for (const field of ["title", "tags"] as const) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) {
      fields.push({ field, from: show(a[field]), to: show(b[field]) });
    }
  }
  return { from: a.version, to: b.version, fields, files: [diffFile("note.md", a.body, b.body)] };
}
```

- [ ] **Step 8: Run all tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: all tests pass, including the 11 in `notes.test.ts` and the unchanged snippet tests. Typecheck reports no errors.

- [ ] **Step 9: Commit**

```bash
git add lib/db.ts lib/validation.ts lib/snippets.ts lib/notes.ts lib/diff.ts lib/notes.test.ts
git commit -m "feat: add versioned notes data layer"
```

---

### Task 4: Notes MCP tools and the credentials guard

**Files:**
- Modify: `lib/mcp.ts`
- Create: `lib/mcp.test.ts`
- Modify: `README.md` (MCP tools table)

**Interfaces:**
- Consumes: everything `lib/notes.ts` produces (Task 3).
- Produces:
  - MCP tools `search_notes`, `get_note`, `create_note`, `update_note`, `list_note_versions`, `restore_note_version`
  - `formatNote(n: Note): string` (exported from `lib/mcp.ts`)

- [ ] **Step 1: Write the failing test**

Create `lib/mcp.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import { pgliteDb, prepare, type Db } from "./db";
import { registerTools } from "./mcp";

type Result = { content: { type: string; text: string }[]; isError?: boolean };
type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<Result>;

let db: Db;
const tools = new Map<string, Handler>();

beforeAll(async () => {
  db = await prepare(await pgliteDb());
  const fake = { registerTool: (name: string, _config: unknown, handler: Handler) => void tools.set(name, handler) };
  registerTools(fake as unknown as McpServer, async () => db);
});

beforeEach(async () => {
  await db.query(`TRUNCATE notes, note_versions`);
});

async function call(name: string, args: Record<string, unknown>) {
  const result = await tools.get(name)!(args, {});
  return { text: result.content[0].text, isError: result.isError ?? false };
}

describe("notes over MCP", () => {
  test("a note round-trips through the tools", async () => {
    expect((await call("create_note", { title: "Deploy checklist", body: "1. Push\n2. Publish\n", tags: ["deploy"] })).text)
      .toContain("deploy-checklist");
    expect(
      (await call("update_note", { slug: "deploy-checklist", body: "1. Push\n2. Check\n3. Publish\n", message: "Add check" })).text,
    ).toContain("version 2");

    const latest = await call("get_note", { slug: "deploy-checklist" });
    expect(latest.text).toContain("3. Publish");
    expect(latest.text).toContain("Version: 2 (latest)");
    expect((await call("get_note", { slug: "deploy-checklist", version: 1 })).text).toContain("Version: 1 of 2 (older version)");

    expect((await call("search_notes", { query: "check" })).text).toContain("deploy-checklist");
    const history = await call("list_note_versions", { slug: "deploy-checklist" });
    expect(history.text).toContain("v2 (latest)");
    expect(history.text).toContain("Add check");
    expect(history.text).toContain("by mcp:agent");

    expect((await call("restore_note_version", { slug: "deploy-checklist", version: 1 })).text).toContain("now version 3");
  });

  test("problems come back as tool errors", async () => {
    const missing = await call("get_note", { slug: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("No note");
    expect((await call("search_notes", {})).text).toContain("There are no notes yet");
  });
});

describe("credentials stay out of MCP", () => {
  test("no tool mentions credentials or secrets", () => {
    expect([...tools.keys()].filter((name) => /credential|secret/i.test(name))).toEqual([]);
  });

  test("mcp.ts does not import the credentials or crypto modules, even indirectly", () => {
    const seen = new Set<string>();
    const stack = ["mcp.ts"];
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      for (const match of source.matchAll(/from\s+["']\.\/([\w.-]+)["']/g)) stack.push(`${match[1]}.ts`);
    }
    expect(seen.has("notes.ts")).toBe(true);
    expect(seen.has("credentials.ts")).toBe(false);
    expect(seen.has("crypto.ts")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/mcp.test.ts`
Expected: FAIL. `tools.get("create_note")` is undefined (`TypeError: ... is not a function`), and the import-scan test fails on `seen.has("notes.ts")`.

- [ ] **Step 3: Add the note tools**

In `lib/mcp.ts`, add this import after the `./languages` import:

```ts
import {
  createNote,
  getNote,
  listNotes,
  listNoteTags,
  listNoteVersions,
  restoreNoteVersion,
  updateNote,
  type Note,
  type NoteSummary,
} from "./notes";
```

Replace the closing backtick-and-semicolon of `SERVER_INSTRUCTIONS` so the constant ends with these two extra paragraphs:

```ts
...Use list_snippet_versions, diff_snippet_versions and restore_snippet_version to inspect history or roll back when a snippet stopped working.

Snippeta also holds the user's notes: free-form markdown such as setup steps, client details or decisions. Use search_notes and get_note when the user refers to one of their notes, and create_note or update_note to save one. Notes are versioned like snippets, so always pass a short message on update.

Snippeta also stores the user's credentials, but they are never available to agents. When a task needs a password, API key or other secret, ask the user for it.`;
```

Add these helpers after `formatSnippet`:

```ts
function formatNoteSummary(n: NoteSummary) {
  const tags = n.tags.length ? ` [${n.tags.join(", ")}]` : "";
  const excerpt = n.excerpt ? `\n  ${n.excerpt.length > 160 ? `${n.excerpt.slice(0, 160)}…` : n.excerpt}` : "";
  return `- ${n.slug}: ${n.title} (v${n.version})${tags}${excerpt}`;
}

export function formatNote(n: Note): string {
  const out = [
    `# ${n.title}`,
    "",
    `Slug: ${n.slug}`,
    `Version: ${n.version}${n.version === n.currentVersion ? " (latest)" : ` of ${n.currentVersion} (older version)`}`,
  ];
  if (n.tags.length) out.push(`Tags: ${n.tags.join(", ")}`);
  out.push(`Saved: ${n.versionCreatedAt}${n.message ? ` (${n.message})` : ""}`);
  out.push("", "## Note", "", n.body || "(empty)");
  return out.join("\n");
}

const noteSlugArg = z.string().trim().min(1).describe("The note's slug, e.g. shopify-theme-deploys. Find it with search_notes.");
```

At the end of `registerTools`, before its closing `}`, add:

```ts
  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description:
        "Find the user's notes by keyword or tag. Matches titles, slugs, tags and note text. Call with no arguments to list everything.",
      inputSchema: z.object({
        query: z.string().optional().describe("Keywords, e.g. \"acme hosting\"."),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ query, tag, limit }) =>
      run(async () => {
        const db = await getDb();
        const results = await listNotes(db, { query, tag, limit: limit ?? 50 });
        if (results.length) return text(`${results.length} note(s):\n\n${results.map(formatNoteSummary).join("\n")}`);
        const tags = await listNoteTags(db);
        return text(
          `No notes matched.${tags.length ? ` Tags in use: ${tags.map((t) => t.tag).join(", ")}.` : " There are no notes yet."}`,
        );
      }),
  );

  server.registerTool(
    "get_note",
    {
      title: "Get note",
      description: "Read a note. Returns the latest version unless a version number is given.",
      inputSchema: z.object({
        slug: noteSlugArg,
        version: z.number().int().positive().optional().describe("A specific version from list_note_versions."),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ slug, version }) =>
      run(async () => {
        const note = await getNote(await getDb(), slug, version);
        if (note) return text(formatNote(note));
        throw new SnippetError(
          version ? `Note "${slug}" has no version ${version}.` : `No note with the slug "${slug}". Use search_notes to find it.`,
          "not_found",
        );
      }),
  );

  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description: "Save a new note: free-form markdown such as setup steps, client details or decisions. Version 1 is created.",
      inputSchema: z.object({
        title: z.string().describe("Short human title, e.g. \"Acme hosting setup\"."),
        slug: z.string().optional().describe("Optional; derived from the title when left out."),
        tags: z.array(z.string()).optional().describe("Lowercase keywords, e.g. [\"acme\", \"hosting\"]."),
        body: z.string().describe("The note, in markdown. Never include passwords or API keys."),
        message: z.string().optional().describe("Why the note was created, for the history."),
      }),
    },
    (args, ctx) =>
      run(async () => {
        const note = await createNote(await getDb(), args, sourceOf(ctx));
        return text(`Created "${note.title}" as ${note.slug} (version 1).`);
      }),
  );

  server.registerTool(
    "update_note",
    {
      title: "Update note",
      description: "Save a new version of a note. Only pass the fields that change; `body` replaces the whole text.",
      inputSchema: z.object({
        slug: noteSlugArg,
        title: z.string().optional(),
        tags: z.array(z.string()).optional(),
        body: z.string().optional().describe("The complete new text, in markdown."),
        message: z.string().describe("What changed and why."),
        baseVersion: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("The version your edit is based on. The update is refused if a newer version was saved since."),
      }),
    },
    ({ slug, ...patch }, ctx) =>
      run(async () => {
        const { note, changed } = await updateNote(await getDb(), slug, patch, sourceOf(ctx));
        return text(
          changed ? `Saved ${note.slug} as version ${note.version}.` : `Nothing changed, ${note.slug} is still at version ${note.version}.`,
        );
      }),
  );

  server.registerTool(
    "list_note_versions",
    {
      title: "List note versions",
      description: "Show the version history of a note, newest first, with each change message.",
      inputSchema: z.object({ slug: noteSlugArg }),
      annotations: { readOnlyHint: true },
    },
    ({ slug }) =>
      run(async () => {
        const versions = await listNoteVersions(await getDb(), slug);
        const lines = versions.map(
          (v, i) => `- v${v.version}${i === 0 ? " (latest)" : ""}, ${v.createdAt}, by ${v.source}: ${v.message || "(no message)"}`,
        );
        return text(`History of ${slug}:\n\n${lines.join("\n")}`);
      }),
  );

  server.registerTool(
    "restore_note_version",
    {
      title: "Restore note version",
      description: "Roll a note back to an earlier version. This saves a new version with the old content, so it can be undone.",
      inputSchema: z.object({
        slug: noteSlugArg,
        version: z.number().int().positive().describe("The version to bring back."),
        message: z.string().optional(),
      }),
    },
    ({ slug, version, message }, ctx) =>
      run(async () => {
        const note = await restoreNoteVersion(await getDb(), slug, version, sourceOf(ctx), message);
        return text(`Restored ${slug} to the content of version ${version}. It is now version ${note.version}.`);
      }),
  );
```

- [ ] **Step 4: Run all tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: all tests pass, including the 4 in `mcp.test.ts`. Typecheck reports no errors.

- [ ] **Step 5: Update the README**

In `README.md`, change the first line under "What is in here" to:

```
- **Dashboard** (Next.js 16): search, tags, a multi-file editor, version history with diffs, one-click restore, notes, and encrypted credentials.
```

Add these rows at the end of the MCP tools table:

```
| `search_notes` | Find notes by keyword or tag, including the note text. |
| `get_note` | A note's text, latest or any version. |
| `create_note` / `update_note` | Save a note or a new version of one. `baseVersion` works as for snippets. |
| `list_note_versions` / `restore_note_version` | Note history and rollback. |
```

Replace "Deleting a snippet is only possible from the dashboard, never from an agent." with:

```
Deleting a snippet or note is only possible from the dashboard, never from an agent. Credentials are not reachable over MCP at all.
```

- [ ] **Step 6: Commit**

```bash
git add lib/mcp.ts lib/mcp.test.ts README.md
git commit -m "feat: expose notes over MCP and guard credentials from it"
```

---

### Task 5: Credentials data layer

**Files:**
- Modify: `lib/db.ts` (`SCHEMA`)
- Modify: `lib/validation.ts`
- Create: `lib/credentials.ts`
- Create: `lib/credentials.test.ts`
- Modify: `CLAUDE.md` (isolation rule)

**Interfaces:**
- Consumes: from `lib/crypto.ts` (Task 1): `assertEncryptionReady`, `encryptSecret`, `decryptSecret`. From `lib/snippets.ts` (Task 3): `availableSlug`, `parse`, `slugify`, `SnippetError`.
- Produces (in `lib/validation.ts`): `credentialInputSchema`, `type CredentialInput`
- Produces (in `lib/credentials.ts`):
  - `type CredentialField = { id: string; label: string; secret: boolean; value: string | null }` (`value` is `null` for secret fields)
  - `type Credential = { slug: string; title: string; url: string; tags: string[]; note: string; fields: CredentialField[]; createdAt: string; updatedAt: string }`
  - `type CredentialSummary = { slug: string; title: string; url: string; tags: string[]; labels: string[]; updatedAt: string }`
  - `listCredentials(db, { query?, tag?, limit? }): Promise<CredentialSummary[]>` (works without the key)
  - `listCredentialTags(db): Promise<{ tag: string; count: number }[]>`
  - `getCredential(db, slug): Promise<Credential | null>`
  - `revealField(db, slug, fieldId): Promise<string>`
  - `createCredential(db, input: CredentialInput): Promise<Credential>`
  - `updateCredential(db, slug, input: CredentialInput): Promise<Credential>`
  - `deleteCredential(db, slug): Promise<void>`

- [ ] **Step 1: Add the table**

In `lib/db.ts`, append to `SCHEMA` (after `notes_updated_at_idx`):

```ts
  `CREATE TABLE IF NOT EXISTS credentials (
    id text PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    url text NOT NULL DEFAULT '',
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    note text NOT NULL DEFAULT '',
    fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
```

- [ ] **Step 2: Add the validation schema**

Append to `lib/validation.ts`, before the `export type SnippetInput` line:

```ts
const credentialFieldSchema = z.object({
  /** Present for fields that already exist; new fields get an id when saved. */
  id: z.string().trim().min(1).max(64).optional(),
  label: z.string().trim().min(1, "Every field needs a label").max(80),
  secret: z.boolean(),
  value: z.string().max(10_000, "Values are capped at 10,000 characters"),
});

export const credentialInputSchema = z.object({
  title: z.string().trim().min(1, "Give the credential a title").max(120),
  slug: slugSchema.optional(),
  url: z.string().trim().max(2000).default(""),
  tags: tagsSchema.default([]),
  note: z.string().trim().max(5000).default(""),
  fields: z.array(credentialFieldSchema).min(1, "Add at least one field").max(30),
});
```

Append at the end of the file:

```ts
export type CredentialInput = z.input<typeof credentialInputSchema>;
```

- [ ] **Step 3: Write the failing test**

Create `lib/credentials.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  createCredential,
  getCredential,
  listCredentials,
  revealField,
  updateCredential,
} from "./credentials";
import { CredentialsUnavailable } from "./crypto";
import { pgliteDb, prepare, type Db } from "./db";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 8).toString("base64");
const saved = process.env.SNIPPETA_ENCRYPTION_KEY;
let db: Db;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  process.env.SNIPPETA_ENCRYPTION_KEY = KEY;
  await db.query(`TRUNCATE credentials`);
});

afterAll(() => {
  if (saved === undefined) delete process.env.SNIPPETA_ENCRYPTION_KEY;
  else process.env.SNIPPETA_ENCRYPTION_KEY = saved;
});

const shopify = {
  title: "Acme Shopify",
  url: "https://acme.myshopify.com/admin",
  tags: ["acme"],
  note: "Custom app: Snippeta sync",
  fields: [
    { label: "Store", secret: false, value: "store-01.example" },
    { label: "API key", secret: true, value: "shpat_live_123" },
  ],
};
const slug = "acme-shopify";

describe("credentials", () => {
  test("secrets are stored encrypted and never returned by getCredential", async () => {
    const c = await createCredential(db, shopify);
    expect(c.slug).toBe(slug);
    expect(c.fields.map((f) => [f.label, f.secret, f.value])).toEqual([
      ["Store", false, "store-01.example"],
      ["API key", true, null],
    ]);

    const [row] = await db.query(`SELECT fields FROM credentials`);
    expect(JSON.stringify(row.fields)).not.toContain("shpat_live_123");
    expect((row.fields as { value: string }[])[1].value.startsWith("v1:")).toBe(true);

    expect(await revealField(db, slug, c.fields[1].id)).toBe("shpat_live_123");
    expect(await revealField(db, slug, c.fields[0].id)).toBe("store-01.example");
  });

  test("an empty secret keeps the stored value, reordering keeps it decryptable, a new value replaces it", async () => {
    const [store, key] = (await createCredential(db, shopify)).fields;
    await updateCredential(db, slug, {
      ...shopify,
      fields: [
        { id: key.id, label: "API key", secret: true, value: "" },
        { id: store.id, label: "Store", secret: false, value: "store-01.example" },
      ],
    });
    expect(await revealField(db, slug, key.id)).toBe("shpat_live_123");
    expect((await getCredential(db, slug))?.fields.map((f) => f.label)).toEqual(["API key", "Store"]);

    await updateCredential(db, slug, {
      ...shopify,
      fields: [{ id: key.id, label: "API key", secret: true, value: "shpat_live_456" }],
    });
    expect(await revealField(db, slug, key.id)).toBe("shpat_live_456");
  });

  test("a new secret needs a value, and making a secret plain needs a new value", async () => {
    const [store, key] = (await createCredential(db, shopify)).fields;
    await expect(
      updateCredential(db, slug, {
        ...shopify,
        fields: [{ id: store.id, label: "Store", secret: false, value: "x" }, { label: "Secret", secret: true, value: "" }],
      }),
    ).rejects.toThrow('Enter a value for "Secret"');
    await expect(
      updateCredential(db, slug, { ...shopify, fields: [{ id: key.id, label: "API key", secret: false, value: "" }] }),
    ).rejects.toThrow("no longer secret");
  });

  test("a removed field can no longer be revealed", async () => {
    const [store, key] = (await createCredential(db, shopify)).fields;
    await updateCredential(db, slug, { ...shopify, fields: [{ id: store.id, label: "Store", secret: false, value: "x" }] });
    await expect(revealField(db, slug, key.id)).rejects.toThrow("no field");
  });

  test("search covers titles, labels and plain values, never secrets", async () => {
    await createCredential(db, shopify);
    await createCredential(db, { title: "Hosting", fields: [{ label: "Password", secret: true, value: "acme-secret" }] });

    expect((await listCredentials(db, { query: "acme" })).map((c) => c.slug)).toEqual([slug]);
    expect((await listCredentials(db, { query: "store-01" })).map((c) => c.slug)).toEqual([slug]);
    expect((await listCredentials(db, { query: "password" })).map((c) => c.slug)).toEqual(["hosting"]);
    expect(await listCredentials(db, { query: "secret" })).toEqual([]);

    const [summary] = await listCredentials(db, { tag: "acme" });
    expect(summary.labels).toEqual(["Store", "API key"]);
    expect(JSON.stringify(summary)).not.toContain("store-01");
  });

  test("ciphertext copied to another field does not decrypt", async () => {
    const c = await createCredential(db, {
      title: "Two secrets",
      fields: [
        { label: "A", secret: true, value: "first" },
        { label: "B", secret: true, value: "second" },
      ],
    });
    await db.query(`UPDATE credentials SET fields = jsonb_set(fields, '{1,value}', fields->0->'value')`);
    await expect(revealField(db, "two-secrets", c.fields[1].id)).rejects.toThrow("Can't decrypt");
  });

  test("a changed key gives a decrypt error, a missing key blocks everything but the list", async () => {
    const c = await createCredential(db, shopify);
    process.env.SNIPPETA_ENCRYPTION_KEY = OTHER_KEY;
    await expect(revealField(db, slug, c.fields[1].id)).rejects.toThrow("Can't decrypt");

    delete process.env.SNIPPETA_ENCRYPTION_KEY;
    await expect(getCredential(db, slug)).rejects.toBeInstanceOf(CredentialsUnavailable);
    await expect(createCredential(db, shopify)).rejects.toBeInstanceOf(CredentialsUnavailable);
    expect((await listCredentials(db)).length).toBe(1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test lib/credentials.test.ts`
Expected: FAIL with `Cannot find module './credentials'`.

- [ ] **Step 5: Write the credentials module**

Create `lib/credentials.ts`:

```ts
import { assertEncryptionReady, decryptSecret, encryptSecret } from "./crypto";
import type { Db, Row } from "./db";
import { availableSlug, parse, slugify, SnippetError } from "./snippets";
import { credentialInputSchema, slugSchema, type CredentialInput } from "./validation";

/**
 * Credentials are dashboard-only. Secret field values are stored as
 * ciphertext and only revealField returns them in plain text. This module
 * must never be imported by lib/mcp.ts (lib/mcp.test.ts enforces it).
 */

export type CredentialField = { id: string; label: string; secret: boolean; value: string | null };

export type Credential = {
  slug: string;
  title: string;
  url: string;
  tags: string[];
  note: string;
  fields: CredentialField[];
  createdAt: string;
  updatedAt: string;
};

export type CredentialSummary = {
  slug: string;
  title: string;
  url: string;
  tags: string[];
  labels: string[];
  updatedAt: string;
};

/** A field as stored: `value` is ciphertext when `secret` is true. */
type StoredField = { id: string; label: string; secret: boolean; value: string };

const iso = (value: unknown) => new Date(value as string).toISOString();

const secretContext = (credentialId: string, fieldId: string) => `${credentialId}:${fieldId}`;

export type CredentialListOptions = { query?: string; tag?: string; limit?: number };

/**
 * Lists credentials, newest first. Searches titles, slugs, URLs, tags, notes,
 * field labels and plain field values; secret values are never searched.
 */
export async function listCredentials(db: Db, options: CredentialListOptions = {}): Promise<CredentialSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const terms = (options.query ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const termParams = terms.map((term) => param(`%${term.replace(/[\\%_]/g, "\\$&")}%`));
  for (const p of termParams) {
    where.push(
      `(c.title ILIKE ${p} OR c.slug ILIKE ${p} OR c.url ILIKE ${p} OR c.tags::text ILIKE ${p} OR c.note ILIKE ${p}
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(c.fields) f
                   WHERE f->>'label' ILIKE ${p} OR (NOT (f->>'secret')::boolean AND f->>'value' ILIKE ${p})))`,
    );
  }
  if (options.tag) where.push(`c.tags @> jsonb_build_array(${param(options.tag.toLowerCase())}::text)`);

  const order = termParams.map((p) => `(c.title ILIKE ${p} OR c.slug ILIKE ${p})::int`);
  order.push("c.updated_at");
  const limit = param(Math.min(Math.max(options.limit ?? 100, 1), 500));

  const rows = await db.query(
    `SELECT c.slug, c.title, c.url, c.tags, c.fields, c.updated_at FROM credentials c
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${order.map((o) => `${o} DESC`).join(", ")}
     LIMIT ${limit}`,
    params,
  );
  return rows.map((r) => ({
    slug: r.slug as string,
    title: r.title as string,
    url: r.url as string,
    tags: r.tags as string[],
    labels: (r.fields as StoredField[]).map((f) => f.label),
    updatedAt: iso(r.updated_at),
  }));
}

/** All credential tags in use, with how many credentials carry each. */
export async function listCredentialTags(db: Db): Promise<{ tag: string; count: number }[]> {
  const rows = await db.query<{ tag: string; count: number | string }>(
    `SELECT tag, count(*) AS count FROM credentials, jsonb_array_elements_text(tags) AS tag
     GROUP BY tag ORDER BY count(*) DESC, tag`,
  );
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

async function findRow(db: Db, slug: string): Promise<Row | undefined> {
  return (await db.query(`SELECT * FROM credentials WHERE slug = $1`, [slug]))[0];
}

async function requireRow(db: Db, slug: string): Promise<Row> {
  const row = await findRow(db, slug);
  if (row) return row;
  throw new SnippetError(`No credential with the slug "${slug}"`, "not_found");
}

function toCredential(row: Row): Credential {
  return {
    slug: row.slug as string,
    title: row.title as string,
    url: row.url as string,
    tags: row.tags as string[],
    note: row.note as string,
    fields: (row.fields as StoredField[]).map((f) => ({ ...f, value: f.secret ? null : f.value })),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/** A credential with its secret values left out (`value: null`). */
export async function getCredential(db: Db, slug: string): Promise<Credential | null> {
  assertEncryptionReady();
  const row = await findRow(db, slug);
  return row ? toCredential(row) : null;
}

/** Decrypts one secret field. The only function that returns a secret in plain text. */
export async function revealField(db: Db, slug: string, fieldId: string): Promise<string> {
  assertEncryptionReady();
  const row = await requireRow(db, slug);
  const field = (row.fields as StoredField[]).find((f) => f.id === fieldId);
  if (!field) throw new SnippetError(`"${slug}" has no field with that id`, "not_found");
  return field.secret ? decryptSecret(field.value, secretContext(row.id as string, field.id)) : field.value;
}

/**
 * Turns submitted fields into stored ones. A secret sent with an empty value
 * keeps its stored ciphertext; new and changed secrets are encrypted.
 */
async function buildFields(
  credentialId: string,
  fields: { id?: string; label: string; secret: boolean; value: string }[],
  previous: StoredField[] = [],
): Promise<StoredField[]> {
  const byId = new Map(previous.map((f) => [f.id, f]));
  return Promise.all(
    fields.map(async (f) => {
      const old = f.id ? byId.get(f.id) : undefined;
      const id = old?.id ?? crypto.randomUUID();
      if (!f.secret) {
        if (old?.secret && !f.value) {
          throw new SnippetError(`Enter a new value for "${f.label}", it is no longer secret.`, "invalid");
        }
        return { id, label: f.label, secret: false, value: f.value };
      }
      if (!f.value) {
        if (old?.secret) return { id, label: f.label, secret: true, value: old.value };
        throw new SnippetError(`Enter a value for "${f.label}".`, "invalid");
      }
      return { id, label: f.label, secret: true, value: await encryptSecret(f.value, secretContext(credentialId, id)) };
    }),
  );
}

export async function createCredential(db: Db, input: CredentialInput): Promise<Credential> {
  assertEncryptionReady();
  const data = parse(credentialInputSchema, input);

  let slug: string;
  if (data.slug) {
    slug = data.slug;
    if (await findRow(db, slug)) throw new SnippetError(`The slug "${slug}" is already taken`, "conflict");
  } else {
    slug = await availableSlug(db, slugify(data.title), "credentials");
  }

  const id = crypto.randomUUID();
  const fields = await buildFields(id, data.fields);
  const rows = await db.query(
    `INSERT INTO credentials (id, slug, title, url, tags, note, fields)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb) RETURNING *`,
    [id, slug, data.title, data.url, JSON.stringify(data.tags), data.note, JSON.stringify(fields)],
  );
  return toCredential(rows[0]);
}

/** Replaces a credential's details and fields. There is no history. The slug never changes. */
export async function updateCredential(db: Db, slug: string, input: CredentialInput): Promise<Credential> {
  assertEncryptionReady();
  const data = parse(credentialInputSchema, input);
  const row = await requireRow(db, slug);
  const fields = await buildFields(row.id as string, data.fields, row.fields as StoredField[]);
  const rows = await db.query(
    `UPDATE credentials SET title = $2, url = $3, tags = $4::jsonb, note = $5, fields = $6::jsonb, updated_at = now()
     WHERE slug = $1 RETURNING *`,
    [slug, data.title, data.url, JSON.stringify(data.tags), data.note, JSON.stringify(fields)],
  );
  return toCredential(rows[0]);
}

export async function deleteCredential(db: Db, slug: string): Promise<void> {
  const rows = await db.query(`DELETE FROM credentials WHERE slug = $1 RETURNING id`, [slugSchema.parse(slug)]);
  if (!rows.length) throw new SnippetError(`No credential with the slug "${slug}"`, "not_found");
}
```

- [ ] **Step 6: Run all tests and typecheck**

Run: `bun run test && bun run typecheck`
Expected: all tests pass, including the 7 in `credentials.test.ts`. The `mcp.test.ts` guard still passes. Typecheck reports no errors.

- [ ] **Step 7: Document the isolation rule**

In `CLAUDE.md`, add this bullet to the data-layer list, after the `lib/tokens.ts` bullet:

```
- `lib/credentials.ts` + `lib/crypto.ts`: dashboard-only credentials. Secret field values are AES-256-GCM ciphertext bound to `<credential id>:<field id>`, and `revealField` is the only function that returns plaintext. **`lib/mcp.ts` must never import these, directly or indirectly**; `lib/mcp.test.ts` fails if it does. Notes (`lib/notes.ts`) mirror the snippet versioning pattern and are exposed over MCP.
```

- [ ] **Step 8: Commit**

```bash
git add lib/db.ts lib/validation.ts lib/credentials.ts lib/credentials.test.ts CLAUDE.md
git commit -m "feat: add encrypted credentials data layer"
```

---

### Task 6: Notes dashboard

**Files:**
- Modify: `app/actions.ts` (`saveNote`, `removeNote`, `restoreNote`)
- Modify: `components/SnippetForm.tsx` (export `field`, `label`, `indentOnTab`)
- Create: `components/NoteForm.tsx`
- Create: `components/NewMenu.tsx`
- Modify: `app/(app)/layout.tsx` (nav and New menu)
- Modify: `app/(app)/not-found.tsx`
- Create: `app/(app)/notes/page.tsx`
- Create: `app/(app)/notes/new/page.tsx`
- Create: `app/(app)/notes/[slug]/page.tsx`
- Create: `app/(app)/notes/[slug]/edit/page.tsx`
- Create: `app/(app)/notes/[slug]/history/page.tsx`

**Interfaces:**
- Consumes: `lib/notes.ts` (Task 3), `compareNotes` (Task 3).
- Produces:
  - `saveNote(_: FormState, form: FormData): Promise<FormState>` (form fields `slug`, `payload`)
  - `removeNote(form: FormData)` (field `slug`)
  - `restoreNote(form: FormData)` (fields `slug`, `version`)
  - `NewMenu({ items }: { items: { href: string; label: string }[] })`

> The spec says the New menu needs no client JavaScript. A plain `<details>` stays open after client-side navigation because the layout doesn't re-render, so `NewMenu` is a small client component that closes itself when an item is clicked.

- [ ] **Step 1: Export the shared form helpers**

In `components/SnippetForm.tsx`, change:
- `const field =` to `export const field =`
- `const label =` to `export const label =`
- `function indentOnTab(` to `export function indentOnTab(`

- [ ] **Step 2: Add the note server actions**

In `app/actions.ts`, add this import after the `@/lib/snippets` import:

```ts
import { createNote, deleteNote, restoreNoteVersion, updateNote } from "@/lib/notes";
```

Append:

```ts
/** The note form posts its fields as one JSON blob, like the snippet form. */
export async function saveNote(_: FormState, form: FormData): Promise<FormState> {
  await requireAuth();
  const slug = String(form.get("slug") ?? "");
  let target: string;
  try {
    const data = JSON.parse(String(form.get("payload") ?? "{}"));
    const db = await getDb();
    target = slug ? (await updateNote(db, slug, data)).note.slug : (await createNote(db, data)).slug;
  } catch (error) {
    if (error instanceof SnippetError) return { error: error.message };
    console.error("[snippeta] note save failed", error);
    return { error: "Could not save the note. Try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/notes/${target}`);
}

export async function removeNote(form: FormData) {
  await requireAuth();
  await deleteNote(await getDb(), String(form.get("slug")));
  revalidatePath("/", "layout");
  redirect("/notes");
}

export async function restoreNote(form: FormData) {
  await requireAuth();
  const slug = String(form.get("slug"));
  await restoreNoteVersion(await getDb(), slug, Number(form.get("version")));
  revalidatePath("/", "layout");
  redirect(`/notes/${slug}/history`);
}
```

- [ ] **Step 3: Create the note form**

Create `components/NoteForm.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveNote } from "@/app/actions";
import { field, indentOnTab, label } from "@/components/SnippetForm";
import type { Note } from "@/lib/notes";

export function NoteForm({ note }: { note?: Note }) {
  const [state, action, pending] = useActionState(saveNote, {});
  const [title, setTitle] = useState(note?.title ?? "");
  const [tags, setTags] = useState(note?.tags.join(", ") ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [message, setMessage] = useState("");

  const payload = JSON.stringify({
    title,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    body,
    message,
    ...(note ? { baseVersion: note.currentVersion } : {}),
  });

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="slug" value={note?.slug ?? ""} />
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={label}>Title</span>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Acme hosting setup"
            required
            autoFocus={!note}
          />
        </label>
        <label>
          <span className={label}>Tags (comma separated)</span>
          <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="acme, hosting" />
        </label>
      </div>

      <label className="block">
        <span className={label}>Note (markdown)</span>
        <textarea
          className={`${field} block min-h-96 resize-y font-mono text-[13px] leading-relaxed`}
          style={{ tabSize: 2 }}
          value={body}
          onKeyDown={indentOnTab}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Steps, decisions, client details. Keep passwords and API keys in Credentials."
        />
      </label>

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className={label}>{note ? "What changed?" : "Change note (optional)"}</span>
          <input
            className={field}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={note ? "Added the rollback steps" : "Created"}
          />
        </label>
        <div className="flex gap-3">
          <Link
            href={note ? `/notes/${note.slug}` : "/notes"}
            className="rounded-md border border-line px-4 py-2 text-sm hover:border-muted"
          >
            Cancel
          </Link>
          <button
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Saving" : note ? `Save as version ${note.currentVersion + 1}` : "Create note"}
          </button>
        </div>
      </div>
      {state.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Create the New menu and update the layout**

Create `components/NewMenu.tsx`:

```tsx
"use client";

import Link from "next/link";

/** The header's New button: a <details> menu that closes itself when an item is picked. */
export function NewMenu({ items }: { items: { href: string; label: string }[] }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none whitespace-nowrap rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:brightness-110 [&::-webkit-details-marker]:hidden">
        New
      </summary>
      <div
        className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-md border border-line bg-panel py-1 text-sm shadow-lg"
        onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
      >
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="block px-3 py-2 hover:bg-raised">
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
```

In `app/(app)/layout.tsx`:
- Add `import { NewMenu } from "@/components/NewMenu";` after the `Logo` import.
- Replace the `<nav>` element with:

```tsx
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/" className="hidden hover:text-text sm:inline">
              Snippets
            </Link>
            <Link href="/notes" className="hover:text-text">
              Notes
            </Link>
            <Link href="/connect" className="hover:text-text">
              Connect
            </Link>
          </nav>
```

- Replace the `<Link href="/snippets/new" ...>...</Link>` element inside `ml-auto` with:

```tsx
            <NewMenu
              items={[
                { href: "/snippets/new", label: "Snippet" },
                { href: "/notes/new", label: "Note" },
              ]}
            />
```

- [ ] **Step 5: Make the not-found page generic**

Replace the contents of `app/(app)/not-found.tsx` with:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-lg font-medium">That page does not exist</p>
      <Link href="/" className="mt-3 inline-block text-sm text-accent hover:underline">
        Back to all snippets
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Create the notes list page**

Create `app/(app)/notes/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { listNotes, listNoteTags } from "@/lib/notes";

export const metadata: Metadata = { title: "Notes" };

type Search = { q?: string; tag?: string };

function href(current: Search, change: Search) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...change })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/notes?${query}` : "/notes";
}

export default async function NotesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const db = await getDb();
  const [notes, tags] = await Promise.all([listNotes(db, { query: search.q, tag: search.tag }), listNoteTags(db)]);
  const filtered = Boolean(search.q || search.tag);

  return (
    <div className="space-y-6">
      <form className="flex gap-3" action="/notes">
        <input
          type="search"
          name="q"
          defaultValue={search.q}
          placeholder="Search notes"
          className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent"
        />
        {search.tag && <input type="hidden" name="tag" value={search.tag} />}
        <button className="rounded-md border border-line px-4 py-2 text-sm hover:border-muted">Search</button>
      </form>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map(({ tag, count }) => {
            const active = search.tag === tag;
            return (
              <Link
                key={tag}
                href={href(search, { tag: active ? undefined : tag })}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-text"
                }`}
              >
                {tag} <span className="opacity-60">{count}</span>
              </Link>
            );
          })}
        </div>
      )}

      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
          {filtered ? (
            <>
              <p className="text-muted">Nothing matches that search.</p>
              <Link href="/notes" className="mt-3 inline-block text-sm text-accent hover:underline">
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No notes yet</p>
              <p className="mt-1 text-sm text-muted">Write one here, or ask an agent to save one.</p>
              <Link
                href="/notes/new"
                className="mt-5 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
              >
                New note
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <li key={n.slug}>
              <Link
                href={`/notes/${n.slug}`}
                className="flex h-full flex-col rounded-lg border border-line bg-panel p-4 transition hover:border-muted"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-medium leading-snug">{n.title}</h2>
                  <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    v{n.version}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-muted">{n.slug}</p>
                {n.excerpt && <p className="mt-3 line-clamp-3 text-sm text-text/75">{n.excerpt}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted">
                  <span>{timeAgo(n.updatedAt)}</span>
                  {n.tags.slice(0, 3).map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Create the new and edit pages**

Create `app/(app)/notes/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import { NoteForm } from "@/components/NoteForm";

export const metadata: Metadata = { title: "New note" };

export default function NewNotePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New note</h1>
      <NoteForm />
    </div>
  );
}
```

Create `app/(app)/notes/[slug]/edit/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteForm } from "@/components/NoteForm";
import { getDb } from "@/lib/db";
import { getNote } from "@/lib/notes";

export const metadata: Metadata = { title: "Edit note" };

export default async function EditNotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = await getNote(await getDb(), slug);
  if (!note) notFound();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/notes/${slug}`} className="text-sm text-muted hover:text-text">
          Back to {note.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Edit note</h1>
        <p className="mt-1 text-sm text-muted">
          Saving creates version {note.currentVersion + 1}. Every earlier version stays in the history.
        </p>
      </div>
      <NoteForm note={note} />
    </div>
  );
}
```

- [ ] **Step 8: Create the note page**

Create `app/(app)/notes/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeNote, restoreNote } from "@/app/actions";
import { CodeBlock } from "@/components/CodeBlock";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { getDb } from "@/lib/db";
import { formatDate, formatSource } from "@/lib/format";
import { getNote } from "@/lib/notes";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ v?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const note = await getNote(await getDb(), (await params).slug);
  return { title: note?.title ?? "Not found" };
}

export default async function NotePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { v } = await searchParams;
  const version = v ? Number(v) : undefined;
  const note = await getNote(await getDb(), slug, Number.isInteger(version) ? version : undefined);
  if (!note) notFound();

  const isLatest = note.version === note.currentVersion;
  const prompt = `Use my "${note.slug}" note from Snippeta.`;

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-6">
        {!isLatest && (
          <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm sm:flex-row sm:items-center">
            <p className="flex-1">
              You are viewing version {note.version}. The latest is version {note.currentVersion}.
            </p>
            <div className="flex gap-3">
              <Link href={`/notes/${slug}`} className="rounded-md border border-line px-3 py-1.5 hover:border-muted">
                View latest
              </Link>
              <form action={restoreNote}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="version" value={note.version} />
                <ConfirmButton
                  message={`Restore version ${note.version}? This saves it as a new version, nothing is lost.`}
                  className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-ink"
                >
                  Restore this version
                </ConfirmButton>
              </form>
            </div>
          </div>
        )}

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-raised px-2 py-0.5 font-mono text-muted">v{note.version}</span>
            {note.tags.map((tag) => (
              <Link key={tag} href={`/notes?tag=${encodeURIComponent(tag)}`} className="text-muted hover:text-text">
                #{tag}
              </Link>
            ))}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{note.title}</h1>
        </header>

        {note.body ? (
          <CodeBlock name="note.md" content={note.body} fallback="markdown" />
        ) : (
          <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">This note is empty.</p>
        )}
      </div>

      <aside className="space-y-6 text-sm lg:sticky lg:top-20 lg:self-start">
        {isLatest && (
          <div className="flex gap-2">
            <Link
              href={`/notes/${slug}/edit`}
              className="flex-1 rounded-md bg-accent px-3 py-2 text-center font-medium text-accent-ink hover:brightness-110"
            >
              Edit
            </Link>
            <Link
              href={`/notes/${slug}/history`}
              className="flex-1 rounded-md border border-line px-3 py-2 text-center hover:border-muted"
            >
              History
            </Link>
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-muted">Ask your agent</h2>
          <div className="flex items-start gap-2 rounded-md border border-line bg-panel p-3">
            <p className="flex-1 font-mono text-xs leading-relaxed">{prompt}</p>
            <CopyButton value={prompt} />
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Slug</dt>
          <dd className="truncate font-mono text-xs leading-5">{note.slug}</dd>
          <dt className="text-muted">Saved</dt>
          <dd>{formatDate(note.versionCreatedAt)}</dd>
          <dt className="text-muted">By</dt>
          <dd>{formatSource(note.source)}</dd>
          {note.message && (
            <>
              <dt className="text-muted">Change</dt>
              <dd>{note.message}</dd>
            </>
          )}
          <dt className="text-muted">Created</dt>
          <dd>{formatDate(note.createdAt)}</dd>
        </dl>

        {isLatest && (
          <form action={removeNote} className="border-t border-line pt-4">
            <input type="hidden" name="slug" value={slug} />
            <ConfirmButton
              message={`Delete "${note.title}" and all ${note.currentVersion} version(s)? This cannot be undone.`}
              className="text-danger hover:underline"
            >
              Delete note
            </ConfirmButton>
          </form>
        )}
      </aside>
    </article>
  );
}
```

- [ ] **Step 9: Create the history page**

Create `app/(app)/notes/[slug]/history/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { restoreNote } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DiffView } from "@/components/DiffView";
import { getDb } from "@/lib/db";
import { compareNotes } from "@/lib/diff";
import { formatDate, formatSource } from "@/lib/format";
import { getNote, getNoteVersionPair, listNoteVersions } from "@/lib/notes";

export const metadata: Metadata = { title: "Note history" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string; to?: string }> };

export default async function NoteHistoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const search = await searchParams;
  const db = await getDb();
  const note = await getNote(db, slug);
  if (!note) notFound();

  const versions = await listNoteVersions(db, slug);
  const numbers = new Set(versions.map((v) => v.version));
  const pick = (value: string | undefined, fallback: number) => (numbers.has(Number(value)) ? Number(value) : fallback);
  const to = pick(search.to, note.currentVersion);
  const from = pick(search.from, Math.max(1, to - 1));
  const diff = from !== to ? compareNotes(...(await getNoteVersionPair(db, slug, from, to))) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/notes/${slug}`} className="text-sm text-muted hover:text-text">
          Back to {note.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">
          {versions.length} version{versions.length === 1 ? "" : "s"}. Restoring saves the old content as a new
          version, so a rollback can be undone too.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <ol className="space-y-2 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
          {versions.map((v) => {
            const selected = v.version === to;
            const latest = v.version === note.currentVersion;
            return (
              <li
                key={v.version}
                className={`rounded-lg border p-3 text-sm ${selected ? "border-accent/60 bg-accent/5" : "border-line bg-panel"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium">
                    v{v.version}
                    {latest && <span className="ml-2 font-sans text-xs font-normal text-accent">latest</span>}
                  </span>
                  <span className="text-xs text-muted">{formatDate(v.createdAt)}</span>
                </div>
                <p className="mt-1">{v.message || <span className="text-muted">No note</span>}</p>
                <p className="mt-0.5 text-xs text-muted">{formatSource(v.source)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Link href={`/notes/${slug}?v=${v.version}`} className="text-muted hover:text-text">
                    View
                  </Link>
                  {v.version > 1 && (
                    <Link
                      href={`/notes/${slug}/history?from=${v.version - 1}&to=${v.version}`}
                      className="text-muted hover:text-text"
                    >
                      Changes
                    </Link>
                  )}
                  {!latest && (
                    <form action={restoreNote}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="version" value={v.version} />
                      <ConfirmButton
                        message={`Restore version ${v.version}? It will be saved as version ${note.currentVersion + 1}.`}
                        className="text-accent hover:underline"
                      >
                        Restore
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="min-w-0 space-y-4">
          <form className="flex flex-wrap items-end gap-3 text-sm">
            {(["from", "to"] as const).map((name) => (
              <label key={name}>
                <span className="mb-1 block capitalize text-muted">{name}</span>
                <select
                  name={name}
                  defaultValue={name === "from" ? from : to}
                  className="rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      Version {v.version}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button className="rounded-md border border-line px-4 py-2 hover:border-muted">Compare</button>
          </form>
          {diff ? (
            <DiffView diff={diff} />
          ) : (
            <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
              {versions.length === 1
                ? "There is only one version so far. Edits will show up here."
                : "Pick two different versions to compare."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Typecheck, test and build**

Run: `bun run test && bun run typecheck && bun run build`
Expected: tests pass, typecheck is clean, and the build lists the `/notes` routes with no errors.

- [ ] **Step 11: Manual check**

Run `ADMIN_PASSWORD=test-password SESSION_SECRET=dev bun run dev`, log in at `http://localhost:3000/login`, then:
1. Click **New → Note**. The menu closes and the form opens. Create a note titled "Deploy checklist" with tags `deploy` and a two-line body.
2. On the note page, the body shows as highlighted markdown with a Copy button.
3. Edit it: change one line, message "Tweak". Save. The note shows v2.
4. Open **History**. The diff shows the changed line. Restore v1. It becomes v3 with v1's body.
5. Go to **Notes**, search for a word from the body, and click the `deploy` tag. Both filter to the note.
6. Delete the note. You land on `/notes` with the empty state.

- [ ] **Step 12: Commit**

```bash
git add app components
git commit -m "feat: add notes pages to the dashboard"
```

---

### Task 7: Credentials dashboard

**Files:**
- Modify: `lib/format.ts` (`safeHref`)
- Create: `lib/format.test.ts`
- Modify: `app/actions.ts` (`saveCredential`, `removeCredential`, `revealSecret`)
- Create: `components/KeyMissing.tsx`
- Create: `components/SecretValue.tsx`
- Create: `components/CredentialForm.tsx`
- Modify: `app/(app)/layout.tsx` (nav and New menu)
- Create: `app/(app)/credentials/page.tsx`
- Create: `app/(app)/credentials/new/page.tsx`
- Create: `app/(app)/credentials/[slug]/page.tsx`
- Create: `app/(app)/credentials/[slug]/edit/page.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `lib/credentials.ts` (Task 5); `encryptionReady`, `CredentialsUnavailable`, `DecryptError` (Task 1); `field`, `label` from `components/SnippetForm.tsx` and `NewMenu` (Task 6).
- Produces:
  - `safeHref(url: string): string | null`
  - `saveCredential(_: FormState, form: FormData): Promise<FormState>` (fields `slug`, `payload`)
  - `removeCredential(form: FormData)` (field `slug`)
  - `revealSecret(slug: string, fieldId: string): Promise<{ value?: string; error?: string }>`

- [ ] **Step 1: Write the failing test for `safeHref`**

Create `lib/format.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { safeHref } from "./format";

describe("safeHref", () => {
  test("links only http and https URLs", () => {
    expect(safeHref("https://acme.myshopify.com/admin")).toBe("https://acme.myshopify.com/admin");
    expect(safeHref("  http://localhost:3000 ")).toBe("http://localhost:3000");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("acme.myshopify.com")).toBeNull();
    expect(safeHref("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/format.test.ts`
Expected: FAIL with `Export named 'safeHref' not found`.

- [ ] **Step 3: Implement `safeHref`**

Append to `lib/format.ts`:

```ts
/** The URL when it is a plain web link, so stored text can never become a javascript: link. */
export function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}
```

Run: `bun test lib/format.test.ts`
Expected: PASS.

- [ ] **Step 4: Add the credential server actions**

In `app/actions.ts`, add these imports after the `@/lib/notes` import:

```ts
import { createCredential, deleteCredential, revealField, updateCredential } from "@/lib/credentials";
import { CredentialsUnavailable, DecryptError } from "@/lib/crypto";
```

Append:

```ts
export async function saveCredential(_: FormState, form: FormData): Promise<FormState> {
  await requireAuth();
  const slug = String(form.get("slug") ?? "");
  let target: string;
  try {
    const data = JSON.parse(String(form.get("payload") ?? "{}"));
    const db = await getDb();
    target = (slug ? await updateCredential(db, slug, data) : await createCredential(db, data)).slug;
  } catch (error) {
    if (error instanceof SnippetError || error instanceof CredentialsUnavailable) return { error: error.message };
    console.error("[snippeta] credential save failed", error);
    return { error: "Could not save the credential. Try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/credentials/${target}`);
}

export async function removeCredential(form: FormData) {
  await requireAuth();
  await deleteCredential(await getDb(), String(form.get("slug")));
  revalidatePath("/", "layout");
  redirect("/credentials");
}

/** Decrypts one secret for the Reveal and Copy buttons. */
export async function revealSecret(slug: string, fieldId: string): Promise<{ value?: string; error?: string }> {
  await requireAuth();
  try {
    return { value: await revealField(await getDb(), String(slug), String(fieldId)) };
  } catch (error) {
    if (error instanceof SnippetError || error instanceof DecryptError || error instanceof CredentialsUnavailable) {
      return { error: error.message };
    }
    console.error("[snippeta] reveal failed", error);
    return { error: "Could not reveal this value. Try again." };
  }
}
```

- [ ] **Step 5: Create the shared components**

Create `components/KeyMissing.tsx`:

```tsx
/** Shown on credentials pages when SNIPPETA_ENCRYPTION_KEY is missing or invalid. */
export function KeyMissing() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 rounded-lg border border-accent/40 bg-accent/10 p-6 text-sm">
      <p className="text-base font-medium">Credentials need an encryption key</p>
      <p className="text-text/75">
        Set <code className="font-mono">SNIPPETA_ENCRYPTION_KEY</code> on the server to 32 random bytes in base64, then
        restart. Snippets and notes work without it.
      </p>
      <pre className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-xs">openssl rand -base64 32</pre>
      <p className="text-muted">Keep a copy somewhere safe. If the key is lost, saved secrets cannot be recovered.</p>
    </div>
  );
}
```

Create `components/SecretValue.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { revealSecret } from "@/app/actions";

const button =
  "shrink-0 rounded-md border border-line px-2.5 py-1 text-xs text-muted transition hover:border-muted hover:text-text disabled:opacity-60";

/** A hidden secret. Its value is fetched from the server only when revealed or copied, and forgotten on leaving. */
export function SecretValue({ slug, fieldId }: { slug: string; fieldId: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function load(): Promise<string> {
    const result = await revealSecret(slug, fieldId);
    if (result.error !== undefined) throw new Error(result.error);
    return result.value ?? "";
  }

  function reveal() {
    startTransition(async () => {
      try {
        setValue(await load());
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function copy() {
    try {
      // Handing the clipboard a promise keeps Safari's user-gesture check happy across the server round trip.
      const text = value !== null ? Promise.resolve(value) : load();
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) }),
      ]);
      setError("");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not copy.");
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 break-all font-mono text-sm">{value ?? "••••••••"}</span>
        <button type="button" className={button} disabled={pending} onClick={value === null ? reveal : () => setValue(null)}>
          {value === null ? (pending ? "Revealing" : "Reveal") : "Hide"}
        </button>
        <button type="button" className={button} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Create the credential form**

Create `components/CredentialForm.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { saveCredential } from "@/app/actions";
import { field, label } from "@/components/SnippetForm";
import type { Credential } from "@/lib/credentials";

/** One editable field. `stored` means a secret value already exists on the server. */
type Row = { key: number; id?: string; label: string; secret: boolean; value: string; stored: boolean };

const small = "rounded px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-40";

export function CredentialForm({ credential }: { credential?: Credential }) {
  const [state, action, pending] = useActionState(saveCredential, {});
  const [title, setTitle] = useState(credential?.title ?? "");
  const [url, setUrl] = useState(credential?.url ?? "");
  const [tags, setTags] = useState(credential?.tags.join(", ") ?? "");
  const [note, setNote] = useState(credential?.note ?? "");
  const [rows, setRows] = useState<Row[]>(
    credential?.fields.map((f, i) => ({ key: i, id: f.id, label: f.label, secret: f.secret, value: f.value ?? "", stored: f.secret })) ?? [
      { key: 0, label: "Username", secret: false, value: "", stored: false },
      { key: 1, label: "Password", secret: true, value: "", stored: false },
    ],
  );
  const nextKey = useRef(rows.length);

  const update = (key: number, change: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const move = (index: number, delta: number) =>
    setRows((list) => {
      const copy = [...list];
      const [row] = copy.splice(index, 1);
      copy.splice(index + delta, 0, row);
      return copy;
    });

  const payload = JSON.stringify({
    title,
    url,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    note,
    fields: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), label: r.label, secret: r.secret, value: r.value })),
  });

  return (
    <form action={action} className="space-y-6" autoComplete="off">
      <input type="hidden" name="slug" value={credential?.slug ?? ""} />
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={label}>Title</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Acme Shopify" required autoFocus={!credential} />
        </label>
        <label>
          <span className={label}>URL (optional)</span>
          <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://acme.myshopify.com/admin" />
        </label>
      </div>

      <label className="block">
        <span className={label}>Tags (comma separated)</span>
        <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="acme, shopify" />
      </label>

      <div className="space-y-2">
        <span className={label}>Fields</span>
        {rows.map((row, index) => (
          <div key={row.key} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-2 sm:flex-row sm:items-center">
            <input
              aria-label="Field label"
              className={`${field} sm:w-44`}
              value={row.label}
              onChange={(e) => update(row.key, { label: e.target.value })}
              placeholder="Label"
              required
            />
            <input
              aria-label={`Value of ${row.label}`}
              type={row.secret ? "password" : "text"}
              autoComplete={row.secret ? "new-password" : "off"}
              className={`${field} min-w-0 flex-1 font-mono text-sm`}
              value={row.value}
              onChange={(e) => update(row.key, { value: e.target.value })}
              placeholder={row.secret && row.stored ? "Unchanged" : row.stored ? "Enter the value again" : "Value"}
            />
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1.5 px-2 text-xs text-muted">
                <input type="checkbox" checked={row.secret} onChange={(e) => update(row.key, { secret: e.target.checked })} />
                Secret
              </label>
              <button type="button" className={small} disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                Up
              </button>
              <button type="button" className={small} disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
                Down
              </button>
              <button
                type="button"
                className={`${small} hover:text-danger`}
                disabled={rows.length === 1}
                onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((list) => [...list, { key: nextKey.current++, label: "", secret: true, value: "", stored: false }])}
          className="w-full rounded-lg border border-dashed border-line py-2.5 text-sm text-muted hover:border-muted hover:text-text"
        >
          Add a field
        </button>
        {credential && <p className="text-xs text-muted">Leave a secret empty to keep its saved value.</p>}
      </div>

      <label className="block">
        <span className={label}>Note (optional)</span>
        <textarea
          className={`${field} min-h-20 text-sm`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What it is for, who set it up."
        />
        <span className="mt-1 block text-xs text-muted">Don&apos;t put secrets here. This note isn&apos;t encrypted.</span>
      </label>

      <div className="flex justify-end gap-3 border-t border-line pt-6">
        <Link
          href={credential ? `/credentials/${credential.slug}` : "/credentials"}
          className="rounded-md border border-line px-4 py-2 text-sm hover:border-muted"
        >
          Cancel
        </Link>
        <button
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Saving" : credential ? "Save" : "Create credential"}
        </button>
      </div>
      {state.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 7: Create the credentials list page**

Create `app/(app)/credentials/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { KeyMissing } from "@/components/KeyMissing";
import { listCredentials, listCredentialTags } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Credentials" };

type Search = { q?: string; tag?: string };

function href(current: Search, change: Search) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...change })) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `/credentials?${query}` : "/credentials";
}

export default async function CredentialsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!encryptionReady()) return <KeyMissing />;
  const search = await searchParams;
  const db = await getDb();
  const [credentials, tags] = await Promise.all([
    listCredentials(db, { query: search.q, tag: search.tag }),
    listCredentialTags(db),
  ]);
  const filtered = Boolean(search.q || search.tag);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credentials</h1>
        <p className="mt-1 text-sm text-muted">Only visible here. Agents connected over MCP can never read these.</p>
      </div>

      <form className="flex gap-3" action="/credentials">
        <input
          type="search"
          name="q"
          defaultValue={search.q}
          placeholder="Search titles, URLs and labels"
          className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent"
        />
        {search.tag && <input type="hidden" name="tag" value={search.tag} />}
        <button className="rounded-md border border-line px-4 py-2 text-sm hover:border-muted">Search</button>
      </form>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map(({ tag, count }) => {
            const active = search.tag === tag;
            return (
              <Link
                key={tag}
                href={href(search, { tag: active ? undefined : tag })}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-text"
                }`}
              >
                {tag} <span className="opacity-60">{count}</span>
              </Link>
            );
          })}
        </div>
      )}

      {credentials.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
          {filtered ? (
            <>
              <p className="text-muted">Nothing matches that search.</p>
              <Link href="/credentials" className="mt-3 inline-block text-sm text-accent hover:underline">
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No credentials yet</p>
              <Link
                href="/credentials/new"
                className="mt-5 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink"
              >
                New credential
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {credentials.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/credentials/${c.slug}`}
                className="flex h-full flex-col rounded-lg border border-line bg-panel p-4 transition hover:border-muted"
              >
                <h2 className="font-medium leading-snug">{c.title}</h2>
                {c.url && <p className="mt-1 truncate font-mono text-xs text-muted">{c.url}</p>}
                <p className="mt-3 text-sm text-text/75">{c.labels.join(" · ")}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted">
                  <span>{timeAgo(c.updatedAt)}</span>
                  {c.tags.slice(0, 3).map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create the new, detail and edit pages**

Create `app/(app)/credentials/new/page.tsx`:

```tsx
import type { Metadata } from "next";
import { CredentialForm } from "@/components/CredentialForm";
import { KeyMissing } from "@/components/KeyMissing";
import { encryptionReady } from "@/lib/crypto";

export const metadata: Metadata = { title: "New credential" };

export default function NewCredentialPage() {
  if (!encryptionReady()) return <KeyMissing />;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New credential</h1>
      <CredentialForm />
    </div>
  );
}
```

Create `app/(app)/credentials/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeCredential } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopyButton } from "@/components/CopyButton";
import { KeyMissing } from "@/components/KeyMissing";
import { SecretValue } from "@/components/SecretValue";
import { getCredential } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { formatDate, safeHref } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: "Credential" };

export default async function CredentialPage({ params }: Props) {
  if (!encryptionReady()) return <KeyMissing />;
  const { slug } = await params;
  const credential = await getCredential(await getDb(), slug);
  if (!credential) notFound();
  const link = safeHref(credential.url);

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-6">
        <header className="space-y-3">
          {credential.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {credential.tags.map((tag) => (
                <Link key={tag} href={`/credentials?tag=${encodeURIComponent(tag)}`} className="text-muted hover:text-text">
                  #{tag}
                </Link>
              ))}
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{credential.title}</h1>
          {credential.url &&
            (link ? (
              <a href={link} target="_blank" rel="noreferrer" className="block break-all font-mono text-sm text-accent hover:underline">
                {credential.url}
              </a>
            ) : (
              <p className="break-all font-mono text-sm text-muted">{credential.url}</p>
            ))}
        </header>

        <dl className="divide-y divide-line rounded-lg border border-line bg-panel">
          {credential.fields.map((f) => (
            <div key={f.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:items-center sm:gap-4">
              <dt className="text-sm text-muted">{f.label}</dt>
              <dd className="min-w-0">
                {f.secret ? (
                  <SecretValue slug={credential.slug} fieldId={f.id} />
                ) : f.value ? (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 break-all font-mono text-sm">{f.value}</span>
                    <CopyButton value={f.value} />
                  </div>
                ) : (
                  <span className="text-sm text-muted">(empty)</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {credential.note && (
          <section className="rounded-lg border border-line bg-panel p-4">
            <h2 className="mb-2 text-sm font-medium text-muted">Note</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{credential.note}</p>
          </section>
        )}
      </div>

      <aside className="space-y-6 text-sm lg:sticky lg:top-20 lg:self-start">
        <Link
          href={`/credentials/${slug}/edit`}
          className="block rounded-md bg-accent px-3 py-2 text-center font-medium text-accent-ink hover:brightness-110"
        >
          Edit
        </Link>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-muted">Updated</dt>
          <dd>{formatDate(credential.updatedAt)}</dd>
          <dt className="text-muted">Created</dt>
          <dd>{formatDate(credential.createdAt)}</dd>
        </dl>
        <form action={removeCredential} className="border-t border-line pt-4">
          <input type="hidden" name="slug" value={slug} />
          <ConfirmButton message={`Delete "${credential.title}"? This cannot be undone.`} className="text-danger hover:underline">
            Delete credential
          </ConfirmButton>
        </form>
      </aside>
    </article>
  );
}
```

Create `app/(app)/credentials/[slug]/edit/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CredentialForm } from "@/components/CredentialForm";
import { KeyMissing } from "@/components/KeyMissing";
import { getCredential } from "@/lib/credentials";
import { encryptionReady } from "@/lib/crypto";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Edit credential" };

export default async function EditCredentialPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!encryptionReady()) return <KeyMissing />;
  const { slug } = await params;
  const credential = await getCredential(await getDb(), slug);
  if (!credential) notFound();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/credentials/${slug}`} className="text-sm text-muted hover:text-text">
          Back to {credential.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Edit credential</h1>
      </div>
      <CredentialForm credential={credential} />
    </div>
  );
}
```

- [ ] **Step 9: Add Credentials to the navigation**

In `app/(app)/layout.tsx`, add this link between the Notes and Connect links:

```tsx
            <Link href="/credentials" className="hover:text-text">
              Credentials
            </Link>
```

Add `{ href: "/credentials/new", label: "Credential" },` as the last item in the `NewMenu` `items` array.

- [ ] **Step 10: Update the README**

In `README.md`, add after the "A snippet" section:

```markdown
## Notes and credentials

- **Notes**: free-form markdown with the same version history as snippets. Agents can search, read and save them over MCP.
- **Credentials**: logins and API keys for your own reference. Each has a title, URL, tags, a note and labelled fields, and any field can be marked secret. Secret values are encrypted with `SNIPPETA_ENCRYPTION_KEY` and only shown when you click Reveal or Copy. They are never available over MCP, and there is no history: changing a value replaces it.
```

In "Run locally", change the `cp` line comment to:

```bash
cp .env.example .env.local   # set ADMIN_PASSWORD, SESSION_SECRET and SNIPPETA_ENCRYPTION_KEY
```

In "Deploy to Vercel" step 3, change the variable list to:

```
3. Environment variables: `ADMIN_PASSWORD`, `SESSION_SECRET` (`openssl rand -hex 32`), `SNIPPETA_ENCRYPTION_KEY` (`openssl rand -base64 32`, keep a copy: losing it makes saved secrets unreadable), optionally `SNIPPETA_TIMEZONE` (defaults to `Australia/Sydney`).
```

- [ ] **Step 11: Test, typecheck and build**

Run: `bun run test && bun run typecheck && bun run build`
Expected: all tests pass, typecheck is clean, and the build lists the `/credentials` routes with no errors.

- [ ] **Step 12: Manual check**

Run without a key first: `ADMIN_PASSWORD=test-password SESSION_SECRET=dev bun run dev`. Log in and open `/credentials`.
Expected: the "Credentials need an encryption key" message. Snippets and Notes still work.

Stop the server and restart with a key: `ADMIN_PASSWORD=test-password SESSION_SECRET=dev SNIPPETA_ENCRYPTION_KEY=$(openssl rand -base64 32) bun run dev`. Log in again, then:
1. **New → Credential**. Title "Acme Shopify", URL `https://acme.myshopify.com/admin`, Username `admin@acme.test`, Password `hunter2`, then add a secret field "API key" `shpat_123`. Create.
2. The detail page shows the username in full and both secrets as dots. The URL is a link.
3. Click **Reveal** on Password. It shows `hunter2`. Click **Hide**. Click **Copy** on API key and paste somewhere. It pastes `shpat_123`.
4. **Edit**. The secret inputs are empty with "Unchanged". Move API key up, change nothing else, and save. Reveal both. The values are unchanged.
5. Edit again. Set the URL to `javascript:alert(1)` and save. The URL shows as plain text, not a link.
6. In a terminal, confirm nothing secret is stored in plain text:

```bash
grep -r "hunter2" .data/pglite || echo "not found in plain text"
```

Expected: `not found in plain text`.
7. Delete the credential. You land on `/credentials` with the empty state.

- [ ] **Step 13: Commit**

```bash
git add lib/format.ts lib/format.test.ts app components README.md
git commit -m "feat: add credentials pages with reveal and copy"
```
