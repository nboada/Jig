"use client";

import { useActionState } from "react";
import { unlockShare } from "@/app/share-actions";

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
        className="w-full rounded-md border border-line bg-panel px-3 py-2 font-mono uppercase tracking-widest outline-none focus:border-accent"
      />
      <button
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Checking" : "Unlock"}
      </button>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
