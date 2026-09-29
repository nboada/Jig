import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createCredential, getCredential, revealField } from "./credentials";
import { pgliteDb, prepare, type Db } from "./db";
import { createNote, getNote, listNotes } from "./notes";
import { createShare, findShare, loadSharedItem } from "./shares";
import { createSnippet, getSnippet, listVersions, SnippetError, updateSnippet } from "./snippets";
import { listTrash, purgeItem, restoreItem, trashItem } from "./trash";

let db: Db;
const savedKey = process.env.JIG_ENCRYPTION_KEY;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
  process.env.JIG_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.JIG_ENCRYPTION_KEY;
  else process.env.JIG_ENCRYPTION_KEY = savedKey;
});

beforeEach(async () => {
  await db.query(`TRUNCATE trash, shares, snippets, snippet_versions, notes, note_versions, credentials`);
});

const lenis = { title: "Lenis", language: "javascript" as const, files: [{ name: "lenis.js", content: "init()" }] };

describe("recently deleted", () => {
  test("a deleted snippet leaves its table and comes back with every version", async () => {
    await createSnippet(db, lenis);
    await updateSnippet(db, "lenis", { files: [{ name: "lenis.js", content: "init({ smooth: true })" }], message: "smooth" });

    const id = await trashItem(db, "snippets", "lenis");
    expect(await getSnippet(db, "lenis")).toBeNull();
    expect((await db.query(`SELECT 1 FROM snippet_versions`)).length).toBe(0);
    expect((await listTrash(db)).map((t) => [t.id, t.kind, t.slug, t.title])).toEqual([[id, "snippets", "lenis", "Lenis"]]);

    expect(await restoreItem(db, id)).toEqual({ kind: "snippets", slug: "lenis" });
    expect((await getSnippet(db, "lenis"))?.files[0].content).toBe("init({ smooth: true })");
    expect((await listVersions(db, "lenis")).map((v) => [v.version, v.message])).toEqual([
      [2, "smooth"],
      [1, "Created"],
    ]);
    expect(await listTrash(db)).toEqual([]);
  });

  test("a restored item takes the next free slug if its own was taken meanwhile", async () => {
    await createNote(db, { title: "Setup", body: "old" });
    const id = await trashItem(db, "notes", "setup");
    await createNote(db, { title: "Setup", body: "new" });
    expect((await restoreItem(db, id)).slug).toBe("setup-2");
    expect((await getNote(db, "setup-2"))?.body).toBe("old");
    expect((await listNotes(db)).length).toBe(2);
  });

  test("share links stop while an item is deleted and work again once it's restored", async () => {
    await createSnippet(db, lenis);
    const { token } = await createShare(db, "snippets", "lenis", { expiry: "7d", maxViews: null });
    const id = await trashItem(db, "snippets", "lenis");
    expect(await loadSharedItem(db, (await findShare(db, token))!)).toBeNull();
    await restoreItem(db, id);
    expect(await loadSharedItem(db, (await findShare(db, token))!)).not.toBeNull();
  });

  test("a credential's secrets stay encrypted in the trash and still open after a restore", async () => {
    const created = await createCredential(db, {
      title: "Acme",
      fields: [{ label: "API key", secret: true, value: "shpat_live_123" }],
    });
    const id = await trashItem(db, "credentials", "acme");
    const [row] = await db.query<{ item: string }>(`SELECT item::text FROM trash`);
    expect(row.item).not.toContain("shpat_live_123");
    await restoreItem(db, id);
    expect(await getCredential(db, "acme")).not.toBeNull();
    expect(await revealField(db, "acme", created.fields[0].id)).toBe("shpat_live_123");
  });

  test("deleting for good removes the item and its share links", async () => {
    await createSnippet(db, lenis);
    await createShare(db, "snippets", "lenis", { expiry: "7d", maxViews: null });
    const id = await trashItem(db, "snippets", "lenis");
    await purgeItem(db, id);
    expect(await listTrash(db)).toEqual([]);
    expect((await db.query(`SELECT 1 FROM shares`)).length).toBe(0);
    await expect(restoreItem(db, id)).rejects.toBeInstanceOf(SnippetError);
    await expect(purgeItem(db, id)).rejects.toBeInstanceOf(SnippetError);
  });

  test("items go for good after 30 days", async () => {
    await createSnippet(db, lenis);
    await createNote(db, { title: "Fresh", body: "x" });
    const old = await trashItem(db, "snippets", "lenis");
    await db.query(`UPDATE trash SET deleted_at = now() - interval '31 days' WHERE id = $1`, [old]);
    await trashItem(db, "notes", "fresh");
    expect((await listTrash(db)).map((t) => t.slug)).toEqual(["fresh"]);
  });

  test("deleting something that isn't there is a not_found error", async () => {
    await expect(trashItem(db, "snippets", "missing")).rejects.toMatchObject({ code: "not_found" });
  });
});
