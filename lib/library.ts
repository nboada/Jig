import type { Db } from "./db";

export type LibraryCounts = { snippets: number; notes: number; credentials: number };

/** How many of each kind the library holds, in one round trip. */
export async function countLibrary(db: Db): Promise<LibraryCounts> {
  const [row] = await db.query(
    `SELECT (SELECT count(*) FROM snippets) AS snippets,
            (SELECT count(*) FROM notes) AS notes,
            (SELECT count(*) FROM credentials) AS credentials`,
  );
  return { snippets: Number(row.snippets), notes: Number(row.notes), credentials: Number(row.credentials) };
}
