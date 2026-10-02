import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { notesApi, snippetsApi, tagsApi } from "./api";
import { pgliteDb, prepare, type Db } from "./db";
import { SnippetError } from "./snippets";

let db: Db;
const SOURCE = "app:Jig for iPhone";
const q = (init: Record<string, string> = {}) => new URLSearchParams(init);
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (e) => (e instanceof SnippetError ? e.code : "server"),
  );

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE snippets, snippet_versions, notes, note_versions`);
});

const debounce = {
  title: "Debounce",
  language: "javascript",
  tags: ["util"],
  files: [{ name: "debounce.js", content: "export const debounce = () => {};" }],
  message: "First",
};

describe("snippets api", () => {
  test("create, list, get, update, history, diff and restore", async () => {
    const created = await snippetsApi.create(db, debounce, SOURCE);
    expect(created.slug).toBe("debounce");

    expect((await snippetsApi.list(db, q({ q: "debo" }))).map((s) => s.slug)).toEqual(["debounce"]);
    expect((await snippetsApi.list(db, q({ tag: "util", sort: "title" }))).length).toBe(1);

    const { snippet, changed } = await snippetsApi.update(
      db,
      "debounce",
      { files: [{ name: "debounce.js", content: "export const debounce = (fn) => fn;" }], baseVersion: 1, message: "Pass fn" },
      SOURCE,
    );
    expect(changed).toBe(true);
    expect(snippet.version).toBe(2);

    expect((await snippetsApi.get(db, "debounce", q({ v: "1" }))).version).toBe(1);
    const versions = await snippetsApi.versions(db, "debounce");
    expect(versions.map((v) => [v.version, v.source])).toEqual([
      [2, SOURCE],
      [1, SOURCE],
    ]);

    const diff = await snippetsApi.diff(db, "debounce", q({ from: "1" }));
    expect(diff.files.length).toBe(1);

    const restored = await snippetsApi.restore(db, "debounce", { version: 1 }, SOURCE);
    expect(restored.version).toBe(3);
    expect(restored.files[0].content).toBe(debounce.files[0].content);
  });

  test("conflicts, no-op updates and missing snippets", async () => {
    await snippetsApi.create(db, debounce, SOURCE);
    await snippetsApi.update(db, "debounce", { title: "Debounce 2" }, SOURCE);
    expect(await code(snippetsApi.update(db, "debounce", { title: "Stale", baseVersion: 1 }, SOURCE))).toBe("conflict");
    expect((await snippetsApi.update(db, "debounce", { title: "Debounce 2" }, SOURCE)).changed).toBe(false);
    expect(await code(snippetsApi.get(db, "nope", q()))).toBe("not_found");
    expect(await code(snippetsApi.versions(db, "nope"))).toBe("not_found");
  });

  test("bad input is invalid or not found, never a server error", async () => {
    await snippetsApi.create(db, debounce, SOURCE);
    expect(await code(snippetsApi.get(db, "debounce", q({ v: "abc" })))).toBe("invalid");
    expect(await code(snippetsApi.get(db, "debounce", q({ v: "0" })))).toBe("invalid");
    expect(await code(snippetsApi.get(db, "debounce", q({ v: "99" })))).toBe("not_found");
    expect(await code(snippetsApi.get(db, "Foo Bar", q()))).toBe("not_found");
    expect(await code(snippetsApi.get(db, "../x", q()))).toBe("not_found");
    expect(await code(snippetsApi.diff(db, "debounce", q()))).toBe("invalid");
    expect(await code(snippetsApi.restore(db, "debounce", {}, SOURCE))).toBe("invalid");
    expect(await code(snippetsApi.restore(db, "debounce", { version: "1" }, SOURCE))).toBe("invalid");
    expect(await code(snippetsApi.create(db, { title: "" }, SOURCE))).toBe("invalid");
    expect(await code(snippetsApi.get(db, "debounce", q({ v: "99999999999" })))).toBe("invalid");
    expect(await code(snippetsApi.diff(db, "debounce", q({ from: "99999999999" })))).toBe("invalid");
    expect(await code(snippetsApi.restore(db, "debounce", { version: 1e12 }, SOURCE))).toBe("invalid");
    expect(await code(snippetsApi.restore(db, "debounce", { version: 1e300 }, SOURCE))).toBe("invalid");
    await notesApi.create(db, { title: "Big", body: "x" }, SOURCE);
    expect(await code(notesApi.get(db, "big", q({ v: "99999999999" })))).toBe("invalid");
  });
});

describe("notes api", () => {
  test("create, list, get, update, history, diff and restore", async () => {
    await notesApi.create(db, { title: "Deploy checklist", body: "1. Build", tags: ["ops"] }, SOURCE);
    expect((await notesApi.list(db, q({ q: "deploy" }))).map((n) => n.slug)).toEqual(["deploy-checklist"]);
    const { note, changed } = await notesApi.update(db, "deploy-checklist", { body: "1. Build\n2. Ship", baseVersion: 1 }, SOURCE);
    expect([note.version, changed]).toEqual([2, true]);
    expect((await notesApi.get(db, "deploy-checklist", q({ v: "1" }))).body).toBe("1. Build");
    expect((await notesApi.versions(db, "deploy-checklist")).length).toBe(2);
    expect((await notesApi.diff(db, "deploy-checklist", q({ from: "1", to: "2" }))).files.length).toBe(1);
    expect((await notesApi.restore(db, "deploy-checklist", { version: 1, message: "Back" }, SOURCE)).version).toBe(3);
  });

  test("locked notes don't exist, even with a valid version", async () => {
    await notesApi.create(db, { title: "Plugin keys", body: "ACF: abc123", tags: ["secret-tag"] }, SOURCE);
    await notesApi.update(db, "plugin-keys", { body: "ACF: def456" }, SOURCE);
    await db.query(`UPDATE notes SET locked_at = now()`);

    expect(await notesApi.list(db, q())).toEqual([]);
    expect(await notesApi.list(db, q({ q: "plugin" }))).toEqual([]);
    for (const attempt of [
      notesApi.get(db, "plugin-keys", q()),
      notesApi.get(db, "plugin-keys", q({ v: "1" })),
      notesApi.update(db, "plugin-keys", { body: "x" }, SOURCE),
      notesApi.versions(db, "plugin-keys"),
      notesApi.diff(db, "plugin-keys", q({ from: "1", to: "2" })),
      notesApi.restore(db, "plugin-keys", { version: 1 }, SOURCE),
    ]) {
      expect(await code(attempt)).toBe("not_found");
    }
    expect((await tagsApi(db)).notes).toEqual([]);
  });
});

test("lists take a limit, so the app can fetch everything for offline use", async () => {
  for (let i = 0; i < 3; i++) {
    await snippetsApi.create(db, { ...debounce, title: `Snippet ${i}` }, SOURCE);
    await notesApi.create(db, { title: `Note ${i}`, body: "x" }, SOURCE);
  }
  expect((await snippetsApi.list(db, q({ limit: "2" }))).length).toBe(2);
  expect((await notesApi.list(db, q({ limit: "2" }))).length).toBe(2);
  expect((await snippetsApi.list(db, q({ limit: "500" }))).length).toBe(3);
  expect(await code(snippetsApi.list(db, q({ limit: "abc" })))).toBe("invalid");
  expect(await code(notesApi.list(db, q({ limit: "501" })))).toBe("invalid");
});

test("tags counts snippets and unlocked notes", async () => {
  await snippetsApi.create(db, debounce, SOURCE);
  await notesApi.create(db, { title: "Ops", body: "x", tags: ["ops"] }, SOURCE);
  expect(await tagsApi(db)).toEqual({ snippets: [{ tag: "util", count: 1 }], notes: [{ tag: "ops", count: 1 }] });
});
