"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isPlainKey, type Section } from "@/lib/prefs";


/** Where N leads from a given page: a new item of the kind being looked at, snippets by default. */
function newHref(pathname: string) {
  if (pathname.startsWith("/notes")) return "/notes/new";
  if (pathname.startsWith("/credentials")) return "/credentials/new";
  return "/snippets/new";
}

/**
 * App-wide keys: N for a new item, 1–3 for the sections in the header's order. Browsers keep Cmd+N for a new window,
 * so these are bare keys, ignored while typing and on forms (new and edit pages) so they can
 * never discard unsaved work.
 */
/** `order` is the header tabs' order: 1, 2 and 3 open them left to right. */
export function AppShortcuts({ order }: { order: Section[] }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (/\/(new|edit)$/.test(pathname)) return;
    function onKeyDown(event: KeyboardEvent) {
      const index = ["1", "2", "3"].findIndex((key) => isPlainKey(event, key));
      if (index >= 0) {
        event.preventDefault();
        router.push(`/${order[index]}`);
      } else if (isPlainKey(event, "n")) {
        event.preventDefault();
        router.push(newHref(pathname));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, pathname, order]);

  return null;
}
