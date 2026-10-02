"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { button } from "@/components/Button";
import { markReturn } from "@/components/EnterOnReturn";
import { Kbd } from "@/components/Kbd";

export type FormHeader = { eyebrow: string; description?: string };

export type TitleField = { value: string; onChange: (value: string) => void; placeholder: string; autoFocus?: boolean };


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
            className="w-full truncate rounded-lg border border-transparent bg-transparent px-3 py-1.5 text-xl font-semibold sm:text-title text-text outline-none transition placeholder:text-faint hover:border-line focus:border-line-strong focus:bg-well"
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
