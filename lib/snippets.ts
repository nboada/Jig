import type { z } from "zod";
import type { Db, Row } from "./db";
import { orderBy, parseSort, type Sort } from "./sort";
import { familyMembers } from "./languages";
import { renameForTitle, slugify } from "./slug";
import {
  slugSchema,
  snippetInputSchema,
  snippetPatchSchema,
  type SnippetInput,
  type SnippetPatch,
} from "./validation";

export type SnippetFile = { name: string; content: string };

export type SnippetSummary = {
  slug: string;
  title: string;
  description: string;
  language: string;
  tags: string[];
  version: number;
  fileNames: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SnippetVersion = {
  slug: string;
  version: number;
  title: string;
  description: string;
  language: string;
  tags: string[];
  instructions: string;
  dependencies: string[];
  files: SnippetFile[];
  message: string;
  source: string;
  createdAt: string;
};

export type Snippet = SnippetVersion & {
  currentVersion: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  versionCreatedAt: string;
};

export type VersionSummary = Pick<SnippetVersion, "version" | "title" | "message" | "source" | "createdAt"> & {
  fileNames: string[];
};

export class SnippetError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "conflict" | "invalid",
  ) {
    super(message);
  }
}

const iso = (value: unknown) => new Date(value as string).toISOString();

export { slugify };

function toSummary(row: Row): SnippetSummary {
  return {
    slug: row.slug as string,
    title: row.title as string,
    description: row.description as string,
    language: row.language as string,
    tags: row.tags as string[],
    version: row.current_version as number,
    fileNames: row.file_names as string[],
    pinned: row.pinned_at != null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toVersion(row: Row): SnippetVersion {
  return {
    slug: row.slug as string,
    version: row.version as number,
    title: row.title as string,
    description: row.description as string,
    language: row.language as string,
    tags: row.tags as string[],
    instructions: row.instructions as string,
    dependencies: row.dependencies as string[],
    files: row.files as SnippetFile[],
    message: row.message as string,
    source: row.source as string,
    createdAt: iso(row.created_at),
  };
}

const FILE_NAMES = `coalesce((SELECT jsonb_agg(f->'name' ORDER BY i) FROM jsonb_array_elements(v.files) WITH ORDINALITY AS e(f, i)), '[]'::jsonb)`;

export type ListOptions = { query?: string; language?: string; tag?: string; limit?: number; sort?: Sort };

export async function listSnippets(db: Db, options: ListOptions = {}): Promise<SnippetSummary[]> {
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
      `(s.title ILIKE ${p} OR s.slug ILIKE ${p} OR s.description ILIKE ${p} OR s.tags::text ILIKE ${p} OR v.files::text ILIKE ${p})`,
    );
  }
  if (options.language) {
    where.push(`s.language IN (${familyMembers(options.language).map((l) => param(l)).join(", ")})`);
  }
  if (options.tag) where.push(`s.tags @> jsonb_build_array(${param(options.tag.toLowerCase())}::text)`);

  const order = termParams.map((p) => `(s.title ILIKE ${p} OR s.slug ILIKE ${p})::int`);
  const limit = param(Math.min(Math.max(options.limit ?? 100, 1), 500));

  const rows = await db.query(
    `SELECT s.slug, s.title, s.description, s.language, s.tags, s.current_version, s.created_at, s.updated_at, s.pinned_at,
       ${FILE_NAMES} AS file_names
     FROM snippets s
     JOIN snippet_versions v ON v.snippet_id = s.id AND v.version = s.current_version
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${orderBy("s", parseSort(options.sort), order, true)}
     LIMIT ${limit}`,
    params,
  );
  return rows.map(toSummary);
}

