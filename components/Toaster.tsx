"use client";

import { Toast } from "@base-ui/react/toast";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { iconButton } from "@/components/Button";
import { CloseIcon } from "@/components/NavIcons";
import { FLASH_COOKIE } from "@/lib/flash";

const manager = Toast.createToastManager();

type ToastOptions = {
  /** A button in the toast, like Undo. The toast closes when it's pressed. */
  action?: { label: string; onClick: () => void };
};

function actionProps(id: () => string, action?: ToastOptions["action"]) {
  if (!action) return undefined;
  return {
    children: action.label,
    onClick: () => {
      manager.close(id());
      action.onClick();
    },
  };
}

function add(title: string, type: "success" | "error", { action }: ToastOptions = {}) {
  let id = "";
  id = manager.add({ title, type, priority: type === "error" ? "high" : "low", actionProps: actionProps(() => id, action) });
  return id;
}

/** Shows a toast from anywhere in client code: `toast.success("Note saved")`. */
export const toast = {
  success: (title: string, options?: ToastOptions) => add(title, "success", options),
  error: (title: string, options?: ToastOptions) => add(title, "error", options),
};

/** A circle with a tick or a cross, as in shadcn's toast. */
function StatusIcon({ type }: { type?: string }) {
  if (type !== "success" && type !== "error") return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`size-4 shrink-0 ${type === "success" ? "text-accent" : "text-danger"}`}
    >
      <circle cx="12" cy="12" r="10" />
      {type === "success" ? <path d="m9 12 2 2 4-4" /> : <path d="m15 9-6 6M9 9l6 6" />}
    </svg>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((item) => (
    <Toast.Root
      key={item.id}
      toast={item}
      className={[
        // shadcn's Base UI toast: the newest in front, older ones peeking behind it, fanning out on hover.
        "group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-2xl border border-line-strong bg-overlay text-text shadow-xl shadow-black/40 will-change-transform outline-none select-none",
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:[transform:translateY(150%)]",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
      ].join(" ")}
    >
      <Toast.Content className="flex h-full items-center gap-3 overflow-hidden py-3 pr-3 pl-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100">
        <StatusIcon type={item.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Toast.Title className="text-ui font-medium" />
          <Toast.Description className="text-ui text-muted" />
        </div>
        <Toast.Action className="h-7 shrink-0 rounded-md border border-line-strong px-2.5 text-ui font-medium text-text transition hover:bg-raised" />
        <Toast.Close aria-label="Close" className={iconButton()}>
          <CloseIcon className="size-4" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

/**
 * Where toasts appear: bottom right on a computer, across the bottom above the tab bar on a
 * phone. It also shows the message a server action left for the page it redirected to (see
 * lib/flash.ts).
 */
export function Toaster() {
  const pathname = usePathname();

  useEffect(() => {
    const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
    if (!cookie) return;
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
    toast.success(decodeURIComponent(cookie.slice(FLASH_COOKIE.length + 1)));
  }, [pathname]);

  return (
    <Toast.Provider toastManager={manager} timeout={4000}>
      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed inset-x-4 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.5rem)] z-50 mx-auto w-auto max-w-sm outline-none md:right-6 md:bottom-6 md:left-auto md:mx-0 md:w-full">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
