/**
 * List-page preferences kept in cookies, one per page, so each list remembers its own layout and
 * order. Plain values only: this module is shared by the server (reading) and the browser (writing).
 */
export type Section = "snippets" | "notes" | "credentials";
export type View = "grid" | "list";

export const prefCookie = (kind: "view" | "sort", section: Section) => `jig-${kind}-${section}`;

/** Saves a preference for a year. Browser only. */
export function savePref(kind: "view" | "sort", section: Section, value: string) {
  document.cookie = `${prefCookie(kind, section)}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** True for a bare key press (no modifiers, not repeating) that is not aimed at a text field. */
export function isPlainKey(event: KeyboardEvent, key: string): boolean {
  if (event.key.toLowerCase() !== key || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (event.repeat || event.defaultPrevented) return false;
  const target = event.target as HTMLElement | null;
  return !target?.closest("input, textarea, select, [contenteditable], [role=listbox], [role=dialog]");
}
