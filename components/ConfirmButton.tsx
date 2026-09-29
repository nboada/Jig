"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useOptionalList } from "@/components/ListContext";

type Tone = "default" | "danger";

/**
 * The app's confirmation modal, controlled by whoever opens it. `action` is the confirm button,
 * usually a DialogAction.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  action,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  action: React.ReactNode;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="modal-overlay fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
        <AlertDialog.Content className="modal-content fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-panel p-5 shadow-2xl shadow-black/50 outline-none">
          <AlertDialog.Title className="font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-6 text-text/75">{message}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">
              Cancel
            </AlertDialog.Cancel>
            {action}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** The confirm button of a ConfirmDialog. */
export function DialogAction({
  label,
  tone = "default",
  pending = false,
  onClick,
}: {
  label: string;
  tone?: Tone;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
        tone === "danger" ? "bg-danger text-ink hover:brightness-110" : "bg-accent text-accent-ink hover:brightness-110"
      }`}
    >
      {pending ? "Working…" : label}
    </button>
  );
}

/**
 * A button that asks in a modal before sending its form. Put it inside the <form> it submits.
 * `tone="danger"` is for deletes and revokes; the confirm button then reads as destructive.
 */
export function ConfirmButton({
  message,
  children,
  className,
  title,
  confirmLabel,
  tone = "default",
  hides,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  /** The modal's heading; the button's own label when left out. */
  title?: string;
  /** The confirm button's label; the button's own label when left out. */
  confirmLabel?: string;
  tone?: Tone;
  /** A slug to take out of the split view's list the moment this is confirmed (for deletes). */
  hides?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useOptionalList();
  const [open, setOpen] = useState(false);
  const label = typeof children === "string" ? children : "Confirm";

  return (
    <>
      <button ref={trigger} type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title ?? `${label}?`}
        message={message}
        action={
          // The dialog is portaled out of the page but stays inside the form in React's tree.
          <FormAction
            label={confirmLabel ?? label}
            tone={tone}
            onConfirm={() => {
              if (hides) list?.hide(hides);
              trigger.current?.form?.requestSubmit();
            }}
            onDone={() => setOpen(false)}
          />
        }
      />
    </>
  );
}

function FormAction({
  label,
  tone,
  onConfirm,
  onDone,
}: {
  label: string;
  tone: Tone;
  onConfirm: () => void;
  onDone: () => void;
}) {
  // Pending while the form's server action runs. Actions that redirect take the page away;
  // for the rest (a revoke refreshes in place) the dialog closes once the action finishes.
  const { pending } = useFormStatus();
  const [wasPending, setWasPending] = useState(false);
  useEffect(() => {
    if (pending) setWasPending(true);
    else if (wasPending) onDone();
  }, [pending, wasPending, onDone]);
  return <DialogAction label={label} tone={tone} pending={pending} onClick={onConfirm} />;
}
