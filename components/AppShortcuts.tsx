"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isPlainKey, type Section } from "@/lib/prefs";


const ITEM_PAGE = /^\/(snippets|notes|credentials)\/(?!new$)[^/]+$/;

function newHref(pathname: string) {
  if (pathname.startsWith("/notes")) return "/notes/new";
  if (pathname.startsWith("/credentials")) return "/credentials/new";
  return "/snippets/new";
}

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
      } else if (isPlainKey(event, "e") && ITEM_PAGE.test(pathname)) {
        event.preventDefault();
        router.push(`${pathname}/edit`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, pathname, order]);

  return null;
}
