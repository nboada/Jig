import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { restoreFromTrash, snippetsApi } from "./api";
import { UnlockRequired, type Caller } from "./api-http";
import { exchangeUnlockCode, issueUnlockCode, unlockValid } from "./api-locked";
import { accountApi, connectApi, credentialsApi, sharesApi, trashApi } from "./api-secure";
import { pgliteDb, prepare, type Db } from "./db";
import { SnippetError } from "./snippets";

let db: Db;
const me: Caller = { source: "app:Jig for iPhone", grantId: "grant-1", clientId: "client-1" };
const ORIGIN = "https://jig.example.com";
const q = (init: Record<string, string> = {}) => new URLSearchParams(init);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof SnippetError ? e.code : e instanceof UnlockRequired ? "locked" : "server"));

const bank = {
  title: "Bank",
  url: "https://bank.example",
  tags: ["money"],
  fields: [
    { label: "Username", secret: false, value: "nico" },
    { label: "Password", secret: true, value: "hunter2-long" },
  ],
};

beforeAll(async () => {
  process.env.JIG_ENCRYPTION_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
  process.env.ADMIN_PASSWORD ??= "test-password-long-enough";
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE credentials, snippets, snippet_versions, trash, shares, api_tokens, oauth_grants, oauth_unlock_codes, app_secrets`);
  await db.query(
    `INSERT INTO oauth_grants (id, client_id, name, access_hash, access_expires_at, refresh_hash, scope)
     VALUES ('grant-1', 'client-1', 'Jig for iPhone', 'a1', now() + interval '1 hour', 'r1', 'app'),
            ('grant-2', 'client-2', 'Claude', 'a2', now() + interval '1 hour', 'r2', 'mcp')`,
  );
});

describe("credentials", () => {
  test("secrets are hidden unless revealed, and edits keep secrets the app didn't touch", async () => {
    const created = await credentialsApi.create(db, bank);
    expect(created.fields.map((f) => [f.label, f.value])).toEqual([["Username", "nico"], ["Password", null]]);
    expect(JSON.stringify(await credentialsApi.list(db, q()))).not.toContain("hunter2");
    expect(JSON.stringify(await credentialsApi.get(db, "bank"))).not.toContain("hunter2");

    const password = created.fields[1];
    expect(await credentialsApi.reveal(db, "bank", password.id)).toEqual({ value: "hunter2-long" });

    const fields = created.fields.map((f) => ({ id: f.id, label: f.label, secret: f.secret, value: f.secret ? "" : "nico2" }));
    await credentialsApi.update(db, "bank", { ...bank, fields });
    expect(await credentialsApi.reveal(db, "bank", password.id)).toEqual({ value: "hunter2-long" });
    expect((await credentialsApi.get(db, "bank")).fields[0].value).toBe("nico2");

    expect(await code(credentialsApi.get(db, "nope"))).toBe("not_found");
    expect((await credentialsApi.tags(db))[0].tag).toBe("money");
  });

  test("deleting goes to Recently deleted, from where it can come back or go for good", async () => {
    await credentialsApi.create(db, bank);
    const { trashId } = await credentialsApi.remove(db, "bank");
    expect((await trashApi.list(db)).map((t) => [t.kind, t.slug])).toEqual([["credentials", "bank"]]);
    await restoreFromTrash(db, trashId);
    expect((await credentialsApi.get(db, "bank")).title).toBe("Bank");

    const again = await credentialsApi.remove(db, "bank");
    await trashApi.purge(db, again.trashId);
    expect(await trashApi.list(db)).toEqual([]);
    expect(await code(trashApi.purge(db, "not-an-id"))).toBe("not_found");
  });
});

describe("share links", () => {
  test("snippet links need no unlock; credential links need it and come with a passcode", async () => {
    await snippetsApi.create(db, { title: "Debounce", language: "javascript", files: [{ name: "a.js", content: "1" }] }, me.source);
    const snippet = await sharesApi.create(db, { kind: "snippets", slug: "debounce", expiry: "7d", maxViews: 3, label: "For Sam" }, ORIGIN, false);
    expect(snippet.url).toStartWith(`${ORIGIN}/s/`);
    expect(snippet.passcode).toBeUndefined();
    expect(snippet.share.maxViews).toBe(3);

    await credentialsApi.create(db, bank);
    expect(await code(sharesApi.create(db, { kind: "credentials", slug: "bank", expiry: "1h" }, ORIGIN, false))).toBe("locked");
    const secret = await sharesApi.create(db, { kind: "credentials", slug: "bank", expiry: "1h" }, ORIGIN, true);
    expect(secret.passcode).toBeTruthy();

    expect(await code(sharesApi.reveal(db, secret.share.id, ORIGIN, false))).toBe("locked");
    expect((await sharesApi.reveal(db, secret.share.id, ORIGIN, true)).url).toBe(secret.url);
    expect((await sharesApi.reveal(db, snippet.share.id, ORIGIN, false)).url).toBe(snippet.url);

    await sharesApi.revoke(db, snippet.share.id);
    expect((await sharesApi.list(db, q({ kind: "snippets", slug: "debounce" })))[0].revoked).toBe(true);
    await sharesApi.restore(db, snippet.share.id);
    expect((await sharesApi.list(db, q({ kind: "snippets", slug: "debounce" })))[0].revoked).toBe(false);
    await sharesApi.remove(db, snippet.share.id);
    expect(await sharesApi.list(db, q({ kind: "snippets", slug: "debounce" }))).toEqual([]);

    expect(await code(sharesApi.create(db, { kind: "snippets", slug: "debounce", expiry: "1y" }, ORIGIN, false))).toBe("invalid");
    expect(await code(sharesApi.list(db, q({ kind: "passwords", slug: "x" })))).toBe("invalid");
  });
});

describe("connect and account", () => {
  test("tokens are shown once, apps can't disconnect themselves, and sign out everywhere ends app unlocks", async () => {
    const made = await connectApi.createToken(db, { name: "Cursor" });
    expect(made.token).toStartWith("jig_");
    expect(JSON.stringify(await connectApi.tokens(db))).not.toContain(made.token);
    await connectApi.revokeToken(db, made.record.id);
    expect(await connectApi.tokens(db)).toEqual([]);
    expect(await code(connectApi.createToken(db, { name: " " }))).toBe("invalid");

    const apps = await connectApi.apps(db, me);
    expect(apps.find((a) => a.id === "grant-1")?.current).toBe(true);
    expect(await code(connectApi.disconnect(db, me, "grant-1"))).toBe("invalid");
    await connectApi.disconnect(db, me, "grant-2");
    expect((await connectApi.apps(db, me)).map((a) => a.id)).toEqual(["grant-1"]);

    const { unlockToken } = await exchangeUnlockCode(db, me, { code: await issueUnlockCode(db, "client-1") });
    expect(await unlockValid(db, me, unlockToken)).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    await accountApi.endSessions(db, me);
    expect(await unlockValid(db, me, unlockToken)).toBe(false);
    expect(await accountApi.passkeys(db)).toEqual([]);
  });

  test("sign out everywhere also disconnects every other app and connector, but not this device", async () => {
    await db.query(
      `INSERT INTO oauth_grants (id, client_id, name, access_hash, access_expires_at, refresh_hash, scope)
       VALUES ('grant-3', 'client-3', 'Old phone', 'a3', now() + interval '1 hour', 'r3', 'app')`,
    );
    await accountApi.endSessions(db, me);
    expect((await connectApi.apps(db, me)).map((a) => a.id)).toEqual(["grant-1"]);
  });

  test("odd expiry values and ids are refused, not crashed on", async () => {
    await snippetsApi.create(db, { title: "Debounce", language: "javascript", files: [{ name: "a.js", content: "1" }] }, me.source);
    for (const expiry of ["toString", "constructor", "__proto__"]) {
      expect(await code(sharesApi.create(db, { kind: "snippets", slug: "debounce", expiry }, ORIGIN, false))).toBe("invalid");
    }
    expect(await code(connectApi.disconnect(db, me, "x'; drop"))).toBe("not_found");
    expect(await code(accountApi.removePasskey(db, "a".repeat(600)))).toBe("not_found");
  });
});

test("every route that reveals a secret or removes a passkey asks for the unlock, and share routes check it", () => {
  const dir = join(import.meta.dir, "../app/api/v1");
  const routes = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith("route.ts"));
  const read = (route: string) => readFileSync(join(dir, route), "utf8");
  const gated = routes.filter((r) => /credentialsApi\.reveal|accountApi\.removePasskey|connectApi\.createToken|connectApi\.disconnect/.test(read(r)));
  expect(gated.length).toBe(4);
  for (const route of gated) {
    const source = read(route);
    for (const handler of source.split("export async function").slice(1)) {
      if (/credentialsApi\.reveal|accountApi\.removePasskey|connectApi\.createToken|connectApi\.disconnect/.test(handler)) {
        expect({ route, gate: handler.includes("requireUnlock(db, req)") }).toEqual({ route, gate: true });
      }
    }
  }
  const shares = routes.filter((r) => /sharesApi\.(create|reveal)/.test(read(r)));
  expect(shares.length).toBe(2);
  for (const route of shares) expect({ route, checks: read(route).includes("unlockValid(db, caller") }).toEqual({ route, checks: true });
});
