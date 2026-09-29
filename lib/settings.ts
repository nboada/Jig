import type { Db } from "./db";
import { NAV_ORDER_COOKIE, parseNavOrder, prefCookie, SECTION_ORDER } from "./prefs";
import { SORTS } from "./sort";

/**
 * Dashboard preferences (tab order, each list's layout and sort) kept in the database, so they
 * follow the user to every browser. Each browser keeps a copy in cookies, named after the same
 * keys, which is what pages actually read: the database is only touched when a preference changes
 * and when a browser catches up (on login, and at most every few minutes after that).
 */

export const SETTING_KEYS: string[] = [
  NAV_ORDER_COOKIE,
  ...SECTION_ORDER.flatMap((section) => [prefCookie("view", section), prefCookie("sort", section)]),
];

/** Only known keys with sensible values get stored, so a cookie can't be used to write junk. */
export function validSetting(key: string, value: string): boolean {
  if (key === NAV_ORDER_COOKIE) return parseNavOrder(value).join(",") === value;
  if (key.startsWith("jig-view-")) return SETTING_KEYS.includes(key) && (value === "grid" || value === "list");
  if (key.startsWith("jig-sort-")) return SETTING_KEYS.includes(key) && SORTS.some((s) => s.id === value);
  return false;
}

export async function saveSetting(db: Db, key: string, value: string): Promise<void> {
  if (!validSetting(key, value)) return;
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

/** Every stored preference that is still valid, as cookie name → value. */
export async function loadSettings(db: Db): Promise<Record<string, string>> {
  const rows = await db.query<{ key: string; value: string }>(`SELECT key, value FROM settings`);
  return Object.fromEntries(rows.filter((r) => validSetting(r.key, r.value)).map((r) => [r.key, r.value]));
}
