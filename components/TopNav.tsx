"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { Kbd } from "@/components/Kbd";
import { CredentialsIcon, NotesIcon, SnippetsIcon } from "@/components/NavIcons";
import { savePreference } from "@/app/actions";
import { NAV_ORDER_COOKIE, type Section } from "@/lib/prefs";

const SECTION_INFO: Record<Section, { href: string; label: string; Icon: (p: { className?: string }) => React.ReactNode }> = {
  snippets: { href: "/snippets", label: "Snippets", Icon: SnippetsIcon },
  notes: { href: "/notes", label: "Notes", Icon: NotesIcon },
  credentials: { href: "/credentials", label: "Credentials", Icon: CredentialsIcon },
};

const sectionsIn = (order: Section[]) => order.map((id, i) => ({ id, ...SECTION_INFO[id], key: String(i + 1) }));

export function TopNav({ order, className = "" }: { order: Section[]; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState(order);
  const [dragging, setDragging] = useState<Section | null>(null);
  const [clicked, setClicked] = useState<{ href: string; from: string } | null>(null);
  const current = clicked?.from === pathname ? clicked.href : sectionsIn(tabs).find(({ href }) => pathname.startsWith(href))?.href;
  const navRef = useRef<HTMLElement>(null);
  const [fill, setFill] = useState<{ left: number; width: number; animate: boolean } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = () => {
      const tab = current ? nav?.querySelector<HTMLElement>(`a[href="${current}"]`) : null;
      setFill((prev) => (tab ? { left: tab.offsetLeft, width: tab.offsetWidth, animate: prev !== null } : null));
    };
    measure();
    if (!nav) return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [current, tabs]);

  function moveOver(target: Section) {
    if (!dragging || dragging === target) return;
    const next = tabs.filter((t) => t !== dragging);
    next.splice(tabs.indexOf(target), 0, dragging);
    setTabs(next);
  }

  function finish() {
    setDragging(null);
    if (tabs.join() !== order.join()) {
      savePreference(NAV_ORDER_COOKIE, tabs.join(",")).then(() => router.refresh());
    }
  }

  return (
    <nav ref={navRef} className={`relative items-center gap-1 rounded-2xl bg-panel p-1 text-ui font-medium ${className}`}>
      {fill && (
        <span
          aria-hidden="true"
          className={`absolute inset-y-1 left-0 rounded-xl bg-accent ${fill.animate ? "transition-[translate,width] duration-300 ease-out motion-reduce:transition-none" : ""}`}
          style={{ translate: `${fill.left}px 0`, width: fill.width }}
        />
      )}
      {sectionsIn(tabs).map(({ id, href, label, Icon, key }) => {
        const active = href === current;
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
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) setClicked({ href, from: pathname });
            }}
            aria-current={active ? "page" : undefined}
            aria-keyshortcuts={key}
            title={`${label} (${key}) · drag to reorder`}
            className={`relative flex h-10 shrink-0 items-center gap-2 rounded-xl pr-3.5 pl-4 transition-colors duration-200 ${
              active ? "text-accent-ink" : "text-muted hover:bg-raised/70 hover:text-text"
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

export function BottomNav({ order }: { order: Section[] }) {
  const pathname = usePathname();
  const sections = sectionsIn(order);
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const current = tapped?.from === pathname ? tapped.href : sections.find(({ href }) => pathname.startsWith(href))?.href;
  const index = sections.findIndex(({ href }) => href === current);
  return (
    <nav className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-60 rounded-[1.375rem] border border-line bg-panel/90 p-1.5 shadow-2xl shadow-black/50 backdrop-blur md:hidden">
      <div className="relative grid grid-cols-3">
        {index >= 0 && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1/3 transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${index * 100}%)` }}
          >
            <span className="absolute inset-0 rounded-2xl bg-ink" />
            <span className="absolute bottom-0 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-t-full bg-accent" />
          </span>
        )}
        {sections.map(({ href, label, Icon }) => {
          const active = href === current;
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              onClick={() => setTapped({ href, from: pathname })}
              className={`relative grid h-11 place-items-center transition-colors duration-300 ${active ? "text-text" : "text-muted"}`}
            >
              <Icon className="size-5" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SectionTitle({ order, className = "" }: { order: Section[]; className?: string }) {
  const pathname = usePathname();
  const sections = sectionsIn(order);
  const index = sections.findIndex(({ href }) => pathname.startsWith(href));
  const title = pathname.startsWith("/connect")
    ? "Connect"
    : pathname.startsWith("/deleted")
      ? "Recently deleted"
      : pathname === "/share"
        ? "Save shared"
        : sections[index]?.label;
  const [last, setLast] = useState({ title, index, from: 0, changed: false });
  if (last.title !== title) {
    setLast({ title, index, from: index >= 0 && last.index >= 0 ? Math.sign(index - last.index) : 0, changed: true });
  }
  if (!title) return null;
  return (
    <p
      key={title}
      className={`text-body font-semibold text-text ${last.changed ? "section-title-in" : ""} ${className}`}
      style={{ "--from": `${last.from * 12}px` } as React.CSSProperties}
    >
      {title}
    </p>
  );
}
