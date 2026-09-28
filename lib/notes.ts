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
