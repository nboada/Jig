import type { Db } from "./db";
import { compareNotes, compareVersions } from "./diff";
import {
  createNote,
  getNote,
  getNoteVersionPair,
  listNotes,
  listNoteTags,
  listNoteVersions,
  restoreNoteVersion,
  updateNote,
} from "./notes";
import { parseSort } from "./sort";
import {
  createSnippet,
  getSnippet,
  getVersionPair,
  listSnippets,
  listTags,
  listVersions,
  restoreVersion,
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

const message = (body: Body) => (typeof body.message === "string" ? body.message : undefined);
const missing = (kind: string, slug: string) => new SnippetError(`No ${kind} with the slug "${slug}".`, "not_found");

export const snippetsApi = {
  list: (db: Db, q: URLSearchParams) =>
    listSnippets(db, { query: text(q, "q"), language: text(q, "language"), tag: text(q, "tag"), sort: parseSort(q.get("sort")) }),

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
};

async function readableNote(db: Db, slug: string) {
  const note = await getNote(db, slug);
  if (!note || note.locked) throw missing("note", slug);
}

export const notesApi = {
  list: (db: Db, q: URLSearchParams) =>
    listNotes(db, { query: text(q, "q"), tag: text(q, "tag"), sort: parseSort(q.get("sort")), hideLocked: true }),

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
};

export async function tagsApi(db: Db) {
  const [snippets, notes] = await Promise.all([listTags(db), listNoteTags(db, { hideLocked: true })]);
  return { snippets, notes };
}
