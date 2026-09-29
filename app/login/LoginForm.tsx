"use client";

import { useActionState, useState } from "react";
import { login } from "@/app/actions";
import { EyeIcon, EyeOffIcon } from "@/components/NavIcons";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, {});
  const [visible, setVisible] = useState(false);
  return (
    <form action={action} className="space-y-3 border-t border-line pt-6">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="engraved mb-2 block">Password</span>
        <span className="relative block">
          <input
            type={visible ? "text" : "password"}
            name="password"
            required
            autoFocus
            autoComplete="current-password"
            className="h-10 w-full rounded-lg border border-line-strong bg-well pr-10 pl-3 text-body outline-none transition focus:border-accent"
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Hide password" : "Show password"}
            title={visible ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted transition hover:text-text"
          >
            {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </span>
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
