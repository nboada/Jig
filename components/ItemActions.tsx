"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cloneItem, deleteItem, setPinned } from "@/app/actions";
import { ConfirmDialog, DialogAction } from "@/components/ConfirmButton";
import { useOptionalList } from "@/components/ListContext";
import { AgentIcon, CloneIcon, ExternalIcon, InfoIcon, LinkIcon, PinIcon, PinOffIcon, ShareIcon, TrashIcon } from "@/components/NavIcons";
import { ShareDialog } from "@/components/ShareDialog";
import type { Section } from "@/lib/prefs";
import { agentPrompt } from "@/lib/prompts";

export const NOUNS: Record<Section, string> = { snippets: "snippet", notes: "note", credentials: "credential" };

export type ItemAction = {
  key: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
};

/** The class list for a menu's panel and its items, shared by the right-click and ⋯ menus. */
export const menuContentClass =
  "menu-content z-50 min-w-52 overflow-hidden rounded-lg border border-line-strong bg-overlay p-1 text-ui shadow-xl shadow-black/40";
export const menuItemClass = (danger = false) =>
  `flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 outline-none data-[highlighted]:bg-raised ${
    danger ? "text-danger" : "text-text-2 data-[highlighted]:text-text"
  }`;

/**
 * The actions on one item, in the same order in every menu: Pin, Clone, Copy for agent (or a
 * credential's Copy URL), Share, Open in new tab, Details, then Delete on its own. `dialogs` holds
 * the share and delete dialogs these open; render it next to the menu.
 */
export function useItemActions({
  kind,
  slug,
  title,
  url,
  pinned = false,
  latest = true,
  versions,
  newTab = true,
  onDetails,
}: {
  kind: Section;
  slug: string;
  title: string;
  url?: string;
  pinned?: boolean;
  /** False on an older version: only Details is offered. */
  latest?: boolean;
  /** How many versions a delete removes, for its warning. */
  versions?: number;
  /** Offer "Open in new tab" (pointless on the item's own page). */
  newTab?: boolean;
  /** Offer "Details…", which calls this. */
  onDetails?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const list = useOptionalList();
  const [confirming, setConfirming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [, startAction] = useTransition();
  const base = `/${kind}`;
  const noun = NOUNS[kind];
  const versioned = kind !== "credentials";

  function remove() {
    startDelete(async () => {
      // Out of the list at once; the server catches up behind it.
      list?.hide(slug);
      await deleteItem(kind, slug);
      setConfirming(false);
      // Deleting the item that is open leaves nothing to show; go back to the list.
      if (pathname.startsWith(`${base}/${slug}`)) router.push(base);
    });
  }

  const actions: ItemAction[] = [];
  if (latest && versioned) {
    actions.push({
      key: "pin",
      label: pinned ? "Unpin" : "Pin to top",
      icon: pinned ? PinOffIcon : PinIcon,
      // Moves in the list at once; the action's revalidation refreshes everything else.
      onSelect: () => {
        list?.pin(slug, !pinned);
        startAction(() => setPinned(kind, slug, !pinned));
      },
    });
    actions.push({
      key: "clone",
      label: "Clone",
      icon: CloneIcon,
      onSelect: () => startAction(async () => router.push(`${base}/${await cloneItem(kind, slug)}`)),
    });
    actions.push({ key: "agent", label: "Copy for agent", icon: AgentIcon, onSelect: () => navigator.clipboard.writeText(agentPrompt(kind, slug)) });
  }
  if (latest && !versioned && url) {
    actions.push({ key: "url", label: "Copy URL", icon: LinkIcon, onSelect: () => navigator.clipboard.writeText(url) });
  }
  if (latest) actions.push({ key: "share", label: "Share…", icon: ShareIcon, onSelect: () => setSharing(true) });
  if (newTab) actions.push({ key: "tab", label: "Open in new tab", icon: ExternalIcon, onSelect: () => window.open(`${base}/${slug}`, "_blank", "noopener") });
  if (onDetails) actions.push({ key: "details", label: "Details…", icon: InfoIcon, onSelect: onDetails });
  const danger: ItemAction[] = latest
    ? [{ key: "delete", label: `Delete ${noun}…`, icon: TrashIcon, danger: true, onSelect: () => setConfirming(true) }]
    : [];

  const dialogs = (
    <>
      <ShareDialog kind={kind} slug={slug} title={title} open={sharing} onOpenChange={setSharing} />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${noun}?`}
        message={
          !versioned
            ? `Delete "${title}"? This cannot be undone.`
            : versions
              ? `Delete "${title}" and all ${versions} version${versions === 1 ? "" : "s"}? This cannot be undone.`
              : `Delete "${title}" and all its versions? This cannot be undone.`
        }
        action={<DialogAction label={`Delete ${noun}`} tone="danger" pending={deleting} onClick={remove} />}
      />
    </>
  );

  return { actions, danger, dialogs, share: () => setSharing(true) };
}
