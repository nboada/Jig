"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectIcon, CredentialsIcon, NotesIcon, SnippetsIcon } from "@/components/NavIcons";

const SECTIONS: Section[] = [
  { href: "/snippets", label: "Snippets", Icon: SnippetsIcon, create: "/snippets/new", match: (p: string) => p.startsWith("/snippets") },
  { href: "/notes", label: "Notes", Icon: NotesIcon, create: "/notes/new", match: (p: string) => p.startsWith("/notes") },
  { href: "/credentials", label: "Credentials", Icon: CredentialsIcon, create: "/credentials/new", match: (p: string) => p.startsWith("/credentials") },
];

// Setup, not daily use, so it sits at the foot of the sidebar.
const CONNECT = { href: "/connect", label: "Connect", Icon: ConnectIcon, match: (p: string) => p.startsWith("/connect") };

type Section = { href: string; label: string; Icon: typeof ConnectIcon; create?: string; match: (p: string) => boolean };

/**
 * The sidebar's section links, each with a + shortcut to create a new item. Connect and
 * `children` (the log out button) are pinned to the bottom.
 */
export function SidebarNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col text-sm">
      <div className="space-y-0.5">
        {SECTIONS.map((s) => (
          <SectionLink key={s.href} section={s} active={s.match(pathname)} />
        ))}
      </div>
      <div className="mt-auto space-y-3">
        <SectionLink section={CONNECT} active={CONNECT.match(pathname)} />
        {children}
      </div>
    </nav>
  );
}

function SectionLink({ section: s, active }: { section: Section; active: boolean }) {
  return (
    <div
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
}
