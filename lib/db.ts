
export type Row = Record<string, unknown>;

export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
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
  `ALTER TABLE snippets ADD COLUMN IF NOT EXISTS pinned_at timestamptz`,
  `ALTER TABLE notes ADD COLUMN IF NOT EXISTS pinned_at timestamptz`,
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
  `ALTER TABLE notes ADD COLUMN IF NOT EXISTS locked_at timestamptz`,
  `CREATE TABLE IF NOT EXISTS passkeys (
    id text PRIMARY KEY,
    public_key text NOT NULL,
    counter bigint NOT NULL DEFAULT 0,
    transports jsonb NOT NULL DEFAULT '[]'::jsonb,
    name text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
  )`,
  `ALTER TABLE shares ADD COLUMN IF NOT EXISTS token_enc text`,
  `ALTER TABLE shares ADD COLUMN IF NOT EXISTS passcode_enc text`,
  `CREATE TABLE IF NOT EXISTS settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS trash (
    id text PRIMARY KEY,
    kind text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    item jsonb NOT NULL,
    versions jsonb NOT NULL DEFAULT '[]'::jsonb,
    deleted_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS trash_deleted_at_idx ON trash (deleted_at)`,
  `CREATE TABLE IF NOT EXISTS oauth_clients (
    id text PRIMARY KEY,
    name text NOT NULL,
    redirect_uris jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_codes (
    code_hash text PRIMARY KEY,
    client_id text NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    resource text,
    expires_at timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_grants (
    id text PRIMARY KEY,
    client_id text NOT NULL,
    name text NOT NULL,
    access_hash text NOT NULL UNIQUE,
    access_expires_at timestamptz NOT NULL,
    refresh_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
  )`,
  `ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'mcp'`,
  `ALTER TABLE oauth_grants ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'mcp'`,
  `CREATE TABLE IF NOT EXISTS app_secrets (
    name text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
];

async function migrate(db: Db) {
  if (db.batch) {
    try {
      return await db.batch(SCHEMA);
    } catch (error) {
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

export async function prepare(db: Db): Promise<Db> {
  await migrate(db);
  return db;
}

const shared = globalThis as { jigDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  shared.jigDb ??= (async () => {
    const url = process.env.DATABASE_URL;
    const db = url ? await neonDb(url) : await pgliteDb(process.env.JIG_PGLITE_DIR || ".data/pglite");
    return prepare(db);
  })().catch((error) => {
    shared.jigDb = undefined;
    throw error;
  });
  return shared.jigDb;
}
