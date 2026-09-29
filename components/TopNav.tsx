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

/**
 * The header's section tabs, as a pill group with the current section filled in the accent
 * colour. Connect joins them on phones; on wider screens it is a round button on the right.
 */
export function TopNav({ withConnect = false, className = "" }: { withConnect?: boolean; className?: string }) {
  const pathname = usePathname();
  const links = withConnect ? [...SECTIONS, CONNECT] : SECTIONS;
  return (
    <nav className={`items-center gap-1 rounded-full bg-ink p-1 text-sm font-medium ${className}`}>
      {links.map(({ href, label, Icon, key }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-keyshortcuts={key}
            title={key ? `${label} (${key})` : label}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-full px-4 transition ${
              active ? "bg-accent text-accent-ink" : "text-muted hover:bg-raised hover:text-text"
            }`}
          >
            <Icon className="size-4" />
            {label}
            {key && (
              <kbd
                className={`hidden rounded border px-1 font-sans text-[10px] font-normal leading-4 md:inline ${
                  active ? "border-accent-ink/25 text-accent-ink/70" : "border-line text-muted"
                }`}
              >
                {key}
              </kbd>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Connect as a round icon button on the right of the header, for wider screens. */
export function ConnectLink({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const active = pathname.startsWith(CONNECT.href);
  return (
    <Link
      href={CONNECT.href}
      aria-current={active ? "page" : undefined}
      aria-label="Connect an agent"
      title="Connect an agent"
      className={`size-10 place-items-center rounded-full transition ${
        active ? "bg-accent text-accent-ink" : "bg-ink text-text/85 hover:bg-line hover:text-text"
      } ${className}`}
    >
      <ConnectIcon className="size-4" />
    </Link>
  );
}
