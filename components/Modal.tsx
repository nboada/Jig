"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CloseIcon } from "@/components/NavIcons";

export const overlayClass = "modal-overlay fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]";
export const panelClass =
  "modal-content fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line-strong bg-overlay p-6 shadow-2xl shadow-black/50 outline-none";

const WIDTHS = { sm: "w-[min(26rem,calc(100vw-2rem))]", md: "w-[min(36rem,calc(100vw-2rem))]" };

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "sm",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof WIDTHS;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={`${panelClass} ${WIDTHS[size]}`}>
          <Dialog.Title className="truncate pr-9 text-[17px] leading-6 font-semibold">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1.5 text-body text-text-2">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</Dialog.Description>
          )}
          <div className="mt-5">{children}</div>
          <Dialog.Close
            aria-label="Close"
            className="absolute top-5 right-5 grid size-7 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-text"
          >
            <CloseIcon className="size-4" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
