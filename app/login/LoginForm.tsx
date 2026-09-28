"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1.5 block text-sm text-muted">Password</span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-md bg-accent px-3 py-2 font-medium text-accent-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Checking" : "Log in"}
      </button>
    </form>
  );
}
