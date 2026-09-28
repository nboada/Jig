"use client";

import Link from "next/link";

/** The header's New button: a <details> menu that closes itself when an item is picked. */
export function NewMenu({ items }: { items: { href: string; label: string }[] }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none whitespace-nowrap rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:brightness-110 [&::-webkit-details-marker]:hidden">
        New
      </summary>
      <div
        className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-md border border-line bg-panel py-1 text-sm shadow-lg"
        onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
      >
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="block px-3 py-2 hover:bg-raised">
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
