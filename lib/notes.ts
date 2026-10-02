import type { Db, Row } from "./db";
import { plainText } from "./format";
import { orderBy, parseSort, type Sort } from "./sort";
import { availableSlug, copyTitle, parse, slugify, SnippetError } from "./snippets";
import { noteInputSchema, notePatchSchema, slugSchema, type NoteInput, type NotePatch } from "./validation";

export type NoteSummary = {
  slug: string;
  title: string;
  tags: string[];
  version: number;
  excerpt: string;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

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
  id: string;
  currentVersion: number;
  pinned: boolean;
  locked: boolean;
  unreadable: boolean;
  createdAt: string;
  updatedAt: string;
  versionCreatedAt: string;
};

export type NoteVersionSummary = Pick<NoteVersion, "version" | "title" | "message" | "source" | "createdAt">;

export type NoteCodec = {
  encode(noteId: string, version: number, body: string): Promise<string>;
  decode(noteId: string, version: number, stored: string): Promise<string>;
};

const LOCKED = (slug: string) =>
  new SnippetError(`"${slug}" is locked. Unlock it in the dashboard to read or change it.`, "invalid");

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

export type NoteListOptions = {
  query?: string;
  tag?: string;
  limit?: number;
  sort?: Sort;
  hideLocked?: boolean;
  onlyLocked?: boolean;
};

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
    where.push(`(n.title ILIKE ${p} OR n.slug ILIKE ${p} OR n.tags::text ILIKE ${p} OR (n.locked_at IS NULL AND v.body ILIKE ${p}))`);
  }
  if (options.hideLocked) where.push("n.locked_at IS NULL");
  if (options.onlyLocked) where.push("n.locked_at IS NOT NULL");
  if (options.tag) where.push(`n.tags @> jsonb_build_array(${param(options.tag.toLowerCase())}::text)`);

  const order = termParams.map((p) => `(n.title ILIKE ${p} OR n.slug ILIKE ${p})::int`);
  const limit = param(Math.min(Math.max(options.limit ?? 100, 1), 500));

  const rows = await db.query(
    `SELECT n.slug, n.title, n.tags, n.current_version, n.created_at, n.updated_at, n.pinned_at, n.locked_at,
            CASE WHEN n.locked_at IS NULL THEN left(v.body, 400) ELSE '' END AS excerpt
     FROM notes n
     JOIN note_versions v ON v.note_id = n.id AND v.version = n.current_version
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${orderBy("n", parseSort(options.sort), order, true)}
     LIMIT ${limit}`,
    params,
  );
  return rows.map((r) => ({
    slug: r.slug as string,
    title: r.title as string,
    tags: r.tags as string[],
    version: r.current_version as number,
    excerpt: plainText(r.excerpt as string),
    pinned: r.pinned_at != null,
    locked: r.locked_at != null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }));
}

