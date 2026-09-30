"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { button } from "@/components/Button";
import { useOptionalList } from "@/components/ListContext";
import { overlayClass, panelClass } from "@/components/Modal";

type Tone = "default" | "danger";

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
        <AlertDialog.Overlay className={overlayClass} />
        <AlertDialog.Content className={`${panelClass} w-[min(26rem,calc(100vw-2rem))]`}>
          <AlertDialog.Title className="text-[17px] leading-6 font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-body text-text-2">{message}</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel className={button({ variant: "ghost" })}>
              Cancel
            </AlertDialog.Cancel>
            {action}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

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
      className={button({ variant: tone === "danger" ? "danger" : "primary" })}
    >
      {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {label}
    </button>
  );
}

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
  title?: string;
  confirmLabel?: string;
  tone?: Tone;
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
  const { pending } = useFormStatus();
  const [wasPending, setWasPending] = useState(false);
  useEffect(() => {
    if (pending) setWasPending(true);
    else if (wasPending) onDone();
  }, [pending, wasPending, onDone]);
  return <DialogAction label={label} tone={tone} pending={pending} onClick={onConfirm} />;
}
