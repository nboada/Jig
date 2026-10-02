import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { notesApi, restoreFromTrash, snippetsApi } from "./api";
import type { Caller } from "./api-http";
import { exchangeUnlockCode, issueUnlockCode, lockedNotesApi, passkeyUnlockOptions, unlockValid, unlockWithPasskey, unlockWithPassword } from "./api-locked";
import { pgliteDb, prepare, type Db } from "./db";
import { endAllSessions } from "./session";
import { SnippetError } from "./snippets";

let db: Db;
const SOURCE = "app:Jig for iPhone";
const me: Caller = { source: SOURCE, grantId: "grant-1", clientId: "client-1" };
const q = (init: Record<string, string> = {}) => new URLSearchParams(init);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof SnippetError ? e.code : "server"));

beforeAll(async () => {
  process.env.JIG_ENCRYPTION_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
  process.env.ADMIN_PASSWORD ??= "test-password-long-enough";
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE snippets, snippet_versions, notes, note_versions, trash, oauth_unlock_codes, app_secrets, oauth_grants, login_attempts`);
  await grant("grant-1", "client-1", "app");
});

async function grant(id: string, clientId: string, scope: string) {
  await db.query(
    `INSERT INTO oauth_grants (id, client_id, name, access_hash, access_expires_at, refresh_hash, scope)
     VALUES ($1, $2, 'Jig for iPhone', $3, now() + interval '1 hour', $4, $5)`,
    [id, clientId, `a-${id}`, `r-${id}`, scope],
  );
}

const debounce = { title: "Debounce", language: "javascript", files: [{ name: "a.js", content: "1" }] };

describe("pin, duplicate, delete and undo", () => {
  test("snippets", async () => {
    await snippetsApi.create(db, debounce, SOURCE);
    expect((await snippetsApi.pin(db, "debounce", { pinned: true })).pinned).toBe(true);
    expect((await snippetsApi.list(db, q()))[0].pinned).toBe(true);
    expect(await code(snippetsApi.pin(db, "debounce", { pinned: "yes" }))).toBe("invalid");

    const copy = await snippetsApi.duplicate(db, "debounce", SOURCE);
    expect(copy.slug).not.toBe("debounce");
    expect(copy.title).toContain("Debounce");

    const { trashId } = await snippetsApi.remove(db, "debounce");
    expect(await code(snippetsApi.get(db, "debounce", q()))).toBe("not_found");
    expect(await restoreFromTrash(db, trashId)).toEqual({ kind: "snippets", slug: "debounce" });
    expect((await snippetsApi.get(db, "debounce", q())).version).toBe(1);
    expect(await code(snippetsApi.remove(db, "nope"))).toBe("not_found");
  });

  test("notes, including locked ones, which can be pinned and deleted but not duplicated", async () => {
    await notesApi.create(db, { title: "Keys", body: "secret" }, SOURCE);
    await lockedNotesApi.lock(db, "keys", { locked: true });
    expect(await notesApi.list(db, q())).toEqual([]);
    const locked = await notesApi.locked(db, q());
    expect(locked.map((n) => [n.slug, n.locked, n.excerpt])).toEqual([["keys", true, ""]]);
    expect(JSON.stringify(locked)).not.toContain("secret");

    expect(await notesApi.pin(db, "keys", { pinned: true })).toEqual({ slug: "keys", pinned: true });
    expect(await code(notesApi.duplicate(db, "keys", SOURCE))).toBe("not_found");
    const { trashId } = await notesApi.remove(db, "keys");
    await restoreFromTrash(db, trashId);
    expect((await notesApi.locked(db, q()))[0].slug).toBe("keys");
  });

  test("restore only brings back snippets and notes", async () => {
    await db.query(`INSERT INTO trash (id, kind, slug, title, item, versions) VALUES ('00000000-0000-0000-0000-000000000001', 'credentials', 'bank', 'Bank', '{}', '[]')`);
    expect(await code(restoreFromTrash(db, "00000000-0000-0000-0000-000000000001"))).toBe("not_found");
    expect(await code(restoreFromTrash(db, "not-an-id"))).toBe("not_found");
  });
});

describe("unlocking for the app", () => {
  test("a code is single use, bound to the app that asked, and gives a token for that grant only", async () => {
    const two = await issueUnlockCode(db, "client-1");
    expect(await code(exchangeUnlockCode(db, { ...me, clientId: "other" }, { code: two }))).toBe("invalid");
    const { unlockToken, expiresIn } = await exchangeUnlockCode(db, me, { code: two });
    expect(expiresIn).toBe(1800);
    expect(await unlockValid(db, me, unlockToken)).toBe(true);
    expect(await code(exchangeUnlockCode(db, me, { code: two }))).toBe("invalid");

    expect(await unlockValid(db, { ...me, grantId: "grant-2" }, unlockToken)).toBe(false);
    expect(await unlockValid(db, me, null)).toBe(false);
    expect(await unlockValid(db, me, unlockToken, Date.now() + 31 * 60_000)).toBe(false);
    await endAllSessions(db, Date.now() + 1000);
    expect(await unlockValid(db, me, unlockToken)).toBe(false);
  });

  test("codes are only issued to an app that's already signed in with app access, and bound to that grant", async () => {
    expect(await code(issueUnlockCode(db, "never-connected"))).toBe("invalid");
    await grant("grant-mcp", "client-mcp", "mcp");
    expect(await code(issueUnlockCode(db, "client-mcp"))).toBe("invalid");

    await grant("grant-1b", "client-1", "app");
    const c = await issueUnlockCode(db, "client-1");
    expect(await code(exchangeUnlockCode(db, me, { code: c }))).toBe("invalid");
    const d = await issueUnlockCode(db, "client-1");
    expect(await code(exchangeUnlockCode(db, { ...me, grantId: "grant-1b" }, { code: d }))).toBe("ok");
  });

  test("a code approved before Sign out everywhere gives a token that's already invalid", async () => {
    const c = await issueUnlockCode(db, "client-1");
    await endAllSessions(db, Date.now() + 1000);
    const { unlockToken } = await exchangeUnlockCode(db, me, { code: c }, Date.now() + 2000);
    expect(await unlockValid(db, me, unlockToken, Date.now() + 3000)).toBe(false);
  });

  test("an expired code doesn't work", async () => {
    const c = await issueUnlockCode(db, "client-1");
    expect(await code(exchangeUnlockCode(db, me, { code: c }, Date.now() + 6 * 60_000))).toBe("invalid");
  });

  test("locked notes read, edit, show history and unlock through the locked API", async () => {
    await notesApi.create(db, { title: "Keys", body: "v1 secret" }, SOURCE);
    expect((await lockedNotesApi.lock(db, "keys", { locked: true }))?.locked).toBe(true);
    const [stored] = await db.query<{ body: string }>(`SELECT body FROM note_versions`);
    expect(stored.body).not.toContain("secret");

    expect((await lockedNotesApi.get(db, "keys", q())).body).toBe("v1 secret");
    const { note } = await lockedNotesApi.update(db, "keys", { body: "v2 secret", baseVersion: 1 }, SOURCE);
    expect(note.body).toBe("v2 secret");
    expect((await lockedNotesApi.versions(db, "keys")).length).toBe(2);
    expect((await lockedNotesApi.diff(db, "keys", q({ from: "1" }))).files.length).toBe(1);
    expect((await lockedNotesApi.get(db, "keys", q({ v: "1" }))).body).toBe("v1 secret");

    expect((await lockedNotesApi.lock(db, "keys", { locked: false }))?.locked).toBe(false);
    expect(await code(lockedNotesApi.get(db, "keys", q()))).toBe("not_found");
    expect((await notesApi.get(db, "keys", q())).body).toBe("v2 secret");
  });
});

test("every route that can read a locked note asks for an unlock token in every handler", () => {
  const dir = join(import.meta.dir, "../app");
  const routes = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith("route.ts"));
  const locked = routes.filter((route) => readFileSync(join(dir, route), "utf8").includes("lockedNotesApi"));
  expect(locked.length).toBeGreaterThan(3);
  for (const route of locked) {
    const source = readFileSync(join(dir, route), "utf8");
    const handlers = source.match(/export async function \w+/g) ?? [];
    expect({ route, gated: (source.match(/requireUnlock\(db, req\)/g) ?? []).length }).toEqual({ route, gated: handlers.length });
  }
});

describe("unlocking natively, without the browser", () => {
  const site = { rpID: "jig.example.com", origin: "https://jig.example.com" };
  const assertion = (challenge: string) => ({
    id: "unknown-credential",
    rawId: "unknown-credential",
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: site.origin })).toString("base64url"),
      authenticatorData: "",
      signature: "",
    },
  });

  test("the dashboard password gives the app an unlock token for its own grant", async () => {
    expect(await code(unlockWithPassword(db, me, { password: "wrong" }, "1.1.1.1"))).toBe("invalid");
    const { unlockToken, expiresIn } = await unlockWithPassword(db, me, { password: process.env.ADMIN_PASSWORD }, "1.1.1.1");
    expect(expiresIn).toBeGreaterThan(0);
    expect(await unlockValid(db, me, unlockToken)).toBe(true);
    expect(await unlockValid(db, { ...me, grantId: "grant-2" }, unlockToken)).toBe(false);
  });

  test("wrong passwords are rate limited like the login", async () => {
    for (let i = 0; i < 10; i++) await code(unlockWithPassword(db, me, { password: "wrong" }, "2.2.2.2"));
    await expect(unlockWithPassword(db, me, { password: process.env.ADMIN_PASSWORD }, "2.2.2.2")).rejects.toThrow(/Too many attempts/);
  });

  test("a passkey challenge is used once, and only by the app that asked for it", async () => {
    const { challenge } = await passkeyUnlockOptions(db, me, site);
    await grant("grant-2", "client-2", "app");
    const other = { ...me, grantId: "grant-2", clientId: "client-2" };
    await expect(unlockWithPasskey(db, other, site, { response: assertion(challenge) }, "3.3.3.3")).rejects.toThrow(/expired/);
    await expect(unlockWithPasskey(db, me, site, { response: assertion(challenge) }, "3.3.3.3")).rejects.toThrow(/didn't work/);
    await expect(unlockWithPasskey(db, me, site, { response: assertion(challenge) }, "3.3.3.3")).rejects.toThrow(/expired/);
    await expect(unlockWithPasskey(db, me, site, { response: assertion("made-up") }, "3.3.3.3")).rejects.toThrow(/expired/);
    await expect(unlockWithPasskey(db, me, site, {}, "3.3.3.3")).rejects.toThrow(/expired/);
  });
});