export async function listTags(db: Db): Promise<{ tag: string; count: number }[]> {
  const rows = await db.query<{ tag: string; count: number | string }>(
    `SELECT tag, count(*) AS count FROM snippets, jsonb_array_elements_text(tags) AS tag
     GROUP BY tag ORDER BY count(*) DESC, tag`,
  );
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

export async function getSnippet(db: Db, slug: string, version?: number): Promise<Snippet | null> {
  const rows = await db.query(
    `SELECT s.slug, s.current_version, s.created_at AS snippet_created_at, s.updated_at, s.pinned_at,
            v.version, v.title, v.description, v.language, v.tags, v.instructions,
            v.dependencies, v.files, v.message, v.source, v.created_at
     FROM snippets s
     JOIN snippet_versions v ON v.snippet_id = s.id AND v.version = COALESCE($2::int, s.current_version)
     WHERE s.slug = $1`,
    [slug, version ?? null],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...toVersion(row),
    currentVersion: row.current_version as number,
    pinned: row.pinned_at != null,
    createdAt: iso(row.snippet_created_at),
    updatedAt: iso(row.updated_at),
    versionCreatedAt: iso(row.created_at),
  };
}

async function requireSnippet(db: Db, slug: string, version?: number): Promise<Snippet> {
  const snippet = await getSnippet(db, slug, version);
  if (snippet) return snippet;
  throw new SnippetError(
    version ? `Snippet "${slug}" has no version ${version}` : `No snippet with the slug "${slug}"`,
    "not_found",
  );
}

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

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const detail = result.error.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
  throw new SnippetError(detail, "invalid");
}

export async function createSnippet(db: Db, input: SnippetInput, source = "web"): Promise<Snippet> {
  const data = parse(snippetInputSchema, input);

  let slug: string;
  if (data.slug) {
    slug = data.slug;
    if (await getSnippet(db, slug)) throw new SnippetError(`The slug "${slug}" is already taken`, "conflict");
  } else {
    slug = await availableSlug(db, slugify(data.title));
  }

  await db.query(
    `WITH s AS (
       INSERT INTO snippets (id, slug, title, description, language, tags)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id
     )
     INSERT INTO snippet_versions
       (snippet_id, version, title, description, language, tags, instructions, dependencies, files, message, source)
     SELECT s.id, 1, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11 FROM s`,
    [
      crypto.randomUUID(),
      slug,
      data.title,
      data.description,
      data.language,
      JSON.stringify(data.tags),
      data.instructions,
      JSON.stringify(data.dependencies),
      JSON.stringify(data.files),
      data.message || "Created",
      source,
    ],
  );
  return requireSnippet(db, slug);
}

const CONTENT_FIELDS = ["title", "description", "language", "tags", "instructions", "dependencies", "files"] as const;

export async function updateSnippet(
  db: Db,
  slug: string,
  patch: SnippetPatch,
  source = "web",
): Promise<{ snippet: Snippet; changed: boolean }> {
  const data = parse(snippetPatchSchema, patch);
  const current = await requireSnippet(db, slug);

  if (data.baseVersion && data.baseVersion !== current.currentVersion) {
    throw new SnippetError(
      `"${slug}" was changed since version ${data.baseVersion} (it is now at version ${current.currentVersion}). Reload and apply your edits again.`,
      "conflict",
    );
  }

  const next = {
    title: data.title ?? current.title,
    description: data.description ?? current.description,
    language: data.language ?? current.language,
    tags: data.tags ?? current.tags,
    instructions: data.instructions ?? current.instructions,
    dependencies: data.dependencies ?? current.dependencies,
    files: data.files ?? current.files,
  };

  const changed = CONTENT_FIELDS.some((f) => JSON.stringify(next[f]) !== JSON.stringify(current[f]));
  if (!changed) return { snippet: current, changed: false };

  await insertVersion(db, slug, current.currentVersion, next, data.message || "Updated", source);
  return { snippet: await requireSnippet(db, slug), changed: true };
}