export async function listNoteTags(db: Db, { hideLocked = false }: { hideLocked?: boolean } = {}): Promise<{ tag: string; count: number }[]> {
  const rows = await db.query<{ tag: string; count: number | string }>(
    `SELECT tag, count(*) AS count FROM notes, jsonb_array_elements_text(tags) AS tag
     ${hideLocked ? "WHERE locked_at IS NULL" : ""}
     GROUP BY tag ORDER BY count(*) DESC, tag`,
  );
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

export async function getNote(db: Db, slug: string, version?: number, codec?: NoteCodec): Promise<Note | null> {
  const rows = await db.query(
    `SELECT n.id, n.slug, n.current_version, n.created_at AS note_created_at, n.updated_at, n.pinned_at, n.locked_at,
            v.version, v.title, v.tags, v.body, v.message, v.source, v.created_at
     FROM notes n
     JOIN note_versions v ON v.note_id = n.id AND v.version = COALESCE($2::int, n.current_version)
     WHERE n.slug = $1`,
    [slug, version ?? null],
  );
  const row = rows[0];
  if (!row) return null;
  const locked = row.locked_at != null;
  const version_ = toVersion(row);
  if (locked) version_.body = codec ? await codec.decode(row.id as string, version_.version, version_.body) : "";
  return {
    ...version_,
    id: row.id as string,
    currentVersion: row.current_version as number,
    pinned: row.pinned_at != null,
    locked,
    unreadable: locked && !codec,
    createdAt: iso(row.note_created_at),
    updatedAt: iso(row.updated_at),
    versionCreatedAt: iso(row.created_at),
  };
}

async function requireNote(db: Db, slug: string, version?: number, codec?: NoteCodec): Promise<Note> {
  const note = await getNote(db, slug, version, codec);
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

export async function updateNote(
  db: Db,
  slug: string,
  patch: NotePatch,
  source = "web",
  codec?: NoteCodec,
): Promise<{ note: Note; changed: boolean }> {
  const data = parse(notePatchSchema, patch);
  const current = await requireNote(db, slug, undefined, codec);
  if (current.unreadable) throw LOCKED(slug);

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

  await insertNoteVersion(db, current, next, data.message || "Updated", source, codec);
  return { note: await requireNote(db, slug, undefined, codec), changed: true };
}

async function insertNoteVersion(
  db: Db,
  current: Note,
  next: Pick<NoteVersion, (typeof NOTE_FIELDS)[number]>,
  message: string,
  source: string,
  codec?: NoteCodec,
) {
  const { slug, currentVersion: expected } = current;
  let body = next.body;
  if (current.locked) {
    if (!codec) throw LOCKED(slug);
    body = await codec.encode(current.id, expected + 1, body);
  }
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
    [slug, expected, next.title, JSON.stringify(next.tags), body, message, source],
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

export async function getNoteVersionPair(db: Db, slug: string, from: number, to?: number, codec?: NoteCodec) {
  const [a, b] = await Promise.all([requireNote(db, slug, from, codec), requireNote(db, slug, to, codec)]);
  return [a, b] as const;
}

export async function restoreNoteVersion(
  db: Db,
  slug: string,
  version: number,
  source = "web",
  message?: string,
  codec?: NoteCodec,
): Promise<Note> {
  const [target, current] = await Promise.all([requireNote(db, slug, version, codec), requireNote(db, slug, undefined, codec)]);
  if (current.unreadable) throw LOCKED(slug);
  if (version === current.currentVersion) {
    throw new SnippetError(`Version ${version} is already the latest version of "${slug}"`, "invalid");
  }
  await insertNoteVersion(db, current, target, message || `Restored version ${version}`, source, codec);
  return requireNote(db, slug, undefined, codec);
}

export async function deleteNote(db: Db, slug: string): Promise<void> {
  const rows = await db.query(`DELETE FROM notes WHERE slug = $1 RETURNING id`, [slugSchema.parse(slug)]);
  if (!rows.length) throw new SnippetError(`No note with the slug "${slug}"`, "not_found");
}

export async function cloneNote(db: Db, slug: string, source = "web"): Promise<Note> {
  const original = await getNote(db, slug);
  if (!original) throw new SnippetError(`No note called "${slug}".`, "not_found");
  if (original.locked) throw new SnippetError("Locked notes can't be cloned.", "invalid");
  return createNote(
    db,
    { title: copyTitle(original.title), tags: original.tags, body: original.body, message: `Copied from ${original.slug}` },
    source,
  );
}

export async function setNotePinned(db: Db, slug: string, pinned: boolean): Promise<void> {
  const rows = await db.query(
    `UPDATE notes SET pinned_at = CASE WHEN $2 THEN coalesce(pinned_at, now()) END WHERE slug = $1 RETURNING slug`,
    [slug, pinned],
  );
  if (rows.length === 0) throw new SnippetError(`No note called "${slug}".`, "not_found");
}

export async function setNoteLocked(db: Db, slug: string, locked: boolean, codec: NoteCodec): Promise<void> {
  const rows = await db.query(
    `SELECT n.id, n.current_version, n.locked_at, v.version, v.body
     FROM notes n JOIN note_versions v ON v.note_id = n.id
     WHERE n.slug = $1 ORDER BY v.version`,
    [slug],
  );
  if (!rows.length) throw new SnippetError(`No note called "${slug}".`, "not_found");
  const { id, current_version: expected } = rows[0] as { id: string; current_version: number };
  if ((rows[0].locked_at != null) === locked) return;

  const bodies = await Promise.all(
    rows.map(async (r) => ({
      version: r.version as number,
      body: locked
        ? await codec.encode(id, r.version as number, r.body as string)
        : await codec.decode(id, r.version as number, r.body as string),
    })),
  );
  const done = await db.query(
    `WITH next AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS x(version int, body text)),
     changed AS (
       UPDATE note_versions v SET body = next.body FROM next
       WHERE v.note_id = $1 AND v.version = next.version
         AND EXISTS (SELECT 1 FROM notes WHERE id = $1 AND current_version = $2 AND (locked_at IS NOT NULL) = NOT $4::boolean)
       RETURNING 1
     )
     UPDATE notes SET locked_at = CASE WHEN $4::boolean THEN now() END
     WHERE id = $1 AND current_version = $2 AND (locked_at IS NOT NULL) = NOT $4::boolean
     RETURNING id`,
    [id, expected, JSON.stringify(bodies), locked],
  );
  if (!done.length) {
    throw new SnippetError(`"${slug}" was changed while locking it. Reload and try again.`, "conflict");
  }
}
