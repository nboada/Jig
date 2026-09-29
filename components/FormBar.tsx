"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { button } from "@/components/Button";
import { markReturn } from "@/components/EnterOnReturn";
import { Kbd } from "@/components/Kbd";

/** What the page puts at the top of its form. */
export type FormHeader = { eyebrow: string; description?: string };

/** The title, edited where it's shown: the page heading is the field. */
export type TitleField = { value: string; onChange: (value: string) => void; placeholder: string; autoFocus?: boolean };

/**
 * The top of a new or edit form, laid out like the item page's header: a small line where the item
 * page has its badges, then the title with Cancel and Save on the right, exactly where Edit was.
 * The title is typed straight into the heading, so there's no second Title field below. Cancel goes
 * back, so there's no separate back link. Rendered inside the form, so Save submits it; ⌘S does too.
 * Esc cancels; with unsaved changes it asks for a second Esc first.
 */

export function FormBar({
  eyebrow,
  title,
  description,
  cancelHref,
  pending,
  label,
}: FormHeader & {
  title: TitleField;
  cancelHref: string;
  pending: boolean;
  label: string;
}) {
  const router = useRouter();
  const submit = useRef<HTMLButtonElement>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    // Every form sends its fields as one JSON "payload"; comparing it with how it started tells
    // whether anything was changed.
    const payload = () => (submit.current?.form?.elements.namedItem("payload") as HTMLInputElement | null)?.value ?? "";
    const initial = payload();
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!submit.current?.disabled) submit.current?.form?.requestSubmit();
        return;
      }
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // An open menu, picker or dialog takes Esc for itself.
      if (document.querySelector('[role="dialog"], [role="listbox"], [role="menu"], .cm-tooltip-autocomplete')) return;
      if (payload() === initial || armed) {
        markReturn();
        router.push(cancelHref);
        return;
      }
      armed = true;
      setConfirmLeave(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        armed = false;
        setConfirmLeave(false);
      }, 2500);
    }
    // Saving from either Save button (or ⌘S) returns to the item page, which slides in.
    const form = submit.current?.form;
    form?.addEventListener("submit", markReturn);
    window.addEventListener("keydown", onKey);
    return () => {
      form?.removeEventListener("submit", markReturn);
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [router, cancelHref]);

  return (
    <header className="space-y-2">
      <p className="engraved flex h-5 items-center">{eyebrow}</p>
      <div className="flex items-center justify-between gap-4">
        <h1 className="min-w-0 flex-1">
          <input
            aria-label="Title"
            required
            maxLength={120}
            value={title.value}
            onChange={(e) => title.onChange(e.target.value)}
            placeholder={title.placeholder}
            autoFocus={title.autoFocus}
            className="-my-[7px] -ml-[13px] w-[calc(100%+13px)] truncate rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-title font-semibold text-text outline-none transition placeholder:text-faint hover:border-line focus:border-line-strong focus:bg-well"
          />
        </h1>
        <div className="form-actions flex shrink-0 items-center gap-1.5">
          {confirmLeave && <span className="text-meta text-muted">Esc again to discard changes</span>}
          <Link href={cancelHref} onClick={markReturn} className={button({ variant: "ghost" })} title="Cancel (Esc)">
            Cancel
            <Kbd className="hidden sm:inline">Esc</Kbd>
          </Link>
          <button ref={submit} disabled={pending} className={button({ variant: "primary" })}>
            {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {label}
            <Kbd onAccent className="hidden sm:inline">
              ⌘S
            </Kbd>
          </button>
        </div>
      </div>
      {description && <p className="text-body text-muted">{description}</p>}
    </header>
  );
}
