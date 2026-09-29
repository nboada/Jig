"use client";

import { useActionState } from "react";
import { unlockShare } from "@/app/share-actions";
import { button } from "@/components/Button";

export function PasscodeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(unlockShare, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input
        name="passcode"
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="ABCD-EFGH"
        aria-label="Passcode"
        className="h-10 w-full rounded-lg border border-line-strong bg-well px-3 font-mono text-body tracking-widest uppercase outline-none transition placeholder:text-faint focus:border-accent"
      />
      <button
        disabled={pending}
        className={button({ variant: "primary", size: "lg", className: "w-full" })}
      >
        {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        Unlock
      </button>
      {state.error && <p className="text-ui text-danger">{state.error}</p>}
    </form>
  );
}
