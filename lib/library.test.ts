import { afterAll, beforeAll, expect, test } from "bun:test";
import { createCredential } from "./credentials";
import { pgliteDb, prepare, type Db } from "./db";
import { countLibrary } from "./library";
import { createNote } from "./notes";
import { createSnippet } from "./snippets";

let db: Db;
const saved = process.env.JIG_ENCRYPTION_KEY;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
  process.env.JIG_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

afterAll(() => {
  if (saved === undefined) delete process.env.JIG_ENCRYPTION_KEY;
  else process.env.JIG_ENCRYPTION_KEY = saved;
});

test("counts each kind, starting from an empty library", async () => {
  expect(await countLibrary(db)).toEqual({ snippets: 0, notes: 0, credentials: 0 });

  await createSnippet(db, { title: "One", language: "css", files: [{ name: "a.css", content: "a{}" }] });
  await createSnippet(db, { title: "Two", language: "php", files: [{ name: "b.php", content: "<?php" }] });
  await createNote(db, { title: "Hosting", body: "Plesk" });
  await createCredential(db, { title: "Staging", fields: [{ label: "User", secret: false, value: "admin" }] });

  expect(await countLibrary(db)).toEqual({ snippets: 2, notes: 1, credentials: 1 });
});
