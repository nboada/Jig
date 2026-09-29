"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="space-y-3 border-t border-line pt-6">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="engraved mb-2 block">Password</span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          className="h-10 w-full rounded-lg border border-line-strong bg-well px-3 text-body outline-none transition focus:border-accent"
        />
      </label>
      {state.error && <p className="text-ui text-danger">{state.error}</p>}
      <button
        disabled={pending}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-body font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        Log in
      </button>
    </form>
  );
}
