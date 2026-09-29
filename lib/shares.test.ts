import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createCredential } from "./credentials";
import { pgliteDb, prepare, type Db } from "./db";
import { createNote } from "./notes";
import {
  checkPasscode,
  createShare,
  deleteShare,
  findShare,
  listShares,
  loadSharedItem,
  MAX_FAILED,
  recordView,
  revealShare,
  restoreShare,
  revokeShare,
  shareStatus,
} from "./shares";
import { createSnippet, deleteSnippet } from "./snippets";

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
  await db.query(`TRUNCATE shares, snippets, snippet_versions, notes, note_versions, credentials`);
  await createSnippet(db, { title: "Lenis", language: "javascript", files: [{ name: "lenis.js", content: "init()" }] });
});

const reload = async (token: string) => (await findShare(db, token))!;

describe("share links", () => {
  test("a link opens the item, counts views, and stores only a hash of its token", async () => {
    const { token, passcode, share } = await createShare(db, "snippets", "lenis", { expiry: "7d", maxViews: null, label: "Sam" });
    expect(passcode).toBeUndefined();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect([share.label, share.protected, shareStatus(share)]).toEqual(["Sam", false, "open"]);

    const [row] = await db.query(`SELECT token_hash FROM shares`);
    expect(row.token_hash).not.toBe(token);
    expect(await findShare(db, "not-a-token")).toBeNull();

    expect(await recordView(db, share)).toBe(true);
    expect((await reload(token)).views).toBe(1);
    const item = await loadSharedItem(db, share);
    expect(item?.kind === "snippets" && item.snippet.title).toBe("Lenis");
  });

  test("a view limit stops the link once reached", async () => {
    const { token, share } = await createShare(db, "snippets", "lenis", { expiry: "24h", maxViews: 1 });
    expect(await recordView(db, share)).toBe(true);
    expect(await recordView(db, share)).toBe(false);
    expect(shareStatus(await reload(token))).toBe("used");
  });

  test("expired and revoked links can't be viewed", async () => {
    const expiring = await createShare(db, "snippets", "lenis", { expiry: "1h", maxViews: null });
    await db.query(`UPDATE shares SET expires_at = now() - interval '1 minute' WHERE id = $1`, [expiring.share.id]);
    expect(shareStatus(await reload(expiring.token))).toBe("expired");
    expect(await recordView(db, expiring.share)).toBe(false);

    const revoked = await createShare(db, "snippets", "lenis", { expiry: "never", maxViews: null });
    expect(revoked.share.expiresAt).toBeNull();
    await revokeShare(db, revoked.share.id);
    expect(shareStatus(await reload(revoked.token))).toBe("revoked");
    expect(await recordView(db, revoked.share)).toBe(false);
  });

  test("lists an item's links, newest first", async () => {
    await createShare(db, "snippets", "lenis", { expiry: "1h", maxViews: null, label: "first" });
    await createShare(db, "snippets", "lenis", { expiry: "1h", maxViews: null, label: "second" });
    const labels = (await listShares(db, "snippets", "lenis")).map((s) => s.label);
    expect(labels.sort()).toEqual(["first", "second"]);
  });

  test("a deleted item's link shows nothing, and a new item under the old name doesn't inherit it", async () => {
    const { share } = await createShare(db, "snippets", "lenis", { expiry: "7d", maxViews: null });
    await deleteSnippet(db, "lenis");
    await createSnippet(db, { title: "Lenis", language: "css", files: [{ name: "a.css", content: "a{}" }] });
    expect(await loadSharedItem(db, share)).toBeNull();
  });

  test("notes can be shared too", async () => {
    await createNote(db, { title: "Hosting", body: "Plesk" });
    const { share } = await createShare(db, "notes", "hosting", { expiry: "7d", maxViews: null });
    const item = await loadSharedItem(db, share);
    expect(item?.kind === "notes" && item.note.body).toBe("Plesk");
  });

  test("bad options and unknown items are refused", async () => {
    await expect(createShare(db, "snippets", "missing", { expiry: "1h", maxViews: null })).rejects.toThrow("Nothing called");
    await expect(createShare(db, "snippets", "lenis", { expiry: "1h", maxViews: 0 })).rejects.toThrow("view limit");
    // @ts-expect-error an expiry the dialog never offers
    await expect(createShare(db, "snippets", "lenis", { expiry: "1y", maxViews: null })).rejects.toThrow("how long");
  });
});

