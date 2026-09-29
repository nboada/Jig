"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectIcon, CredentialsIcon, NotesIcon, SnippetsIcon } from "@/components/NavIcons";

const SECTIONS = [
  { href: "/", label: "Snippets", Icon: SnippetsIcon, create: "/snippets/new", match: (p: string) => p === "/" || p.startsWith("/snippets") },
  { href: "/notes", label: "Notes", Icon: NotesIcon, create: "/notes/new", match: (p: string) => p.startsWith("/notes") },
  { href: "/credentials", label: "Credentials", Icon: CredentialsIcon, create: "/credentials/new", match: (p: string) => p.startsWith("/credentials") },
  { href: "/connect", label: "Connect", Icon: ConnectIcon, match: (p: string) => p.startsWith("/connect") },
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
            <Link href={s.href} aria-current={active ? "page" : undefined} className="flex flex-1 items-center gap-2.5 px-3 py-2">
              <s.Icon className={`size-4 ${active ? "text-accent" : ""}`} />
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
