import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";
import { checkLogin, clearFailures, clientIpFrom, recordFailure } from "./ratelimit";

let db: Db;

beforeAll(async () => {
  db = await prepare(await pgliteDb());
});

beforeEach(async () => {
  await db.query(`TRUNCATE login_attempts`);
});

const t0 = new Date("2026-01-01T00:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

async function fail(ip: string, times: number, when: Date) {
  for (let i = 0; i < times; i++) await recordFailure(db, ip, when);
}

describe("login rate limiting", () => {
  test("ten recorded attempts are allowed, the eleventh blocks for the rest of the window", async () => {
    await fail("1.1.1.1", 10, at(0));
    expect(await checkLogin(db, "1.1.1.1", at(0))).toEqual({ blocked: false, retryAfterMinutes: 0 });
    await fail("1.1.1.1", 1, at(0));
    expect(await checkLogin(db, "1.1.1.1", at(0))).toEqual({ blocked: true, retryAfterMinutes: 15 });
    expect(await checkLogin(db, "1.1.1.1", at(5))).toEqual({ blocked: true, retryAfterMinutes: 10 });
    expect((await checkLogin(db, "1.1.1.1", at(15.01))).blocked).toBe(false);
  });

  test("other IPs are not affected", async () => {
    await fail("1.1.1.1", 10, at(0));
    expect((await checkLogin(db, "2.2.2.2", at(0))).blocked).toBe(false);
  });

  test("a successful login clears the failures", async () => {
    await fail("1.1.1.1", 10, at(0));
    await clearFailures(db, "1.1.1.1");
    expect((await checkLogin(db, "1.1.1.1", at(0))).blocked).toBe(false);
  });

  test("old attempts are pruned when a new one is recorded", async () => {
    await fail("1.1.1.1", 3, at(0));
    await recordFailure(db, "2.2.2.2", at(30));
    const rows = await db.query(`SELECT ip FROM login_attempts`);
    expect(rows.map((r) => r.ip)).toEqual(["2.2.2.2"]);
  });

  test("the client IP is the first x-forwarded-for entry", () => {
    expect(clientIpFrom("203.0.113.5, 10.0.0.1")).toBe("203.0.113.5");
    expect(clientIpFrom(" 203.0.113.5 ")).toBe("203.0.113.5");
    expect(clientIpFrom(null)).toBe("unknown");
    expect(clientIpFrom("  ")).toBe("unknown");
  });
});
