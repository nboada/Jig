import { afterAll, beforeAll, expect, test } from "bun:test";
import { makePass, passAdmits } from "./share-pass";
import type { Share } from "./shares";

const saved = process.env.ADMIN_PASSWORD;
beforeAll(() => {
  process.env.ADMIN_PASSWORD = "test-password";
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
  const { value } = await makePass("abc");
  expect(await passAdmits(share(), value)).toBe(true);
});

test("a pass is refused for another link, after it expires, or once the link is shut", async () => {
  const { value } = await makePass("abc");
  expect(await passAdmits(share({ id: "other" }), value)).toBe(false);
  expect(await passAdmits(share(), value, Date.now() + 2 * 60 * 60 * 1000)).toBe(false);
  expect(await passAdmits(share({ revoked: true }), value)).toBe(false);
  expect(await passAdmits(share({ failedAttempts: 5 }), value)).toBe(false);
  expect(await passAdmits(share({ expiresAt: new Date(Date.now() - 1000).toISOString() }), value)).toBe(false);
});

test("a tampered or missing pass is refused", async () => {
  const { value } = await makePass("abc");
  const [expires] = value.split(".");
  expect(await passAdmits(share(), `${Number(expires) + 9999}.${value.split(".")[1]}`)).toBe(false);
  expect(await passAdmits(share(), undefined)).toBe(false);
  expect(await passAdmits(share(), "garbage")).toBe(false);
});
