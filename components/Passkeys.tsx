"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  addPasskey,
  deletePasskey,
  loginWithPasskey,
  myPasskeys,
  passkeyPromptOptions,
  passkeySetupOptions,
  unlockWithPasskey,
  unlockWithPassword,
} from "@/app/actions";
import { button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { FingerprintIcon, LockIcon, TrashIcon } from "@/components/NavIcons";
import { formatDateShort } from "@/lib/format";
import type { Passkey } from "@/lib/passkeys";

/** Whether this browser can use passkeys. False on the server and in old browsers. */
function useWebAuthn() {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  return supported;
}

/** Asks the device for its Jig passkey (the Touch ID prompt). Null if the person cancelled. */
async function promptPasskey() {
  const optionsJSON = await passkeyPromptOptions();
  try {
    return await startAuthentication({ optionsJSON });
  } catch (error) {
    if (error instanceof Error && error.name === "NotAllowedError") return null;
    throw error;
  }
}

/** "Sign in with passkey" on the login page, under the password form. */
export function PasskeyLogin({ next }: { next: string }) {
  const supported = useWebAuthn();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (!supported) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            try {
              const response = await promptPasskey();
              if (!response) return;
              const result = await loginWithPasskey(response, next);
              if (result?.error) setError(result.error);
            } catch {
              setError("That passkey didn't work. Try again, or use your password.");
            }
          })
        }
        className={button({ size: "lg", className: "w-full" })}
      >
        <FingerprintIcon className="size-4" />
        Sign in with passkey
      </button>
      {error && <p className="text-ui text-danger">{error}</p>}
    </div>
  );
}

/**
 * Stands in for a locked note's text until it's unlocked: Touch ID when there's a passkey, the
 * dashboard password otherwise (or as a fallback). One unlock opens every locked note for 5 minutes.
 */
export function UnlockPanel({ hasPasskey }: { hasPasskey: boolean }) {
  const router = useRouter();
  const supported = useWebAuthn();
  const canUsePasskey = hasPasskey && supported;
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const done = (result: { error?: string }) => {
    if (result.error) setError(result.error);
    else router.refresh();
  };

  return (
    <div className="grid place-items-center gap-4 rounded-xl border border-line bg-well px-5 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-raised text-text-2">
        <LockIcon className="size-5" />
      </span>
      <div>
        <p className="text-body font-medium text-text">This note is locked</p>
        <p className="mt-1 text-ui text-muted">Its text is encrypted and hidden from agents.</p>
      </div>

      {canUsePasskey && !usePassword ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError("");
              try {
                const response = await promptPasskey();
                if (response) done(await unlockWithPasskey(response));
                else setError("No passkey on this device? Add one from ⋯ → Passkeys in the header, or use your password.");
              } catch {
                setError("That passkey didn't work. Try again, or use your password.");
              }
            })
          }
          className={button({ variant: "primary" })}
        >
          <FingerprintIcon className="size-4" />
          Unlock with Touch ID
        </button>
      ) : (
        <form
          className="flex w-full max-w-xs gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError("");
              done(await unlockWithPassword(password));
            });
          }}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Dashboard password"
            aria-label="Dashboard password"
            autoComplete="current-password"
            autoFocus={usePassword}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-ui outline-none focus:border-line-strong"
          />
          <button disabled={pending || !password} className={button({ variant: "primary" })}>
            Unlock
          </button>
        </form>
      )}

      {error && <p className="text-ui text-danger">{error}</p>}
      {canUsePasskey ? (
        <button type="button" onClick={() => setUsePassword(!usePassword)} className="text-meta text-muted hover:text-text">
          {usePassword ? "Use Touch ID instead" : "Use your password instead"}
        </button>
      ) : (
        supported && <p className="text-meta text-muted">Add a passkey from the ⋯ menu in the header to unlock with Touch ID.</p>
      )}
    </div>
  );
}

/** The header menu's "Passkeys…" dialog: the passkeys on this site, and adding one on this device. */
export function PasskeysDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const supported = useWebAuthn();
  const [keys, setKeys] = useState<Passkey[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) myPasskeys().then(setKeys);
  }, [open]);

  function add() {
    start(async () => {
      setError("");
      try {
        const optionsJSON = await passkeySetupOptions();
        const response = await startRegistration({ optionsJSON });
        const result = await addPasskey(response, name || guessDeviceName());
        if (result.error) setError(result.error);
        else {
          setName("");
          setKeys(await myPasskeys());
        }
      } catch (e) {
        if (e instanceof Error && e.name === "NotAllowedError") return;
        if (e instanceof Error && e.name === "InvalidStateError") setError("This device already has a passkey for Jig.");
        else if (e instanceof Error && e.name === "NotSupportedError") {
          setError("This browser can't save a passkey on this device. Try Safari or Chrome.");
        } else setError("The passkey couldn't be added. Try again.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Passkeys"
      description="Sign in and unlock locked notes with Touch ID, Face ID or a security key. A passkey works on the site it was made on."
    >
      <div className="mt-5 space-y-5">
        {keys === null ? (
          <p className="text-ui text-muted">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-ui text-muted">No passkeys yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                <FingerprintIcon className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ui text-text">{k.name}</p>
                  <p className="text-meta text-muted">
                    {`Added ${formatDateShort(k.createdAt)}${k.lastUsedAt ? ` · last used ${formatDateShort(k.lastUsedAt)}` : ""}`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${k.name}`}
                  title="Remove"
                  onClick={() =>
                    start(async () => {
                      await deletePasskey(k.id);
                      setKeys(await myPasskeys());
                    })
                  }
                  className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-danger"
                >
                  <TrashIcon className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {supported ? (
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={guessDeviceName()}
              aria-label="Name for this passkey"
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-well px-3 text-ui outline-none focus:border-line-strong"
            />
            <button type="button" disabled={pending} onClick={add} className={button({ variant: "primary" })}>
              <FingerprintIcon className="size-4" />
              Add passkey
            </button>
          </div>
        ) : (
          <p className="text-ui text-muted">This browser can't use passkeys.</p>
        )}
        {error && <p className="text-ui text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

function guessDeviceName() {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "This device";
}
