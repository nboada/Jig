import { assertEncryptionReady, decryptSecret, encryptSecret } from "./crypto";
import type { Db, Row } from "./db";
import { orderBy, parseSort, type Sort } from "./sort";
import { availableSlug, parse, slugify, SnippetError } from "./snippets";
import { credentialInputSchema, slugSchema, type CredentialInput } from "./validation";


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
  createdAt: string;
  updatedAt: string;
};

type StoredField = { id: string; label: string; secret: boolean; value: string };

const iso = (value: unknown) => new Date(value as string).toISOString();

const secretContext = (credentialId: string, fieldId: string) => `${credentialId}:${fieldId}`;

export type CredentialListOptions = { query?: string; tag?: string; limit?: number; sort?: Sort };

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
  const limit = param(Math.min(Math.max(options.limit ?? 100, 1), 500));

  const rows = await db.query(
    `SELECT c.slug, c.title, c.url, c.tags, c.fields, c.created_at, c.updated_at FROM credentials c
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${orderBy("c", parseSort(options.sort), order)}
     LIMIT ${limit}`,
    params,
  );
  return rows.map((r) => ({
    slug: r.slug as string,
    title: r.title as string,
    url: r.url as string,
    tags: r.tags as string[],
    labels: (r.fields as StoredField[]).map((f) => f.label),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }));
}

export async function listCredentialTags(db: Db): Promise<{ tag: string; count: number }[]> {
  assertEncryptionReady();
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

export async function getCredential(db: Db, slug: string): Promise<Credential | null> {
  assertEncryptionReady();
  const row = await findRow(db, slug);
  return row ? toCredential(row) : null;
}

export async function revealField(db: Db, slug: string, fieldId: string): Promise<string> {
  assertEncryptionReady();
  const row = await requireRow(db, slug);
  const field = (row.fields as StoredField[]).find((f) => f.id === fieldId);
  if (!field) throw new SnippetError(`"${slug}" has no field with that id`, "not_found");
  return field.secret ? decryptSecret(field.value, secretContext(row.id as string, field.id)) : field.value;
}

async function buildFields(
  credentialId: string,
  fields: { id?: string; label: string; secret: boolean; value: string }[],
  previous: StoredField[] = [],
): Promise<StoredField[]> {
  const submittedIds = new Set<string>();
  for (const f of fields) {
    if (f.id) {
      if (submittedIds.has(f.id)) {
        throw new SnippetError("Each field can appear only once.", "invalid");
      }
      submittedIds.add(f.id);
    }
  }
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
  assertEncryptionReady();
  const rows = await db.query(`DELETE FROM credentials WHERE slug = $1 RETURNING id`, [parse(slugSchema, slug)]);
  if (!rows.length) throw new SnippetError(`No credential with the slug "${slug}"`, "not_found");
}
