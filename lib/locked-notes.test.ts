import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { isUnlockValid, makeUnlock, noteCodec } from "./locked-notes";
import { cloneNote, createNote, getNote, getNoteVersionPair, listNotes, restoreNoteVersion, setNoteLocked, updateNote } from "./notes";
import { createShare, loadSharedItem, findShare } from "./shares";

let db: Db;

beforeAll(async () => {
  process.env.JIG_ENCRYPTION_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
  process.env.ADMIN_PASSWORD ||= "test-password";
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE notes, note_versions, shares`);
});

async function lockedKeys() {
  await createNote(db, { title: "Plugin keys", tags: ["wp"], body: "ACF: abc123 first" });
  await updateNote(db, "plugin-keys", { body: "ACF: abc123 second" });
  await setNoteLocked(db, "plugin-keys", true, noteCodec);
}

describe("locked notes", () => {
  test("every version is encrypted in the database", async () => {
    await lockedKeys();
    const rows = await db.query<{ body: string }>(`SELECT body FROM note_versions`);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.body.startsWith("v1:")).toBe(true);
      expect(r.body).not.toContain("abc123");
    }
  });

  test("without the codec the text is empty and marked unreadable", async () => {
    await lockedKeys();
    const note = await getNote(db, "plugin-keys");
    expect(note?.locked).toBe(true);
    expect(note?.unreadable).toBe(true);
    expect(note?.body).toBe("");
    expect(note?.title).toBe("Plugin keys");
  });

  test("with the codec every version reads back", async () => {
    await lockedKeys();
    expect((await getNote(db, "plugin-keys", undefined, noteCodec))?.body).toBe("ACF: abc123 second");
    expect((await getNote(db, "plugin-keys", 1, noteCodec))?.body).toBe("ACF: abc123 first");
  });

  test("lists and search never expose or match the text", async () => {
    await lockedKeys();
    const [summary] = await listNotes(db);
    expect(summary.locked).toBe(true);
    expect(summary.excerpt).toBe("");
    expect(await listNotes(db, { query: "abc123" })).toHaveLength(0);
    expect(await listNotes(db, { query: "plugin" })).toHaveLength(1);
    expect(await listNotes(db, { hideLocked: true })).toHaveLength(0);
  });

  test("can't be changed without the codec, can with it", async () => {
    await lockedKeys();
    expect(updateNote(db, "plugin-keys", { body: "x" })).rejects.toThrow("locked");
    expect(restoreNoteVersion(db, "plugin-keys", 1)).rejects.toThrow("locked");
    await updateNote(db, "plugin-keys", { body: "ACF: third" }, "web", noteCodec);
    const stored = await db.query<{ body: string }>(`SELECT body FROM note_versions WHERE version = 3`);
    expect(stored[0].body.startsWith("v1:")).toBe(true);
    await restoreNoteVersion(db, "plugin-keys", 1, "web", undefined, noteCodec);
    expect((await getNote(db, "plugin-keys", undefined, noteCodec))?.body).toBe("ACF: abc123 first");
    const [a, b] = await getNoteVersionPair(db, "plugin-keys", 2, 3, noteCodec);
    expect([a.body, b.body]).toEqual(["ACF: abc123 second", "ACF: third"]);
  });

  test("removing the lock decrypts the whole history", async () => {
    await lockedKeys();
    await setNoteLocked(db, "plugin-keys", false, noteCodec);
    const rows = await db.query<{ body: string }>(`SELECT body FROM note_versions ORDER BY version`);
    expect(rows.map((r) => r.body)).toEqual(["ACF: abc123 first", "ACF: abc123 second"]);
    expect((await getNote(db, "plugin-keys"))?.locked).toBe(false);
  });

  test("ciphertext is bound to its note and version", async () => {
    await lockedKeys();
    await db.query(
      `UPDATE note_versions v SET body = o.body FROM note_versions o
       WHERE o.note_id = v.note_id AND o.version = 3 - v.version`,
    );
    expect(getNote(db, "plugin-keys", 1, noteCodec)).rejects.toThrow();
  });

  test("locked notes can't be cloned or shared, and old links stop working", async () => {
    await createNote(db, { title: "Plugin keys", body: "secret" });
    const { token } = await createShare(db, "notes", "plugin-keys", { expiry: "never", maxViews: null });
    await setNoteLocked(db, "plugin-keys", true, noteCodec);
    expect(cloneNote(db, "plugin-keys")).rejects.toThrow("can't be cloned");
    expect(createShare(db, "notes", "plugin-keys", { expiry: "never", maxViews: null })).rejects.toThrow("can't be shared");
    const share = await findShare(db, token);
    expect(await loadSharedItem(db, share!)).toBeNull();
  });
});

describe("unlock cookie", () => {
  test("is valid until it expires, only in its own session, and can't be forged", async () => {
    const now = Date.now();
    const session = now - 1000;
    const { value } = await makeUnlock(db, session, now);
    expect(await isUnlockValid(db, value, session, now)).toBe(true);
    expect(await isUnlockValid(db, value, session, now + 31 * 60_000)).toBe(false);
    expect(await isUnlockValid(db, value, session + 1, now)).toBe(false);
    const [issued, expires, signature] = value.split(".");
    expect(await isUnlockValid(db, `${issued}.${Number(expires) + 3600}.${signature}`, session, now)).toBe(false);
    expect(await isUnlockValid(db, undefined, session, now)).toBe(false);
  });
});
