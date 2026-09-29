import type { Db } from "./db";
import { availableSlug, SnippetError } from "./snippets";
import { slugSchema } from "./validation";

/**
 * Recently deleted items. Deleting moves an item out of its table into `trash`, with every version
 * alongside it, so nothing else (lists, search, MCP, share links) has to skip deleted rows: they
 * simply aren't there. Restoring moves it back, id and all, so its history, lock and share links
 * return with it. After 30 days it goes for good, along with its share links. Each move is one
 * statement (see lib/db.ts), and the row's own encryption (locked notes, secrets) travels as is.
 */

export type TrashKind = "snippets" | "notes" | "credentials";

export const KEEP_DAYS = 30;

const TABLES: Record<TrashKind, { table: string; versions?: { table: string; key: string } }> = {
  snippets: { table: "snippets", versions: { table: "snippet_versions", key: "snippet_id" } },
  notes: { table: "notes", versions: { table: "note_versions", key: "note_id" } },
  credentials: { table: "credentials" },
};

export type TrashedItem = {
  id: string;
  kind: TrashKind;
  slug: string;
  title: string;
  deletedAt: string;
  /** When it goes for good. */
  purgeAt: string;
};

function toItem(row: Record<string, unknown>): TrashedItem {
  const deletedAt = new Date(row.deleted_at as string);
  return {
    id: row.id as string,
    kind: row.kind as TrashKind,
    slug: row.slug as string,
    title: row.title as string,
    deletedAt: deletedAt.toISOString(),
    purgeAt: new Date(deletedAt.getTime() + KEEP_DAYS * 86_400_000).toISOString(),
  };
}

/** Moves an item and its versions into the trash. Returns its id, for an undo. */
export async function trashItem(db: Db, kind: TrashKind, slug: string): Promise<string> {
  const { table, versions } = TABLES[kind];
  // The versions are read in the same statement as the delete, so they're still visible to it.
  const history = versions
    ? `coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.version) FROM ${versions.table} v WHERE v.${versions.key} = d.id), '[]'::jsonb)`
    : `'[]'::jsonb`;
  const rows = await db.query<{ id: string }>(
    `WITH d AS (DELETE FROM ${table} WHERE slug = $1 RETURNING *)
     INSERT INTO trash (id, kind, slug, title, item, versions)
     SELECT d.id, $2, d.slug, d.title, to_jsonb(d), ${history} FROM d
     RETURNING id`,
    [slugSchema.parse(slug), kind],
  );
  if (!rows.length) throw new SnippetError(`Nothing called "${slug}" to delete.`, "not_found");
  await purgeExpired(db);
  return rows[0].id;
}

/**
 * Puts a deleted item back where it was. If its slug was taken in the meantime it comes back
 * under the next free one (lenis-2). Returns the slug it has now.
 */
export async function restoreItem(db: Db, id: string): Promise<{ kind: TrashKind; slug: string }> {
  const found = await db.query<{ kind: TrashKind; slug: string }>(`SELECT kind, slug FROM trash WHERE id = $1`, [id]);
  if (!found.length) throw new SnippetError("That item is no longer in Recently deleted.", "not_found");
  const { kind } = found[0];
  const { table, versions } = TABLES[kind];
  const slug = await availableSlug(db, found[0].slug, kind);
  const history = versions
    ? `, v AS (INSERT INTO ${versions.table} SELECT (jsonb_populate_recordset(null::${versions.table}, t.versions)).* FROM t)`
    : "";
  const rows = await db.query<{ slug: string }>(
    `WITH t AS (DELETE FROM trash WHERE id = $1 RETURNING *),
     s AS (INSERT INTO ${table} SELECT (jsonb_populate_record(null::${table}, t.item || jsonb_build_object('slug', $2::text))).* FROM t RETURNING slug)
     ${history}
     SELECT slug FROM s`,
    [id, slug],
  );
  if (!rows.length) throw new SnippetError("That item is no longer in Recently deleted.", "not_found");
  return { kind, slug: rows[0].slug };
}

/** Everything in the trash, most recently deleted first. Clears out anything past its 30 days. */
export async function listTrash(db: Db): Promise<TrashedItem[]> {
  await purgeExpired(db);
  const rows = await db.query(`SELECT id, kind, slug, title, deleted_at FROM trash ORDER BY deleted_at DESC`);
  return rows.map(toItem);
}

/** Deletes one trashed item for good, with its share links. */
export async function purgeItem(db: Db, id: string): Promise<void> {
  const rows = await db.query(
    `WITH p AS (DELETE FROM trash WHERE id = $1 RETURNING id, kind),
     s AS (DELETE FROM shares USING p WHERE shares.item_id = p.id AND shares.kind = p.kind)
     SELECT id FROM p`,
    [id],
  );
  if (!rows.length) throw new SnippetError("That item is no longer in Recently deleted.", "not_found");
}

/** Deletes for good whatever has been in the trash for more than 30 days, with its share links. */
export async function purgeExpired(db: Db): Promise<void> {
  await db.query(
    `WITH p AS (DELETE FROM trash WHERE deleted_at < now() - make_interval(days => $1) RETURNING id, kind)
     DELETE FROM shares USING p WHERE shares.item_id = p.id AND shares.kind = p.kind`,
    [KEEP_DAYS],
  );
}
