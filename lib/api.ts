import type { Db } from "./db";
import { compareNotes, compareVersions } from "./diff";
import {
  cloneNote,
  createNote,
  getNote,
  getNoteVersionPair,
  listNotes,
  listNoteTags,
  listNoteVersions,
  restoreNoteVersion,
  setNotePinned,
  updateNote,
} from "./notes";
import { parseSort } from "./sort";
import { restoreItem, trashItem } from "./trash";
import {
  cloneSnippet,
  createSnippet,
  getSnippet,
  getVersionPair,
  listSnippets,
  listTags,
  listVersions,
  restoreVersion,
  setSnippetPinned,
  SnippetError,
  updateSnippet,
} from "./snippets";
import type { NoteInput, NotePatch, SnippetInput, SnippetPatch } from "./validation";

export type Body = Record<string, unknown>;

const text = (q: URLSearchParams, key: string) => q.get(key)?.trim() || undefined;

const MAX_VERSION = 2_147_483_647;

function version(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && !/^\d+$/.test(value)) throw new SnippetError(`${name} must be a whole number.`, "invalid");
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_VERSION) {
    throw new SnippetError(`${name} must be a whole number from 1 to ${MAX_VERSION}.`, "invalid");
  }
  return n;
}

function required(n: number | undefined, name: string): number {
  if (n === undefined) throw new SnippetError(`${name} is required.`, "invalid");
  return n;
}

function bodyVersion(body: Body): number {
  if (typeof body.version !== "number") throw new SnippetError("version must be a number.", "invalid");
  return required(version(body.version, "version"), "version");
}

function limit(q: URLSearchParams): number | undefined {
  const n = version(q.get("limit"), "limit");
  if (n !== undefined && n > 500) throw new SnippetError("limit must be a whole number from 1 to 500.", "invalid");
  return n;
}

function pinned(body: Body): boolean {
  if (typeof body.pinned !== "boolean") throw new SnippetError("pinned must be true or false.", "invalid");
  return body.pinned;
}

const message = (body: Body) => (typeof body.message === "string" ? body.message : undefined);
const missing = (kind: string, slug: string) => new SnippetError(`No ${kind} with the slug "${slug}".`, "not_found");

export const snippetsApi = {
  list: async (db: Db, q: URLSearchParams) =>
    listSnippets(db, { query: text(q, "q"), language: text(q, "language"), tag: text(q, "tag"), sort: parseSort(q.get("sort")), limit: limit(q) }),

  async get(db: Db, slug: string, q: URLSearchParams) {
    const snippet = await getSnippet(db, slug, version(q.get("v"), "v"));
    if (!snippet) throw missing("snippet", slug);
    return snippet;
  },

  create: (db: Db, body: Body, source: string) => createSnippet(db, body as SnippetInput, source),

  update: (db: Db, slug: string, body: Body, source: string) => updateSnippet(db, slug, body as SnippetPatch, source),

  versions: (db: Db, slug: string) => listVersions(db, slug),

  async diff(db: Db, slug: string, q: URLSearchParams) {
    const from = required(version(q.get("from"), "from"), "from");
    const [a, b] = await getVersionPair(db, slug, from, version(q.get("to"), "to"));
    return compareVersions(a, b);
  },

  restore: async (db: Db, slug: string, body: Body, source: string) =>
    restoreVersion(db, slug, bodyVersion(body), source, message(body)),

  async pin(db: Db, slug: string, body: Body) {
    await setSnippetPinned(db, slug, pinned(body));
    return snippetsApi.get(db, slug, new URLSearchParams());
  },

  duplicate: (db: Db, slug: string, source: string) => cloneSnippet(db, slug, source),

  async remove(db: Db, slug: string) {
    if (!(await getSnippet(db, slug))) throw missing("snippet", slug);
    return { trashId: await trashItem(db, "snippets", slug) };
  },
};

async function readableNote(db: Db, slug: string) {
  const note = await getNote(db, slug);
  if (!note || note.locked) throw missing("note", slug);
}

export const notesApi = {
  list: async (db: Db, q: URLSearchParams) =>
    listNotes(db, { query: text(q, "q"), tag: text(q, "tag"), sort: parseSort(q.get("sort")), hideLocked: true, limit: limit(q) }),

  async get(db: Db, slug: string, q: URLSearchParams) {
    await readableNote(db, slug);
    const note = await getNote(db, slug, version(q.get("v"), "v"));
    if (!note) throw missing("note", slug);
    return note;
  },

  create: (db: Db, body: Body, source: string) => createNote(db, body as NoteInput, source),

  async update(db: Db, slug: string, body: Body, source: string) {
    await readableNote(db, slug);
    return updateNote(db, slug, body as NotePatch, source);
  },

  async versions(db: Db, slug: string) {
    await readableNote(db, slug);
    return listNoteVersions(db, slug);
  },

  async diff(db: Db, slug: string, q: URLSearchParams) {
    await readableNote(db, slug);
    const from = required(version(q.get("from"), "from"), "from");
    const [a, b] = await getNoteVersionPair(db, slug, from, version(q.get("to"), "to"));
    return compareNotes(a, b);
  },

  async restore(db: Db, slug: string, body: Body, source: string) {
    await readableNote(db, slug);
    return restoreNoteVersion(db, slug, bodyVersion(body), source, message(body));
  },

  async pin(db: Db, slug: string, body: Body) {
    if (!(await getNote(db, slug))) throw missing("note", slug);
    await setNotePinned(db, slug, pinned(body));
    const note = await getNote(db, slug);
    return note?.locked ? { slug, pinned: pinned(body) } : notesApi.get(db, slug, new URLSearchParams());
  },

  async duplicate(db: Db, slug: string, source: string) {
    await readableNote(db, slug);
    return cloneNote(db, slug, source);
  },

  async remove(db: Db, slug: string) {
    if (!(await getNote(db, slug))) throw missing("note", slug);
    return { trashId: await trashItem(db, "notes", slug) };
  },

  /** Locked notes' titles and tags, never their bodies; reading one goes through lib/api-locked.ts. */
  locked: async (db: Db, q: URLSearchParams) =>
    listNotes(db, { tag: text(q, "tag"), sort: parseSort(q.get("sort")), onlyLocked: true, limit: limit(q) }),
};

export async function restoreFromTrash(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new SnippetError("That item is no longer in Recently deleted.", "not_found");
  const rows = await db.query<{ kind: string }>(`SELECT kind FROM trash WHERE id = $1`, [id]);
  if (!rows[0]) throw new SnippetError("That item is no longer in Recently deleted.", "not_found");
  return restoreItem(db, id);
}

export async function tagsApi(db: Db) {
  const [snippets, notes] = await Promise.all([listTags(db), listNoteTags(db, { hideLocked: true })]);
  return { snippets, notes };
}
