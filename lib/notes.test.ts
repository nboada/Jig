import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { compareNotes } from "./diff";
import {
  createNote,
  deleteNote,
  getNote,
  getNoteVersionPair,
  listNotes,
  listNoteTags,
  listNoteVersions,
  restoreNoteVersion,
  updateNote,
} from "./notes";
import { createSnippet } from "./snippets";

let db: Db;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE notes, note_versions, snippets, snippet_versions`);
});

const deploy = {
  title: "Shopify theme deploys",
  tags: ["Shopify", "deploy"],
  body: "Run `shopify theme push --unpublished` first.\nThen publish from the admin.\n",
};
const slug = "shopify-theme-deploys";

describe("notes", () => {
  test("create stores version 1 and normalises tags", async () => {
    const n = await createNote(db, deploy);
    expect(n.slug).toBe(slug);
    expect(n.version).toBe(1);
    expect(n.currentVersion).toBe(1);
    expect(n.tags).toEqual(["shopify", "deploy"]);
    expect(n.body).toBe(deploy.body);
    expect(n.message).toBe("Created");
  });

  test("clashing titles get a numbered slug, explicit clashing slugs are refused", async () => {
    await createNote(db, deploy);
    expect((await createNote(db, deploy)).slug).toBe(`${slug}-2`);
    await expect(createNote(db, { ...deploy, slug })).rejects.toThrow("already taken");
  });

  test("note slugs are separate from snippet slugs", async () => {
    await createSnippet(db, { title: deploy.title, language: "text", files: [{ name: "a.txt", content: "x" }] });
    expect((await createNote(db, deploy)).slug).toBe(slug);
  });

  test("update creates a new version and keeps the old one", async () => {
    await createNote(db, deploy);
    const { note, changed } = await updateNote(db, slug, { body: "New body\n", message: "Rewrite" }, "mcp:claude");
    expect(changed).toBe(true);
    expect(note.version).toBe(2);
    expect(note.title).toBe(deploy.title);
    expect(note.source).toBe("mcp:claude");
    expect((await getNote(db, slug, 1))?.body).toBe(deploy.body);
    expect((await listNoteVersions(db, slug)).map((v) => [v.version, v.message])).toEqual([
      [2, "Rewrite"],
      [1, "Created"],
    ]);
  });

  test("an update with no real change saves nothing", async () => {
    await createNote(db, deploy);
    const { note, changed } = await updateNote(db, slug, { title: deploy.title, body: deploy.body });
    expect(changed).toBe(false);
    expect(note.version).toBe(1);
  });

  test("an update based on a stale version is refused", async () => {
    await createNote(db, deploy);
    await updateNote(db, slug, { body: "Changed" });
    await expect(updateNote(db, slug, { body: "Mine", baseVersion: 1 })).rejects.toThrow("was changed since version 1");
  });

  test("of two concurrent saves, one wins and the other is refused", async () => {
    await createNote(db, deploy);
    const results = await Promise.allSettled([
      updateNote(db, slug, { body: "A" }),
      updateNote(db, slug, { body: "B" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason.message)).toContain("changed by someone else");
    expect((await getNote(db, slug))?.currentVersion).toBe(2);
  });

  test("restore copies an old version forward", async () => {
    await createNote(db, deploy);
    await updateNote(db, slug, { body: "broken" });
    const restored = await restoreNoteVersion(db, slug, 1);
    expect(restored.version).toBe(3);
    expect(restored.body).toBe(deploy.body);
    expect(restored.message).toBe("Restored version 1");
    await expect(restoreNoteVersion(db, slug, 3)).rejects.toThrow("already the latest");
  });

  test("search matches titles, tags and body, ranks title hits first, escapes wildcards", async () => {
    await createNote(db, deploy);
    await createNote(db, { title: "Client: Acme", tags: ["client"], body: "Acme runs 100 percent on Shopify Plus." });

    expect((await listNotes(db)).length).toBe(2);
    expect((await listNotes(db, { query: "publish" })).map((n) => n.slug)).toEqual([slug]);
    expect((await listNotes(db, { query: "shopify" })).map((n) => n.slug)).toEqual([slug, "client-acme"]);
    expect((await listNotes(db, { tag: "Client" })).map((n) => n.slug)).toEqual(["client-acme"]);
    expect((await listNotes(db, { query: "100%" })).length).toBe(0);
    expect((await listNotes(db, { query: "publish" }))[0].excerpt).toBe(
      "Run shopify theme push --unpublished first. Then publish from the admin.",
    );
    expect(await listNoteTags(db)).toEqual([
      { tag: "client", count: 1 },
      { tag: "deploy", count: 1 },
      { tag: "shopify", count: 1 },
    ]);
  });

  test("delete removes the note and its history", async () => {
    await createNote(db, deploy);
    await deleteNote(db, slug);
    expect(await getNote(db, slug)).toBeNull();
    await expect(listNoteVersions(db, slug)).rejects.toThrow("No note");
  });

  test("compareNotes reports title, tag and body changes", async () => {
    await createNote(db, deploy);
    await updateNote(db, slug, {
      title: "Theme deploys",
      body: `${deploy.body}Roll back with \`shopify theme publish\`.\n`,
    });
    const diff = compareNotes(...(await getNoteVersionPair(db, slug, 1)));
    expect(diff.fields).toEqual([{ field: "title", from: "Shopify theme deploys", to: "Theme deploys" }]);
    expect(diff.files.map((f) => [f.name, f.status, f.additions, f.deletions])).toEqual([["Body", "modified", 1, 0]]);
  });
});
