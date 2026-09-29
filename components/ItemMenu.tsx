"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cloneItem, deleteItem, setPinned } from "@/app/actions";
import { ConfirmDialog, DialogAction } from "@/components/ConfirmButton";
import { useOptionalList } from "@/components/ListContext";
import { AgentIcon, CloneIcon, ExternalIcon, LinkIcon, PinIcon, PinOffIcon, ShareIcon, TrashIcon } from "@/components/NavIcons";
import { ShareDialog } from "@/components/ShareDialog";
import type { Section } from "@/lib/prefs";
import { agentPrompt } from "@/lib/prompts";

const NOUNS: Record<Section, string> = { snippets: "snippet", notes: "note", credentials: "credential" };

/**
 * The right-click menu on a list item (a split-view row or a grid card): pin, clone, copy the
 * agent prompt, share, open in a new tab, copy a credential's URL, and delete. Wrap the item's link in it.
 */
export function ItemMenu({
  kind,
  slug,
  title,
  url,
  pinned = false,
  children,
}: {
  kind: Section;
  slug: string;
  title: string;
  /** A credential's URL, offered as "Copy URL". */
  url?: string;
  pinned?: boolean;
  children: React.ReactNode;
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

  function clone() {
    if (kind === "credentials") return;
    startAction(async () => {
      const copy = await cloneItem(kind, slug);
      router.push(`${base}/${copy}`);
    });
  }

  function togglePin() {
    if (kind === "credentials") return;
    // Moves in the list at once; the action's revalidation refreshes everything else.
    list?.pin(slug, !pinned);
    startAction(() => setPinned(kind, slug, !pinned));
  }

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="menu-content z-50 min-w-52 overflow-hidden rounded-lg border border-line bg-panel p-1 text-sm shadow-xl shadow-black/40">
            {kind !== "credentials" && (
              <Item icon={pinned ? PinOffIcon : PinIcon} onSelect={togglePin}>
                {pinned ? "Unpin" : "Pin to top"}
              </Item>
            )}
            {kind !== "credentials" && (
              <Item icon={CloneIcon} onSelect={clone}>
                Clone
              </Item>
            )}
            {kind !== "credentials" && (
              <Item icon={AgentIcon} onSelect={() => navigator.clipboard.writeText(agentPrompt(kind, slug))}>
                Copy for agent
              </Item>
            )}
            {kind === "credentials" && url && (
              <Item icon={LinkIcon} onSelect={() => navigator.clipboard.writeText(url)}>
                Copy URL
              </Item>
            )}
            <Item icon={ShareIcon} onSelect={() => setSharing(true)}>
              Share…
            </Item>
            <Item icon={ExternalIcon} onSelect={() => window.open(`${base}/${slug}`, "_blank", "noopener")}>
              Open in new tab
            </Item>
            <ContextMenu.Separator className="mx-1 my-1 h-px bg-line" />
            <Item icon={TrashIcon} danger onSelect={() => setConfirming(true)}>
              {`Delete ${noun}…`}
            </Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <ShareDialog kind={kind} slug={slug} title={title} open={sharing} onOpenChange={setSharing} />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${noun}?`}
        message={
          kind === "credentials"
            ? `Delete "${title}"? This cannot be undone.`
            : `Delete "${title}" and all its versions? This cannot be undone.`
        }
        action={<DialogAction label={`Delete ${noun}`} tone="danger" pending={deleting} onClick={remove} />}
      />
    </>
  );
}

function Item({
  icon: Icon,
  onSelect,
  danger = false,
  children,
}: {
  icon: (props: { className?: string }) => React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={`flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 outline-none data-[highlighted]:bg-raised ${
        danger ? "text-danger" : "text-text/85 data-[highlighted]:text-text"
      }`}
    >
      <Icon className={`size-4 ${danger ? "" : "text-muted"}`} />
      {children}
    </ContextMenu.Item>
  );
}
