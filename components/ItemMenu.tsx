"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { menuContentClass, menuItemClass, useItemActions } from "@/components/ItemActions";
import type { Section } from "@/lib/prefs";

/**
 * The right-click menu on a list item (a split-view row or a grid card). It offers the same
 * actions as the item page's ⋯ menu, in the same order. Wrap the item's link in it.
 */
export function ItemMenu({
  kind,
  slug,
  title,
  url,
  pinned = false,
  locked = false,
  unlocked = false,
  children,
}: {
  kind: Section;
  slug: string;
  title: string;
  /** A credential's URL, offered as "Copy URL". */
  url?: string;
  pinned?: boolean;
  /** A locked note: no clone or share. Its lock is changed from the note's own page. */
  locked?: boolean;
  /** Locked notes are open right now: a locked note offers "Lock again now". */
  unlocked?: boolean;
  children: React.ReactNode;
}) {
  const { actions, danger, dialogs } = useItemActions({ kind, slug, title, url, pinned, locked, unlocked });
  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className={menuContentClass}>
            {actions.map(({ key, label, icon: Icon, onSelect }) => (
              <ContextMenu.Item key={key} onSelect={onSelect} className={menuItemClass()}>
                <Icon className="size-4 text-muted" />
                {label}
              </ContextMenu.Item>
            ))}
            {danger.length > 0 && <ContextMenu.Separator className="mx-1 my-1 h-px bg-line" />}
            {danger.map(({ key, label, icon: Icon, onSelect }) => (
              <ContextMenu.Item key={key} onSelect={onSelect} className={menuItemClass(true)}>
                <Icon className="size-4" />
                {label}
              </ContextMenu.Item>
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {dialogs}
    </>
  );
}
