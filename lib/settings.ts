import type { Db } from "./db";
import { HOME_COOKIE, NAV_ORDER_COOKIE, parseHome, parseNavOrder, prefCookie, SECTION_ORDER } from "./prefs";
import { SORTS } from "./sort";


export const SETTING_KEYS: string[] = [
  NAV_ORDER_COOKIE,
  HOME_COOKIE,
  ...SECTION_ORDER.flatMap((section) => [prefCookie("view", section), prefCookie("sort", section)]),
];

export function validSetting(key: string, value: string): boolean {
  if (key === NAV_ORDER_COOKIE) return parseNavOrder(value).join(",") === value;
  if (key === HOME_COOKIE) return parseHome(value) === value;
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

export async function loadSettings(db: Db): Promise<Record<string, string>> {
  const rows = await db.query<{ key: string; value: string }>(`SELECT key, value FROM settings`);
  return Object.fromEntries(rows.filter((r) => validSetting(r.key, r.value)).map((r) => [r.key, r.value]));
}
