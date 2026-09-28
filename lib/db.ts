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
];

async function migrate(db: Db) {
  for (const statement of SCHEMA) await db.query(statement);
}

async function neonDb(url: string): Promise<Db> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return {
    query: async <T extends Row>(text: string, params: unknown[] = []) =>
      (await sql.query(text, params)) as T[],
  };
}

export async function pgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) await (await import("node:fs/promises")).mkdir(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  return {
    query: async <T extends Row>(text: string, params: unknown[] = []) =>
      (await pg.query<T>(text, params)).rows,
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
    const db = url ? await neonDb(url) : await pgliteDb(".data/pglite");
    return prepare(db);
  })().catch((error) => {
    instance = undefined;
    throw error;
  });
  return instance;
}