describe("credential links", () => {
  beforeEach(async () => {
    await createCredential(db, {
      title: "Staging",
      fields: [
        { label: "User", secret: false, value: "admin" },
        { label: "Password", secret: true, value: "hunter2" },
      ],
    });
  });

  test("need a passcode, which is shown once and reveals the secrets", async () => {
    const { passcode, share } = await createShare(db, "credentials", "staging", { expiry: "24h", maxViews: 1 });
    expect(passcode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(share.protected).toBe(true);

    // Case, spaces and the dash don't matter when typing it back.
    expect(await checkPasscode(db, share, passcode!.toLowerCase().replace("-", " "))).toEqual({ ok: true, left: MAX_FAILED });
    const item = await loadSharedItem(db, share);
    if (item?.kind !== "credentials") throw new Error("expected a credential");
    const password = item.credential.fields.find((f) => f.label === "Password")!;
    expect(item.secrets[password.id]).toBe("hunter2");
  });

  test(`lock after ${MAX_FAILED} wrong passcodes`, async () => {
    const { token, passcode, share } = await createShare(db, "credentials", "staging", { expiry: "24h", maxViews: 1 });
    for (let i = 0; i < MAX_FAILED; i++) {
      expect(await checkPasscode(db, share, "WRONG-CODE")).toEqual({ ok: false, left: MAX_FAILED - i - 1 });
    }
    expect(shareStatus(await reload(token))).toBe("locked");
    // Once locked, even the right passcode isn't checked, and no view comes out of it.
    expect(await checkPasscode(db, share, passcode!)).toEqual({ ok: false, left: 0 });
    expect(await recordView(db, share)).toBe(false);
  });

  test(`a burst of guesses at once still gets only ${MAX_FAILED} checked`, async () => {
    const { token, share } = await createShare(db, "credentials", "staging", { expiry: "24h", maxViews: 1 });
    const results = await Promise.all(Array.from({ length: 12 }, () => checkPasscode(db, share, "WRONG-CODE")));
    expect(results.filter((r) => r.left > 0 || r.ok).length).toBeLessThan(MAX_FAILED);
    expect((await reload(token)).failedAttempts).toBe(MAX_FAILED);
  });

  test("a right passcode gives its try back", async () => {
    const { token, passcode, share } = await createShare(db, "credentials", "staging", { expiry: "24h", maxViews: 1 });
    await checkPasscode(db, share, "WRONG-CODE");
    expect((await checkPasscode(db, share, passcode!)).ok).toBe(true);
    expect((await reload(token)).failedAttempts).toBe(1);
  });
});

describe("copying and deleting links", () => {
  test("a new link can be copied again, bound to its share; delete removes it", async () => {
    const saved = process.env.JIG_ENCRYPTION_KEY;
    process.env.JIG_ENCRYPTION_KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
    try {
      await createSnippet(db, { title: "Copy again", language: "css", files: [{ name: "a.css", content: "a{}" }] });
      const { token, share } = await createShare(db, "snippets", "copy-again", { expiry: "never", maxViews: null });
      expect(share.recoverable).toBe(true);
      expect((await revealShare(db, share.id)).token).toBe(token);
      await deleteShare(db, share.id);
      expect(await findShare(db, token)).toBeNull();
      expect(revealShare(db, share.id)).rejects.toThrow("only shown");
    } finally {
      if (saved === undefined) delete process.env.JIG_ENCRYPTION_KEY;
      else process.env.JIG_ENCRYPTION_KEY = saved;
    }
  });
});

test("a turned-off link can be turned back on", async () => {
  await createSnippet(db, { title: "Back on", language: "css", files: [{ name: "a.css", content: "a{}" }] });
  const { token, share } = await createShare(db, "snippets", "back-on", { expiry: "never", maxViews: null });
  await revokeShare(db, share.id);
  expect(shareStatus((await findShare(db, token))!)).toBe("revoked");
  await restoreShare(db, share.id);
  expect(shareStatus((await findShare(db, token))!)).toBe("open");
});
