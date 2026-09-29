"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectIcon, CredentialsIcon, NotesIcon, SnippetsIcon } from "@/components/NavIcons";

const SECTIONS = [
  { href: "/snippets", label: "Snippets", Icon: SnippetsIcon, key: "1" },
  { href: "/notes", label: "Notes", Icon: NotesIcon, key: "2" },
  { href: "/credentials", label: "Credentials", Icon: CredentialsIcon, key: "3" },
];

const CONNECT = { href: "/connect", label: "Connect", Icon: ConnectIcon, key: undefined };

/** The header's section tabs. Connect joins them on phones; on wider screens it sits on the right. */
export function TopNav({ withConnect = false, className = "" }: { withConnect?: boolean; className?: string }) {
  const pathname = usePathname();
  const links = withConnect ? [...SECTIONS, CONNECT] : SECTIONS;
  return (
    <nav className={`items-center gap-3 text-sm font-medium ${className}`}>
      {links.map(({ href, label, Icon, key }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-keyshortcuts={key}
            title={key ? `${label} (${key})` : label}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${
              active ? "bg-raised text-text" : "text-muted hover:text-text"
            }`}
          >
            <Icon className={`size-4 ${active ? "text-accent" : ""}`} />
            {label}
            {key && (
              <kbd className="hidden rounded border border-line px-1 font-sans text-[10px] font-normal leading-4 text-muted md:inline">
                {key}
              </kbd>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Connect as a quiet link on the right of the header, for wider screens. */
export function ConnectLink({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const active = pathname.startsWith(CONNECT.href);
  return (
    <Link
      href={CONNECT.href}
      aria-current={active ? "page" : undefined}
      className={`items-center gap-1.5 text-sm transition ${active ? "text-text" : "text-muted hover:text-text"} ${className}`}
    >
      <ConnectIcon className="size-4" />
      Connect
    </Link>
  );
}
