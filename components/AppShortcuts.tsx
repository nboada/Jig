"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isPlainKey } from "@/lib/prefs";

/** 1, 2 and 3 open the sections, in the order of the header's tabs. */
const SECTION_KEYS: Record<string, string> = { "1": "/snippets", "2": "/notes", "3": "/credentials" };

/** Where N leads from a given page: a new item of the kind being looked at, snippets by default. */
function newHref(pathname: string) {
  if (pathname.startsWith("/notes")) return "/notes/new";
  if (pathname.startsWith("/credentials")) return "/credentials/new";
  return "/snippets/new";
}

/**
 * App-wide keys: N for a new item, 1–3 for the sections. Browsers keep Cmd+N for a new window,
 * so these are bare keys, ignored while typing and on forms (new and edit pages) so they can
 * never discard unsaved work.
 */
export function AppShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (/\/(new|edit)$/.test(pathname)) return;
    function onKeyDown(event: KeyboardEvent) {
      const section = Object.keys(SECTION_KEYS).find((key) => isPlainKey(event, key));
      if (section) {
        event.preventDefault();
        router.push(SECTION_KEYS[section]);
      } else if (isPlainKey(event, "n")) {
        event.preventDefault();
        router.push(newHref(pathname));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, pathname]);

  return null;
}
