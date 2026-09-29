"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/", label: "Snippets", create: "/snippets/new", match: (p: string) => p === "/" || p.startsWith("/snippets") },
  { href: "/notes", label: "Notes", create: "/notes/new", match: (p: string) => p.startsWith("/notes") },
  { href: "/credentials", label: "Credentials", create: "/credentials/new", match: (p: string) => p.startsWith("/credentials") },
  { href: "/connect", label: "Connect", match: (p: string) => p.startsWith("/connect") },
];

/** The sidebar's section links, each with a + shortcut to create a new item. */
export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5 text-sm">
      {SECTIONS.map((s) => {
        const active = s.match(pathname);
        return (
          <div
            key={s.href}
            className={`group flex items-center rounded-md transition ${active ? "bg-raised text-text" : "text-muted hover:bg-raised/60 hover:text-text"}`}
          >
            <Link href={s.href} aria-current={active ? "page" : undefined} className="flex-1 px-3 py-2">
              {s.label}
            </Link>
            {s.create && (
              <Link
                href={s.create}
                aria-label={`New ${s.label.toLowerCase().replace(/s$/, "")}`}
                title={`New ${s.label.toLowerCase().replace(/s$/, "")}`}
                className="mr-1 grid size-7 place-items-center rounded text-base leading-none text-muted hover:bg-line hover:text-text"
              >
                +
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
