import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { loadSettings, saveSetting, validSetting } from "./settings";

let db: Db;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE settings`);
});

describe("settings", () => {
  test("accepts only known keys with sensible values", () => {
    expect(validSetting("jig-nav-order", "notes,snippets,credentials")).toBe(true);
    expect(validSetting("jig-nav-order", "notes,notes,credentials")).toBe(false);
    expect(validSetting("jig-view-notes", "grid")).toBe(true);
    expect(validSetting("jig-view-notes", "table")).toBe(false);
    expect(validSetting("jig-sort-snippets", "title")).toBe(true);
    expect(validSetting("jig-sort-snippets", "random")).toBe(false);
    expect(validSetting("jig_session", "anything")).toBe(false);
  });

  test("saves, updates and loads", async () => {
    await saveSetting(db, "jig-view-notes", "grid");
    await saveSetting(db, "jig-view-notes", "list");
    await saveSetting(db, "jig-nav-order", "notes,snippets,credentials");
    await saveSetting(db, "jig-sort-notes", "bogus");
    expect(await loadSettings(db)).toEqual({ "jig-view-notes": "list", "jig-nav-order": "notes,snippets,credentials" });
  });
});
