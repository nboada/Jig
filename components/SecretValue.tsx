"use client";

import { useState, useTransition } from "react";
import { revealSecret } from "@/app/actions";

const button =
  "shrink-0 rounded-md border border-line px-2.5 py-1 text-xs text-muted transition hover:border-muted hover:text-text disabled:opacity-60";

/** A hidden secret. Its value is fetched from the server only when revealed or copied, and forgotten on leaving. */
export function SecretValue({ slug, fieldId }: { slug: string; fieldId: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function load(): Promise<string> {
    const result = await revealSecret(slug, fieldId);
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
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 break-all font-mono text-sm">{value ?? "••••••••"}</span>
        <button type="button" className={button} disabled={pending} onClick={value === null ? reveal : () => setValue(null)}>
          {value === null ? (pending ? "Revealing" : "Reveal") : "Hide"}
        </button>
        <button type="button" className={button} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
