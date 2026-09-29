"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { revealSecret } from "@/app/actions";
import { iconButton } from "@/components/Button";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, LockIcon } from "@/components/NavIcons";

/**
 * A hidden secret. Its value is fetched from the server only when revealed or copied, and
 * forgotten on leaving. While `locked` (no recent unlock) the buttons wait for the unlock panel.
 */
export function SecretValue({ slug, fieldId, locked = false }: { slug: string; fieldId: string; locked?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function load(): Promise<string> {
    const result = await revealSecret(slug, fieldId);
    // The unlock ran out: redraw, so the page shows the unlock panel again.
    if (result.locked) router.refresh();
    if (result.error !== undefined) throw new Error(result.error);
    return result.value ?? "";
  }

  function reveal() {
    startTransition(async () => {
      try {
        setValue(await load());
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  async function copy() {
    try {
      // Handing the clipboard a promise keeps Safari's user-gesture check happy across the server round trip.
      const text = value !== null ? Promise.resolve(value) : load();
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) }),
      ]);
      setError("");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not copy.");
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        {value === null ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 font-mono text-ui tracking-widest text-faint">
            •••• •••• ••••
            <LockIcon className="size-3.5 tracking-normal" />
          </span>
        ) : (
          <span className="min-w-0 flex-1 font-mono text-ui break-all">{value}</span>
        )}
        <button
          type="button"
          disabled={pending || locked}
          onClick={value === null ? reveal : () => setValue(null)}
          aria-label={value === null ? "Reveal" : "Hide"}
          title={value === null ? "Reveal" : "Hide"}
          className={iconButton({ className: `disabled:pointer-events-none disabled:opacity-40 ${pending ? "animate-pulse" : ""}` })}
        >
          {value === null ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy"}
          title="Copy"
          className={iconButton({ className: `disabled:pointer-events-none disabled:opacity-40 ${copied ? "text-accent" : ""}` })}
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        </button>
      </div>
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  );
}
