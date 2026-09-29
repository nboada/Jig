"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Kbd } from "@/components/Kbd";
import { ConnectIcon, CredentialsIcon, NotesIcon, SnippetsIcon } from "@/components/NavIcons";
import { savePreference } from "@/app/actions";
import { NAV_ORDER_COOKIE, type Section } from "@/lib/prefs";

const SECTION_INFO: Record<Section, { href: string; label: string; Icon: (p: { className?: string }) => React.ReactNode }> = {
  snippets: { href: "/snippets", label: "Snippets", Icon: SnippetsIcon },
  notes: { href: "/notes", label: "Notes", Icon: NotesIcon },
  credentials: { href: "/credentials", label: "Credentials", Icon: CredentialsIcon },
};

/** The sections in the user's order, each with the number key that opens it. */
const sectionsIn = (order: Section[]) => order.map((id, i) => ({ id, ...SECTION_INFO[id], key: String(i + 1) }));

const CONNECT = { href: "/connect", label: "Connect", Icon: ConnectIcon, key: undefined };

/**
 * The header's section tabs, as a pill group with the current section filled in the accent colour.
 * The others keep an outline, so they still read as buttons on pages with no section (home, Connect).
 * Drag a tab to reorder them; the order is saved (and follows you to other browsers) and the 1–3
 * keys follow it.
 */
export function TopNav({ order, className = "" }: { order: Section[]; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState(order);
  const [dragging, setDragging] = useState<Section | null>(null);

  function moveOver(target: Section) {
    if (!dragging || dragging === target) return;
    const next = tabs.filter((t) => t !== dragging);
    next.splice(tabs.indexOf(target), 0, dragging);
    setTabs(next);
  }

  function finish() {
    setDragging(null);
    if (tabs.join() !== order.join()) {
      // Saved for every browser; then redraw so the number keys and phone tab bar follow.
      savePreference(NAV_ORDER_COOKIE, tabs.join(",")).then(() => router.refresh());
    }
  }

  return (
    <nav className={`items-center gap-2 rounded-full bg-ink p-1 text-ui font-medium ${className}`}>
      {sectionsIn(tabs).map(({ id, href, label, Icon, key }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDragging(id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              moveOver(id);
            }}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={finish}
            aria-current={active ? "page" : undefined}
            aria-keyshortcuts={key}
            title={`${label} (${key}) · drag to reorder`}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-full border pr-3.5 pl-4 transition ${
              active
                ? "border-transparent bg-accent text-accent-ink"
                : "border-line bg-panel text-text-2 hover:border-muted/60 hover:bg-overlay hover:text-text"
            } ${dragging === id ? "opacity-50" : ""}`}
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
export function BottomNav({ order }: { order: Section[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {[...sectionsIn(order), CONNECT].map(({ href, label, Icon }) => {
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
