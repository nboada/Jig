import { afterAll, beforeAll, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { makePass, passAdmits } from "./share-pass";
import type { Share } from "./shares";

const saved = process.env.ADMIN_PASSWORD;
let db: Db;
beforeAll(async () => {
  process.env.ADMIN_PASSWORD = "test-password";
  db = await prepare(await pgliteDb());
});
afterAll(() => {
  if (saved === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = saved;
});

const share = (over: Partial<Share> = {}): Share => ({
  id: "abc",
  kind: "snippets",
  itemId: "item",
  label: "",
  maxViews: 1,
  views: 1,
  expiresAt: null,
  createdAt: new Date().toISOString(),
  revoked: false,
  protected: false,
  failedAttempts: 0,
  recoverable: false,
  ...over,
});

test("a pass lets its holder back in, even once the views are used up", async () => {
  const { value } = await makePass(db, "abc");
  expect(await passAdmits(db, share(), value)).toBe(true);
});

test("a pass is refused for another link, after it expires, or once the link is shut", async () => {
  const { value } = await makePass(db, "abc");
  expect(await passAdmits(db, share({ id: "other" }), value)).toBe(false);
  expect(await passAdmits(db, share(), value, Date.now() + 2 * 60 * 60 * 1000)).toBe(false);
  expect(await passAdmits(db, share({ revoked: true }), value)).toBe(false);
  expect(await passAdmits(db, share({ failedAttempts: 5 }), value)).toBe(false);
  expect(await passAdmits(db, share({ expiresAt: new Date(Date.now() - 1000).toISOString() }), value)).toBe(false);
});

test("a tampered or missing pass is refused", async () => {
  const { value } = await makePass(db, "abc");
  const [id, expires, signature] = value.split(".");
  expect(await passAdmits(db, share(), `${id}.${Number(expires) + 9999}.${signature}`)).toBe(false);
  expect(await passAdmits(db, share(), undefined)).toBe(false);
  expect(await passAdmits(db, share(), "garbage")).toBe(false);
});

test("a pass can't be used as a session, or a session as a pass", async () => {
  const { createSession, readSession } = await import("./session");
  const { value } = await makePass(db, "abc");
  expect(await readSession(db, value)).toBeNull();
  const session = await createSession(db);
  expect(await passAdmits(db, share(), session.value)).toBe(false);
});
