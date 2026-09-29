"use client";

import { useEffect, useState, useTransition } from "react";
import { createShareLink, listItemShares, revokeShareLink } from "@/app/actions";
import { button } from "@/components/Button";
import { CopyButton } from "@/components/CopyButton";
import { Modal } from "@/components/Modal";
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
  { value: 1, label: "1×" },
  { value: 3, label: "3×" },
  { value: 5, label: "5×" },
  { value: 10, label: "10×" },
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
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setCreated(null);
      }}
      size="md"
      title={`Share “${title}”`}
      description={
        strict
          ? "Anyone with the link and its passcode can see this credential, secrets included. Send the passcode separately."
          : "Anyone with the link can see it, read-only, until it expires or you turn it off."
      }
    >
      {created ? (
        <div className="space-y-4 rounded-xl border border-accent-line bg-well p-5">
          <p className="text-ui font-medium">Copy it now: it's shown only once.</p>
          <Copyable label="Link" value={created.url} />
          {created.passcode && <Copyable label="Passcode" value={created.passcode} />}
          <button type="button" onClick={() => setCreated(null)} className={button({ variant: "ghost", size: "sm", className: "-ml-2.5" })}>
            Make another link
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <label className="block">
            <span className="engraved mb-2 block">Who's it for? · just for you</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Sam at Acme"
              className="h-9 w-full rounded-lg border border-line bg-well px-3 text-body outline-none transition placeholder:text-faint focus:border-accent"
            />
          </label>
          <Choice label="Expires after" options={EXPIRY_OPTIONS} value={expiry} onChange={setExpiry} />
          <Choice label="Can be opened" options={VIEW_OPTIONS} value={maxViews} onChange={setMaxViews} />
          {error && <p className="text-ui text-danger">{error}</p>}
          <button type="button" disabled={pending} onClick={create} className={button({ variant: "primary", size: "lg", className: "w-full" })}>
            {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            Create link
          </button>
        </div>
      )}

      <section className="mt-7 border-t border-line pt-5">
        <h3 className="engraved mb-2.5">{links && links.length > 0 ? `Links · ${links.length}` : "Links"}</h3>
        {links === null ? (
          <p className="text-ui text-muted">Loading…</p>
        ) : links.length === 0 ? (
          <p className="text-ui text-muted">No links yet.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {links.map((link) => {
              const status = state(link);
              return (
                <li key={link.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-body font-medium ${status === "Active" ? "" : "text-text-2"}`}>{link.label || "Link"}</p>
                    <p className="mt-0.5 font-mono text-meta text-muted" suppressHydrationWarning>
                      {describe(link)}
                    </p>
                  </div>
                  <span className={`engraved shrink-0 ${status === "Active" ? "text-accent" : "text-faint"}`}>{status}</span>
                  {status === "Active" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => revoke(link.id)}
                      className={button({ variant: "ghost", size: "sm", className: "text-danger hover:bg-danger/10 hover:text-danger" })}
                    >
                      Turn off
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Modal>
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
  return `made ${timeAgo(link.createdAt)} · ${expiry} · ${views}${link.protected ? " · passcode" : ""}`;
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
      <span className="engraved mb-2 block">{suffix ? `${label} · ${suffix}` : label}</span>
      <div className="flex gap-0.5 rounded-lg border border-line bg-well p-0.5">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`h-8 flex-1 rounded-md px-2 text-ui transition ${
              option.value === value ? "bg-raised text-text" : "text-muted hover:text-text"
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
      <span className="engraved mb-1.5 block">{label}</span>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 font-mono text-meta outline-none"
        />
        <CopyButton value={value} />
      </div>
    </div>
  );
}
