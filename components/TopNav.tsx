"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Kbd } from "@/components/Kbd";
import { ConnectIcon, CredentialsIcon, NotesIcon, SnippetsIcon } from "@/components/NavIcons";

const SECTIONS = [
  { href: "/snippets", label: "Snippets", Icon: SnippetsIcon, key: "1" },
  { href: "/notes", label: "Notes", Icon: NotesIcon, key: "2" },
  { href: "/credentials", label: "Credentials", Icon: CredentialsIcon, key: "3" },
];

const CONNECT = { href: "/connect", label: "Connect", Icon: ConnectIcon, key: undefined };

/**
 * The header's section tabs, as a pill group with the current section filled in the accent colour.
 * The others keep an outline, so they still read as buttons on pages with no section (home, Connect).
 */
export function TopNav({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={`items-center gap-2 rounded-full bg-ink p-1 text-ui font-medium ${className}`}>
      {SECTIONS.map(({ href, label, Icon, key }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-keyshortcuts={key}
            title={`${label} (${key})`}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-full border pr-3.5 pl-4 transition ${
              active
                ? "border-transparent bg-accent text-accent-ink"
                : "border-line bg-panel text-text-2 hover:border-muted/60 hover:bg-overlay hover:text-text"
            }`}
          >
            <Icon className="size-4" />
            {label}
            <Kbd onAccent={active}>{key}</Kbd>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The phone's tab bar along the bottom of the screen, in thumb reach: the three sections and
 * Connect. It replaces the header's tabs below the md breakpoint.
 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {[...SECTIONS, CONNECT].map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
              active ? "text-text" : "text-muted"
            }`}
          >
            <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? "bg-accent text-accent-ink" : ""}`}>
              <Icon className="size-[18px]" />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
