"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cloneItem, deleteItem } from "@/app/actions";
import { ConfirmDialog, DialogAction } from "@/components/ConfirmButton";
import { useOptionalList } from "@/components/ListContext";
import { AgentIcon, CloneIcon, InfoIcon, LinkIcon, MoreIcon, TrashIcon } from "@/components/NavIcons";
import type { Section } from "@/lib/prefs";
import { agentPrompt } from "@/lib/prompts";

const NOUNS: Record<Section, string> = { snippets: "snippet", notes: "note", credentials: "credential" };

/**
 * The item page's ⋯ menu: the less-used actions, matching the right-click menu in the list.
 * `details` is the server-rendered details panel (slug, dates, agent prompt), shown in a dialog.
 * On an older version (`latest` false) only Details is offered.
 */
export function MoreMenu({
  kind,
  slug,
  title,
  url,
  latest = true,
  versions = 1,
  details,
}: {
  kind: Section;
  slug: string;
  title: string;
  url?: string;
  latest?: boolean;
  versions?: number;
  details: React.ReactNode;
}) {
  const router = useRouter();
  const list = useOptionalList();
  const [showDetails, setShowDetails] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [, startClone] = useTransition();
  const noun = NOUNS[kind];
  const base = `/${kind}`;

  function remove() {
    startDelete(async () => {
      list?.hide(slug);
      await deleteItem(kind, slug);
      setConfirming(false);
      router.push(base);
    });
  }

  function clone() {
    if (kind === "credentials") return;
    startClone(async () => router.push(`${base}/${await cloneItem(kind, slug)}`));
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="More actions"
          title="More"
          className="grid size-[34px] place-items-center rounded-md border border-line text-muted transition hover:border-muted hover:text-text data-[state=open]:border-muted data-[state=open]:text-text"
        >
          <MoreIcon className="size-4" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="menu-content z-40 min-w-52 overflow-hidden rounded-lg border border-line bg-panel p-1 text-sm shadow-xl shadow-black/40"
          >
            {latest && kind !== "credentials" && (
              <Item icon={AgentIcon} onSelect={() => navigator.clipboard.writeText(agentPrompt(kind, slug))}>
                Copy for agent
              </Item>
            )}
            {latest && kind !== "credentials" && (
              <Item icon={CloneIcon} onSelect={clone}>
                Clone
              </Item>
            )}
            {latest && kind === "credentials" && url && (
              <Item icon={LinkIcon} onSelect={() => navigator.clipboard.writeText(url)}>
                Copy URL
              </Item>
            )}
            <Item icon={InfoIcon} onSelect={() => setShowDetails(true)}>
              Details…
            </Item>
            {latest && (
              <>
                <DropdownMenu.Separator className="mx-1 my-1 h-px bg-line" />
                <Item icon={TrashIcon} danger onSelect={() => setConfirming(true)}>
                  {`Delete ${noun}…`}
                </Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={showDetails} onOpenChange={setShowDetails}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
          <Dialog.Content className="modal-content fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-5 rounded-xl border border-line bg-panel p-6 text-sm shadow-2xl shadow-black/50 outline-none">
            <Dialog.Title className="pr-8 font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{`Details of this ${noun}`}</Dialog.Description>
            {details}
            <Dialog.Close
              aria-label="Close"
              className="absolute top-4 right-4 grid size-8 place-items-center rounded-md text-muted hover:bg-raised hover:text-text"
            >
              ×
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${noun}?`}
        message={
          kind === "credentials"
            ? `Delete "${title}"? This cannot be undone.`
            : `Delete "${title}" and all ${versions} version${versions === 1 ? "" : "s"}? This cannot be undone.`
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
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 outline-none data-[highlighted]:bg-raised ${
        danger ? "text-danger" : "text-text/85 data-[highlighted]:text-text"
      }`}
    >
      <Icon className={`size-4 ${danger ? "" : "text-muted"}`} />
      {children}
    </DropdownMenu.Item>
  );
}