async function insertVersion(
  db: Db,
  slug: string,
  expected: number,
  next: Pick<SnippetVersion, (typeof CONTENT_FIELDS)[number]>,
  message: string,
  source: string,
) {
  const rows = await db.query(
    `WITH s AS (
       UPDATE snippets
       SET title = $3, description = $4, language = $5, tags = $6::jsonb,
           current_version = current_version + 1, updated_at = now()
       WHERE slug = $1 AND current_version = $2
       RETURNING id, current_version
     )
     INSERT INTO snippet_versions
       (snippet_id, version, title, description, language, tags, instructions, dependencies, files, message, source)
     SELECT s.id, s.current_version, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11 FROM s
     RETURNING version`,
    [
      slug,
      expected,
      next.title,
      next.description,
      next.language,
      JSON.stringify(next.tags),
      next.instructions,
      JSON.stringify(next.dependencies),
      JSON.stringify(next.files),
      message,
      source,
    ],
  );
  if (!rows.length) {
    throw new SnippetError(`"${slug}" was changed by someone else while saving. Reload and try again.`, "conflict");
  }
}

export async function listVersions(db: Db, slug: string): Promise<VersionSummary[]> {
  const rows = await db.query(
    `SELECT v.version, v.title, v.message, v.source, v.created_at, ${FILE_NAMES} AS file_names
     FROM snippet_versions v JOIN snippets s ON s.id = v.snippet_id
     WHERE s.slug = $1 ORDER BY v.version DESC`,
    [slug],
  );
  if (!rows.length) await requireSnippet(db, slug);
  return rows.map((r) => ({
    version: r.version as number,
    title: r.title as string,
    message: r.message as string,
    source: r.source as string,
    createdAt: iso(r.created_at),
    fileNames: r.file_names as string[],
  }));
}

export async function getVersionPair(db: Db, slug: string, from: number, to?: number) {
  const [a, b] = await Promise.all([requireSnippet(db, slug, from), requireSnippet(db, slug, to)]);
  return [a, b] as const;
}

export async function restoreVersion(
  db: Db,
  slug: string,
  version: number,
  source = "web",
  message?: string,
): Promise<Snippet> {
  const [target, current] = await Promise.all([requireSnippet(db, slug, version), requireSnippet(db, slug)]);
  if (version === current.currentVersion) {
    throw new SnippetError(`Version ${version} is already the latest version of "${slug}"`, "invalid");
  }
  await insertVersion(db, slug, current.currentVersion, target, message || `Restored version ${version}`, source);
  return requireSnippet(db, slug);
}

export async function deleteSnippet(db: Db, slug: string): Promise<void> {
  const rows = await db.query(`DELETE FROM snippets WHERE slug = $1 RETURNING id`, [slugSchema.parse(slug)]);
  if (!rows.length) throw new SnippetError(`No snippet with the slug "${slug}"`, "not_found");
}

export function copyTitle(title: string): string {
  return `${title.slice(0, 115)} copy`;
}

export async function cloneSnippet(db: Db, slug: string, source = "web"): Promise<Snippet> {
  const original = await getSnippet(db, slug);
  if (!original) throw new SnippetError(`No snippet called "${slug}".`, "not_found");
  const title = copyTitle(original.title);
  return createSnippet(
    db,
    {
      title,
      description: original.description,
      language: original.language as SnippetInput["language"],
      tags: original.tags,
      instructions: original.instructions,
      dependencies: original.dependencies,
      files: renameForTitle(original.files, original.title, title),
      message: `Copied from ${original.slug}`,
    },
    source,
  );
}

export async function setSnippetPinned(db: Db, slug: string, pinned: boolean): Promise<void> {
  const rows = await db.query(
    `UPDATE snippets SET pinned_at = CASE WHEN $2 THEN coalesce(pinned_at, now()) END WHERE slug = $1 RETURNING slug`,
    [slug, pinned],
  );
  if (rows.length === 0) throw new SnippetError(`No snippet called "${slug}".`, "not_found");
}
