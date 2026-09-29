"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Where N leads from a given page: a new item of the kind being looked at, snippets by default. */
function newHref(pathname: string) {
  if (pathname.startsWith("/notes")) return "/notes/new";
  if (pathname.startsWith("/credentials")) return "/credentials/new";
  return "/snippets/new";
}

/**
 * Pressing N creates a new item. Browsers keep Cmd+N for a new window, so it is the bare key,
 * ignored while typing and on forms (new and edit pages) so it can never discard unsaved work.
 */
export function NewShortcut() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (/\/(new|edit)$/.test(pathname)) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "n" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.repeat || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=listbox], [role=dialog]")) return;
      event.preventDefault();
      router.push(newHref(pathname));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, pathname]);

  return null;
}
