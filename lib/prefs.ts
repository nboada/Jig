export type Section = "snippets" | "notes" | "credentials";
export type View = "grid" | "list";

export const prefCookie = (kind: "view" | "sort", section: Section) => `jig-${kind}-${section}`;

export function savePref(kind: "view" | "sort", section: Section, value: string) {
  document.cookie = `${prefCookie(kind, section)}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function isPlainKey(event: KeyboardEvent, key: string): boolean {
  if (event.key.toLowerCase() !== key || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (event.repeat || event.defaultPrevented) return false;
  const target = event.target as HTMLElement | null;
  return !target?.closest("input, textarea, select, [contenteditable], [role=listbox], [role=dialog]");
}

export const SECTION_ORDER: Section[] = ["snippets", "notes", "credentials"];
export const NAV_ORDER_COOKIE = "jig-nav-order";

export function parseNavOrder(value: string | undefined): Section[] {
  const parts = (value ?? "").split(",");
  const valid = parts.length === 3 && new Set(parts).size === 3 && parts.every((p) => SECTION_ORDER.includes(p as Section));
  return valid ? (parts as Section[]) : [...SECTION_ORDER];
}

export const PREFS_SYNCED_COOKIE = "jig-prefs-synced";
