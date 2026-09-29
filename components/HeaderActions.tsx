"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { logout } from "@/app/actions";
import { ConfirmDialog, DialogAction } from "@/components/ConfirmButton";
import { menuContentClass, menuItemClass } from "@/components/ItemActions";
import { Kbd } from "@/components/Kbd";
import { Modal } from "@/components/Modal";
import { ConnectIcon, FingerprintIcon, KeyboardIcon, LogoutIcon, MoreIcon, SearchIcon } from "@/components/NavIcons";
import { PasskeysDialog } from "@/components/Passkeys";

const round = "grid size-9 shrink-0 place-items-center rounded-full text-text-2 transition hover:bg-raised hover:text-text";

/**
 * The right side of the header: search everything (⌘K), Connect, and a ⋯ menu with the
 * keyboard shortcuts (also ?) and Log out, which is used rarely enough to live in a menu.
 */
export function HeaderActions() {
  const [searching, setSearching] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [passkeys, setPasskeys] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [loggingOut, startLogout] = useTransition();
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching(true);
      } else if (event.key === "?" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        // ? is Shift+/ on most layouts, so isPlainKey (which rejects Shift) can't be used here.
        const target = event.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
        event.preventDefault();
        setShortcuts(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setSearching(true)}
        className="hidden h-9 w-60 items-center gap-2 rounded-full border border-line bg-well pr-2 pl-3 text-ui text-faint transition hover:border-line-strong hover:text-muted lg:flex"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Search everything</span>
        <Kbd>⌘K</Kbd>
      </button>
      <button type="button" onClick={() => setSearching(true)} aria-label="Search everything" title="Search (⌘K)" className={`${round} lg:hidden`}>
        <SearchIcon className="size-4" />
      </button>
      <Link
        href="/connect"
        aria-label="Connect an agent"
        title="Connect an agent"
        aria-current={pathname.startsWith("/connect") ? "page" : undefined}
        className={`${round} hidden md:grid aria-[current=page]:bg-accent aria-[current=page]:text-accent-ink`}
      >
        <ConnectIcon className="size-4" />
      </Link>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label="Account" title="More" className={`${round} data-[state=open]:bg-raised data-[state=open]:text-text`}>
          <MoreIcon className="size-4" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={10} className={menuContentClass}>
            <DropdownMenu.Item asChild className={menuItemClass()}>
              <Link href="/connect">
                <ConnectIcon className="size-4 text-muted" />
                Connect an agent
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => setShortcuts(true)} className={menuItemClass()}>
              <KeyboardIcon className="size-4 text-muted" />
              <span className="flex-1">Keyboard shortcuts</span>
              <Kbd>?</Kbd>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => setPasskeys(true)} className={menuItemClass()}>
              <FingerprintIcon className="size-4 text-muted" />
              Passkeys…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="mx-1 my-1 h-px bg-line" />
            <DropdownMenu.Item onSelect={() => setLeaving(true)} className={menuItemClass()}>
              <LogoutIcon className="size-4 text-muted" />
              Log out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <SearchDialog open={searching} onOpenChange={setSearching} />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      <PasskeysDialog open={passkeys} onOpenChange={setPasskeys} />
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Log out?"
        message="You'll need your password to get back in."
        action={<DialogAction label="Log out" pending={loggingOut} onClick={() => startLogout(() => logout())} />}
      />
    </div>
  );
}

/** Search across snippets, notes and credentials: sends the words to the home page's search. */
function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Search everything">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const q = input.current?.value.trim() ?? "";
          onOpenChange(false);
          router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
        }}
      >
        <label className="flex h-10 items-center gap-2.5 rounded-lg border border-line-strong bg-well px-3 text-muted">
          <SearchIcon className="size-4" />
          <input
            ref={input}
            autoFocus
            name="q"
            aria-label="Search snippets, notes and credentials"
            placeholder="Snippets, notes and credentials, code included"
            className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-faint"
          />
          <Kbd>↩</Kbd>
        </label>
      </form>
    </Modal>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["1", "2", "3"], "Sections, in the header's order"],
  [["N"], "New item in this section"],
  [["E"], "Edit the item that's open"],
  [["G"], "Grid layout"],
  [["L"], "List layout"],
  [["↑", "↓"], "Move through the list"],
  [["⌘", "K"], "Search everything"],
  [["⌘", "S"], "Save, on new and edit pages"],
  [["Esc"], "Cancel, on new and edit pages"],
  [["?"], "This list"],
];

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="They're ignored while you type, and on new and edit pages, so they can't throw away unsaved work."
    >
      <dl className="divide-y divide-line">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2 text-ui">
            <dt className="text-text-2">{label}</dt>
            <dd className="flex gap-1">
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

