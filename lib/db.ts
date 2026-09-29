/**
 * A tiny Postgres wrapper with two drivers:
 * - Neon's HTTP driver when DATABASE_URL is set (production on Vercel).
 * - PGlite (Postgres compiled to WASM) otherwise, for local development and tests.
 *
 * Every write in this app is a single SQL statement, so no interactive
 * transactions are needed and the HTTP driver is enough.
 */

export type Row = Record<string, unknown>;

export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs parameterless statements in order, in one round trip where the driver can. */
  batch?(statements: string[]): Promise<void>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS snippets (
    id text PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    language text NOT NULL,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    current_version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS snippet_versions (
    snippet_id text NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    version integer NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    language text NOT NULL,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    instructions text NOT NULL DEFAULT '',
    dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
    files jsonb NOT NULL,
    message text NOT NULL DEFAULT '',
    source text NOT NULL DEFAULT 'web',
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (snippet_id, version)
  )`,
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id text PRIMARY KEY,
    name text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    prefix text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS snippets_updated_at_idx ON snippets (updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    ip text NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (ip, attempted_at)`,
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
  // Pinned items sit at the top of their list. Not part of any version: pinning edits nothing.
  `ALTER TABLE snippets ADD COLUMN IF NOT EXISTS pinned_at timestamptz`,
  `ALTER TABLE notes ADD COLUMN IF NOT EXISTS pinned_at timestamptz`,
  // Share links: only the token's hash is kept, so a link is shown once, when it is made.
  `CREATE TABLE IF NOT EXISTS shares (
    id text PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    kind text NOT NULL,
    item_id text NOT NULL,
    label text NOT NULL DEFAULT '',
    passcode_hash text,
    max_views integer,
    views integer NOT NULL DEFAULT 0,
    failed_attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS shares_item_idx ON shares (kind, item_id)`,
  // A locked note's text (in every version) is encrypted; set when it was locked.
  `ALTER TABLE notes ADD COLUMN IF NOT EXISTS locked_at timestamptz`,
  // Passkeys (Touch ID, Face ID, a security key) for signing in and unlocking locked notes.
  // Only the public key is kept; the private key never leaves the device.
  `CREATE TABLE IF NOT EXISTS passkeys (
    id text PRIMARY KEY,
    public_key text NOT NULL,
    counter bigint NOT NULL DEFAULT 0,
    transports jsonb NOT NULL DEFAULT '[]'::jsonb,
    name text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
  )`,
  // An encrypted copy of each new link and its passcode, so the owner can copy them again later.
  `ALTER TABLE shares ADD COLUMN IF NOT EXISTS token_enc text`,
  `ALTER TABLE shares ADD COLUMN IF NOT EXISTS passcode_enc text`,
  // Dashboard preferences (tab order, list layouts and sorts), so they follow you to every browser.
  `CREATE TABLE IF NOT EXISTS settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Secrets the app makes for itself: the random part of the signing key, and when sessions were
  // last ended everywhere. Never shown anywhere.
  `CREATE TABLE IF NOT EXISTS app_secrets (
    name text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
];

async function migrate(db: Db) {
  // One round trip instead of one per statement: this runs on every cold start.
  if (db.batch) {
    try {
      return await db.batch(SCHEMA);
    } catch (error) {
      // Every statement is idempotent, so running them one by one after a failed batch is safe.
      console.error("[jig] batched schema setup failed; running it statement by statement", error);
    }
  }
  for (const statement of SCHEMA) await db.query(statement);
}

async function neonDb(url: string): Promise<Db> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return {
    query: async <T extends Row>(text: string, params: unknown[] = []) =>
      (await sql.query(text, params)) as T[],
    // A non-interactive transaction goes over HTTP as a single request.
    batch: async (statements: string[]) => {
      await sql.transaction(statements.map((statement) => sql.query(statement)));
    },
  };
}

export async function pgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) await (await import("node:fs/promises")).mkdir(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  return {
    query: async <T extends Row>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
    batch: async (statements: string[]) => {
      await pg.exec(statements.join(";\n"));
    },
  };
}

/** Creates the tables on a fresh database. Safe to run repeatedly. */
export async function prepare(db: Db): Promise<Db> {
  await migrate(db);
  return db;
}

let instance: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  instance ??= (async () => {
    const url = process.env.DATABASE_URL;
    // JIG_PGLITE_DIR points a second local copy at its own data, e.g. the demo seeded for screenshots.
    const db = url ? await neonDb(url) : await pgliteDb(process.env.JIG_PGLITE_DIR || ".data/pglite");
    return prepare(db);
  })().catch((error) => {
    instance = undefined;
    throw error;
  });
  return instance;
}
