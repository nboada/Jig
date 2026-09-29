"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { purgeDeleted, restoreDeleted } from "@/app/actions";
import { ConfirmDialog, DialogAction } from "@/components/ConfirmButton";
import { NOUNS } from "@/components/ItemActions";
import { CredentialsIcon, NotesIcon, SnippetsIcon } from "@/components/NavIcons";
import { toast } from "@/components/Toaster";
import { timeAgo } from "@/lib/format";
import type { TrashedItem } from "@/lib/trash";

const ICONS = { snippets: SnippetsIcon, notes: NotesIcon, credentials: CredentialsIcon };

function daysLeft(purgeAt: string) {
  const days = Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86_400_000));
  return days === 0 ? "goes today" : `${days} day${days === 1 ? "" : "s"} left`;
}

/**
 * The deleted items, each with Restore and Delete now. Either takes the row out at once; if the
 * server says no, it comes back and a toast says why.
 */
export function DeletedList({ items }: { items: TrashedItem[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [purging, setPurging] = useState<TrashedItem | null>(null);
  const [, start] = useTransition();

  const hide = (id: string, hidden: boolean) =>
    setGone((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });

  function restore(item: TrashedItem) {
    hide(item.id, true);
    start(async () => {
      const result = await restoreDeleted(item.id);
      if (result.error || !result.slug) {
        hide(item.id, false);
        return void toast.error(result.error ?? "Could not restore it. Try again.");
      }
      const href = `/${item.kind}/${result.slug}`;
      toast.success(`Restored “${item.title}”`, { action: { label: "Open", onClick: () => router.push(href) } });
    });
  }

  function purge(item: TrashedItem) {
    setPurging(null);
    hide(item.id, true);
    start(async () => {
      const result = await purgeDeleted(item.id);
      if (result.error) {
        hide(item.id, false);
        return void toast.error(result.error);
      }
      toast.success(`Deleted “${item.title}” for good`);
    });
  }

  const shown = items.filter((item) => !gone.has(item.id));
  if (shown.length === 0) return <p className="text-body text-muted">Nothing deleted in the last 30 days.</p>;

  return (
    <>
      <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
        {shown.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-body">
              <Icon className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.title}</p>
                <p className="text-meta text-muted" suppressHydrationWarning>
                  {`${NOUNS[item.kind][0].toUpperCase()}${NOUNS[item.kind].slice(1)} · deleted ${timeAgo(item.deletedAt)} · ${daysLeft(item.purgeAt)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => restore(item)}
                className="h-7 shrink-0 rounded-md border border-line-strong px-2.5 text-meta font-medium text-text transition hover:bg-raised"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => setPurging(item)}
                className="h-7 shrink-0 rounded-md px-2.5 text-meta text-danger transition hover:bg-danger/10"
              >
                Delete now
              </button>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(open) => !open && setPurging(null)}
        title="Delete for good?"
        message={purging ? `“${purging.title}” and its history are deleted for good, along with any share links. This cannot be undone.` : ""}
        action={purging ? <DialogAction label="Delete for good" tone="danger" onClick={() => purge(purging)} /> : null}
      />
    </>
  );
}
