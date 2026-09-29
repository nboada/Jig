"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cloneItem, deleteItem, relockNotes, setNoteLock, setPinned } from "@/app/actions";
import { ConfirmDialog, DialogAction } from "@/components/ConfirmButton";
import { useOptionalList } from "@/components/ListContext";
import { AgentIcon, CloneIcon, ExternalIcon, InfoIcon, LinkIcon, LockIcon, PinIcon, PinOffIcon, ShareIcon, TrashIcon, UnlockIcon } from "@/components/NavIcons";
import { ShareDialog } from "@/components/ShareDialog";
import { toast } from "@/components/Toaster";
import type { Section } from "@/lib/prefs";
import { agentPrompt } from "@/lib/prompts";

export const NOUNS: Record<Section, string> = { snippets: "snippet", notes: "note", credentials: "credential" };

const capitalise = (word: string) => word[0].toUpperCase() + word.slice(1);

function copy(text: string, done: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(done),
    () => toast.error("Couldn't copy. Try again."),
  );
}

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
  locked = false,
  unlocked = false,
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
  /** A locked note: no clone, share or copy for agent, and its lock can be removed. */
  locked?: boolean;
  /** Locked notes are open right now, so a locked one can be locked again at once. */
  unlocked?: boolean;
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
  const [locking, setLocking] = useState<"lock" | "unlock" | null>(null);
  const [lockError, setLockError] = useState("");
  const [changingLock, startLock] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [, startAction] = useTransition();
  const base = `/${kind}`;
  const noun = NOUNS[kind];
  const versioned = kind !== "credentials";

  function remove() {
    // Out of the list at once, and off the item's own page straight away if that's where we are;
    // the server catches up behind it. If it can't, the item comes back and the menu says why.
    list?.hide(slug);
    setConfirming(false);
    const leaving = pathname.startsWith(`${base}/${slug}`);
    if (leaving) router.push(base);
    startDelete(async () => {
      const result = await deleteItem(kind, slug);
      if (!result.error) return void toast.success(`${capitalise(noun)} deleted`);
      list?.unhide(slug);
      if (leaving) router.push(`${base}/${slug}`);
      toast.error(result.error);
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
        startAction(async () => {
          const result = await setPinned(kind, slug, !pinned);
          if (result.error) {
            list?.pin(slug, pinned);
            toast.error(result.error);
          } else toast.success(pinned ? "Unpinned" : "Pinned to top");
        });
      },
    });
    if (!locked) {
      actions.push({
        key: "clone",
        label: "Clone",
        icon: CloneIcon,
        onSelect: () =>
          startAction(async () => {
            const result = await cloneItem(kind, slug);
            if (result.slug) {
              router.push(`${base}/${result.slug}`);
              toast.success(`${capitalise(noun)} cloned`);
            } else toast.error(result.error ?? "Could not make the copy. Try again.");
          }),
      });
    }
    // Agents can't see a locked note, so there's nothing to hand them.
    if (!locked) {
      actions.push({ key: "agent", label: "Copy for agent", icon: AgentIcon, onSelect: () => copy(agentPrompt(kind, slug), "Copied for your agent") });
    }
  }
  if (latest && !versioned && url) {
    actions.push({ key: "url", label: "Copy URL", icon: LinkIcon, onSelect: () => copy(url, "URL copied") });
  }
  if (latest && !locked) actions.push({ key: "share", label: "Share…", icon: ShareIcon, onSelect: () => setSharing(true) });
  if (latest && kind === "notes") {
    // Locking also has a button beside the pin; the right-click menu in the list needs it here.
    if (!locked) actions.push({ key: "lock", label: "Lock note…", icon: LockIcon, onSelect: () => setLocking("lock") });
    // Open right now: shut it (and every other locked note) again before the 30 minutes are up.
    if (locked && unlocked) {
      actions.push({
        key: "relock",
        label: "Lock again now",
        icon: LockIcon,
        onSelect: () =>
          startAction(async () => {
            await relockNotes();
            router.refresh();
            toast.success("Locked again");
          }),
      });
    }
    // Offered even where the list can't tell whether the notes are unlocked; the server refuses
    // (and the dialog says why) until they are.
    if (locked) actions.push({ key: "unlock", label: "Remove lock…", icon: UnlockIcon, onSelect: () => setLocking("unlock") });
  }
  if (newTab) actions.push({ key: "tab", label: "Open in new tab", icon: ExternalIcon, onSelect: () => window.open(`${base}/${slug}`, "_blank", "noopener") });
  if (onDetails) actions.push({ key: "details", label: "Details…", icon: InfoIcon, onSelect: onDetails });
  const danger: ItemAction[] = latest
    ? [{ key: "delete", label: `Delete ${noun}…`, icon: TrashIcon, danger: true, onSelect: () => setConfirming(true) }]
    : [];

  function changeLock() {
    const locked = locking === "lock";
    startLock(async () => {
      setLockError("");
      // The list shows the padlock (or drops it) at once; it goes back if the server says no.
      list?.lock(slug, locked);
      const result = await setNoteLock(slug, locked);
      if (result.error) {
        list?.lock(slug, !locked);
        setLockError(result.error);
      } else {
        setLocking(null);
        router.refresh();
        toast.success(locked ? "Note locked" : "Lock removed");
      }
    });
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={locking !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLocking(null);
            setLockError("");
          }
        }}
        title={locking === "lock" ? "Lock this note?" : "Remove the lock?"}
        message={
          lockError ||
          (locking === "lock"
            ? `The text of "${title}" and every earlier version is encrypted. Agents can no longer find or read it, it can't be shared, and you unlock it with Touch ID or your password.`
            : `"${title}" and its history go back to plain text, and agents can find and read it again.`)
        }
        action={
          <DialogAction label={locking === "lock" ? "Lock note" : "Remove lock"} pending={changingLock} onClick={changeLock} />
        }
      />
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
