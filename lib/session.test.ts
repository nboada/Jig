import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { makeChallengeCookie, readChallengeCookie, siteFrom } from "./passkeys";
import {
  checkPassword,
  createSession,
  endAllSessions,
  passwordProblem,
  readSession,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  sessionLooksCurrent,
} from "./session";
import { seal, unseal } from "./signing";

let db: Db;
const saved = { password: process.env.ADMIN_PASSWORD, secret: process.env.SESSION_SECRET };

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});
beforeEach(() => {
  process.env.ADMIN_PASSWORD = "a-long-test-password";
  delete process.env.SESSION_SECRET;
});
afterAll(() => {
  for (const [key, value] of [["ADMIN_PASSWORD", saved.password], ["SESSION_SECRET", saved.secret]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("signing", () => {
  test("a value only unseals for the purpose it was sealed for, until it expires", async () => {
    const now = Date.now();
    const value = await seal(db, "share-pass", ["abc"], now / 1000 + 60);
    expect(await unseal(db, "share-pass", value, now)).toEqual(["abc"]);
    expect(await unseal(db, "session", value, now)).toBeNull();
    expect(await unseal(db, "share-pass", value, now + 61_000)).toBeNull();
  });

  test("the key doesn't depend on the password alone: another database signs differently", async () => {
    const other = await prepare(await pgliteDb());
    const value = await seal(db, "share-pass", ["abc"], Date.now() / 1000 + 60);
    expect(await unseal(other, "share-pass", value)).toBeNull();
  });

  test("the database makes its secret once and keeps it", async () => {
    await seal(db, "session", ["1"], Date.now() / 1000 + 60);
    const rows = await db.query(`SELECT value FROM app_secrets WHERE name = 'signing-root'`);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].value).length).toBeGreaterThan(40);
  });

  test("changing the password (without SESSION_SECRET) changes the keys; with SESSION_SECRET it doesn't", async () => {
    const value = await seal(db, "session", ["1"], Date.now() / 1000 + 60);
    process.env.ADMIN_PASSWORD = "another-long-password";
    expect(await unseal(db, "session", value)).toBeNull();

    process.env.SESSION_SECRET = "a-random-session-secret";
    const kept = await seal(db, "session", ["1"], Date.now() / 1000 + 60);
    process.env.ADMIN_PASSWORD = "a-third-long-password";
    expect(await unseal(db, "session", kept)).toEqual(["1"]);
  });

  test("altered values and fields with dots are refused", async () => {
    const value = await seal(db, "unlock", ["1"], Date.now() / 1000 + 60);
    expect(await unseal(db, "unlock", value.replace(/^1/, "2"))).toBeNull();
    expect(await unseal(db, "unlock", "garbage")).toBeNull();
    expect(await unseal(db, "unlock", undefined)).toBeNull();
    expect(seal(db, "unlock", ["a.b"], 0)).rejects.toThrow("dots");
  });
});

describe("sessions", () => {
  test("a new session reads back until it expires, a week later", async () => {
    const now = Date.now();
    const { value, maxAge } = await createSession(db, now);
    expect(maxAge).toBe(SESSION_IDLE_SECONDS);
    expect((await readSession(db, value, now))?.issuedAt).toBe(now);
    expect(await readSession(db, value, now + (SESSION_IDLE_SECONDS + 1) * 1000)).toBeNull();
  });

  test("renewing keeps the start, and never goes past 30 days from it", async () => {
    const start = Date.now() - (SESSION_ABSOLUTE_SECONDS - 3600) * 1000;
    const { value, maxAge } = await createSession(db, Date.now(), start);
    expect(maxAge).toBeLessThanOrEqual(3600);
    expect((await readSession(db, value))?.issuedAt).toBe(start);
  });

  test("signing out everywhere ends every session started before it", async () => {
    const before = await createSession(db, Date.now() - 1000);
    await endAllSessions(db, Date.now());
    expect(await readSession(db, before.value)).toBeNull();
    const after = await createSession(db, Date.now() + 1000);
    expect(await readSession(db, after.value, Date.now() + 1000)).not.toBeNull();
  });

  test("the proxy's check only looks at shape and expiry", async () => {
    const { value } = await createSession(db);
    expect(sessionLooksCurrent(value)).toBe(true);
    expect(sessionLooksCurrent(`1.${Math.floor(Date.now() / 1000) - 1}.x`)).toBe(false);
    expect(sessionLooksCurrent(undefined)).toBe(false);
  });
});

describe("the password", () => {
  test("must be set and at least 12 characters", () => {
    expect(passwordProblem()).toBeNull();
    expect(checkPassword("a-long-test-password")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
    process.env.ADMIN_PASSWORD = "short";
    expect(passwordProblem()).toContain("too short");
    expect(checkPassword("short")).toBe(false);
    delete process.env.ADMIN_PASSWORD;
    expect(passwordProblem()).toContain("not set");
  });
});

describe("passkey challenges", () => {
  test("only answer what they were asked for, once, within five minutes", async () => {
    const now = Date.now();
    const value = await makeChallengeCookie(db, "login", "abc123", now);
    expect(await readChallengeCookie(db, "login", value, now)).toBe("abc123");
    expect(await readChallengeCookie(db, "unlock", value, now)).toBeNull();
    expect(await readChallengeCookie(db, "login", value, now + 6 * 60_000)).toBeNull();
  });
});

test("a passkey's site comes from JIG_ORIGIN when set, else from the request", () => {
  expect(siteFrom("jig.example.com", "https", "https://snippets.example.com")).toEqual({
    rpID: "snippets.example.com",
    origin: "https://snippets.example.com",
  });
  expect(siteFrom("localhost:3000", null, undefined)).toEqual({ rpID: "localhost", origin: "http://localhost:3000" });
});
