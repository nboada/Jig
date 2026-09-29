import { expect, test } from "bun:test";
import { pgliteDb, prepare, type Db } from "./db";

test("the schema goes over in one batch, and preparing twice is harmless", async () => {
  const pg = await pgliteDb();
  let batches = 0;
  let queries = 0;
  const counting: Db = {
    query: (text, params) => {
      queries++;
      return pg.query(text, params);
    },
    batch: (statements) => {
      batches++;
      return pg.batch!(statements);
    },
  };
  await prepare(counting);
  await prepare(counting);
  expect(batches).toBe(2);
  expect(queries).toBe(0);
  const [row] = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM snippets`);
  expect(row.n).toBe(0);
});

test("a failed batch falls back to one statement at a time", async () => {
  const pg = await pgliteDb();
  let queries = 0;
  const flaky: Db = {
    query: (text, params) => {
      queries++;
      return pg.query(text, params);
    },
    batch: async () => {
      throw new Error("transaction endpoint down");
    },
  };
  const error = console.error;
  console.error = () => {};
  try {
    await prepare(flaky);
  } finally {
    console.error = error;
  }
  expect(queries).toBeGreaterThan(5);
  const [row] = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM notes`);
  expect(row.n).toBe(0);
});
