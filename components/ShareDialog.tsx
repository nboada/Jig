"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState, useTransition } from "react";
import { createShareLink, listItemShares, revokeShareLink } from "@/app/actions";
import { CopyButton } from "@/components/CopyButton";
import { ShareIcon } from "@/components/NavIcons";
import { formatDateShort, timeAgo } from "@/lib/format";
import type { Expiry, Share, ShareKind } from "@/lib/shares";

const EXPIRY_OPTIONS: { value: Expiry; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "never", label: "Never" },
];
const VIEW_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "No limit" },
  { value: 1, label: "1" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
];

/**
 * Makes and manages share links for one item. A new link (and a credential's passcode) shows
 * once; after that the item's links are listed with their state and can be turned off.
 */
export function ShareDialog({
  kind,
  slug,
  title,
  open,
  onOpenChange,
}: {
  kind: ShareKind;
  slug: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const strict = kind === "credentials";
  // Credentials default to the strictest settings; everything else to no expiry and no view limit.
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState<Expiry>(strict ? "24h" : "never");
  const [maxViews, setMaxViews] = useState<number | null>(strict ? 1 : null);
  const [created, setCreated] = useState<{ url: string; passcode?: string } | null>(null);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<Share[] | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => listItemShares(kind, slug).then(setLinks);
  useEffect(() => {
    if (open) refresh();
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function create() {
    setError("");
    startTransition(async () => {
      const result = await createShareLink(kind, slug, { expiry, maxViews, label });
      if ("error" in result) return setError(result.error);
      setCreated({ url: `${window.location.origin}/s/${result.token}`, passcode: result.passcode });
      setLabel("");
      await refresh();
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      await revokeShareLink(id);
      await refresh();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setCreated(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="modal-content fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-panel p-7 shadow-2xl shadow-black/50 outline-none">
          <Dialog.Title className="flex items-center gap-2.5 pr-8 text-lg font-semibold">
            <ShareIcon className="size-4 text-accent" />
            <span className="truncate">{`Share “${title}”`}</span>
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
            {strict
              ? "Anyone with the link and its passcode can see this credential, secrets included. Send the passcode separately."
              : "Anyone with the link can see it, read-only, until it expires or you turn it off."}
          </Dialog.Description>

          {created ? (
            <div className="mt-7 space-y-4 rounded-lg border border-accent/40 bg-accent/5 p-5">
              <p className="text-sm font-medium">Copy it now: it's shown only once.</p>
              <Copyable label="Link" value={created.url} />
              {created.passcode && <Copyable label="Passcode" value={created.passcode} />}
              <button type="button" onClick={() => setCreated(null)} className="text-xs text-muted hover:text-text">
                Make another link
              </button>
            </div>
          ) : (
            <div className="mt-7 space-y-6">
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-muted">Who's it for? (optional, just for you)</span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Sam at Acme"
                  className="w-full rounded-md border border-line bg-ink px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </label>
              <Choice label="Expires after" options={EXPIRY_OPTIONS} value={expiry} onChange={setExpiry} />
              <Choice label="Can be opened" options={VIEW_OPTIONS} value={maxViews} onChange={setMaxViews} suffix="times" />
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                type="button"
                disabled={pending}
                onClick={create}
                className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-60"
              >
                {pending ? "Making link" : "Create link"}
              </button>
            </div>
          )}

          <section className="mt-8 border-t border-line pt-6">
            <h3 className="mb-3 text-xs font-medium text-muted">Links</h3>
            {links === null ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : links.length === 0 ? (
              <p className="text-sm text-muted">No links yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {links.map((link) => (
                  <li key={link.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{link.label || "Link"}</p>
                      <p className="mt-0.5 text-xs text-muted" suppressHydrationWarning>
                        {describe(link)}
                      </p>
                    </div>
                    {state(link) === "Active" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => revoke(link.id)}
                        className="shrink-0 rounded-md border border-danger/40 px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-60"
                      >
                        Turn off
                      </button>
                    ) : (
                      <span className="shrink-0 rounded bg-raised px-2 py-0.5 text-xs text-muted">{state(link)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Dialog.Close className="absolute top-5 right-5 grid size-8 place-items-center rounded-md text-muted hover:bg-raised hover:text-text" aria-label="Close">
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function state(link: Share): string {
  if (link.revoked) return "Turned off";
  if (link.failedAttempts >= 5) return "Locked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return "Expired";
  if (link.maxViews != null && link.views >= link.maxViews) return "Used";
  return "Active";
}

function describe(link: Share): string {
  const views = link.maxViews == null ? `${link.views} ${link.views === 1 ? "view" : "views"}` : `${link.views}/${link.maxViews} views`;
  const expiry = link.expiresAt ? `expires ${formatDateShort(link.expiresAt)}` : "no expiry";
  return `Made ${timeAgo(link.createdAt)} · ${expiry} · ${views}${link.protected ? " · passcode" : ""}`;
}

function Choice<T>({
  label,
  options,
  value,
  onChange,
  suffix,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  suffix?: string;
}) {
  return (
    <div>
      <span className="mb-2 block text-xs font-medium text-muted">{suffix ? `${label} (${suffix})` : label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              option.value === value ? "bg-accent text-accent-ink" : "bg-ink text-text/85 hover:bg-raised"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono text-xs outline-none" />
        <CopyButton value={value} />
      </div>
    </div>
  );
}
