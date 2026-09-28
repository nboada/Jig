"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { saveCredential } from "@/app/actions";
import { field, label } from "@/components/SnippetForm";
import type { Credential } from "@/lib/credentials";

/** One editable field. `stored` means a secret value already exists on the server. */
type Row = { key: number; id?: string; label: string; secret: boolean; value: string; stored: boolean };

const small = "rounded px-2 py-1 text-xs text-muted hover:text-text disabled:opacity-40";

export function CredentialForm({ credential }: { credential?: Credential }) {
  const [state, action, pending] = useActionState(saveCredential, {});
  const [title, setTitle] = useState(credential?.title ?? "");
  const [url, setUrl] = useState(credential?.url ?? "");
  const [tags, setTags] = useState(credential?.tags.join(", ") ?? "");
  const [note, setNote] = useState(credential?.note ?? "");
  const [rows, setRows] = useState<Row[]>(
    credential?.fields.map((f, i) => ({ key: i, id: f.id, label: f.label, secret: f.secret, value: f.value ?? "", stored: f.secret })) ?? [
      { key: 0, label: "Username", secret: false, value: "", stored: false },
      { key: 1, label: "Password", secret: true, value: "", stored: false },
    ],
  );
  const nextKey = useRef(rows.length);

  const update = (key: number, change: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const move = (index: number, delta: number) =>
    setRows((list) => {
      const copy = [...list];
      const [row] = copy.splice(index, 1);
      copy.splice(index + delta, 0, row);
      return copy;
    });

  const payload = JSON.stringify({
    title,
    url,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    note,
    fields: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), label: r.label, secret: r.secret, value: r.value })),
  });

  return (
    <form action={action} className="space-y-6" autoComplete="off">
      <input type="hidden" name="slug" value={credential?.slug ?? ""} />
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={label}>Title</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Acme Shopify" required autoFocus={!credential} />
        </label>
        <label>
          <span className={label}>URL (optional)</span>
          <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://acme.myshopify.com/admin" />
        </label>
      </div>

      <label className="block">
        <span className={label}>Tags (comma separated)</span>
        <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="acme, shopify" />
      </label>

      <div className="space-y-2">
        <span className={label}>Fields</span>
        {rows.map((row, index) => (
          <div key={row.key} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-2 sm:flex-row sm:items-center">
            <input
              aria-label="Field label"
              className={`${field} sm:w-44`}
              value={row.label}
              onChange={(e) => update(row.key, { label: e.target.value })}
              placeholder="Label"
              required
            />
            <input
              aria-label={`Value of ${row.label}`}
              type={row.secret ? "password" : "text"}
              autoComplete={row.secret ? "new-password" : "off"}
              className={`${field} min-w-0 flex-1 font-mono text-sm`}
              value={row.value}
              onChange={(e) => update(row.key, { value: e.target.value })}
              placeholder={row.secret && row.stored ? "Unchanged" : row.stored ? "Enter the value again" : "Value"}
            />
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1.5 px-2 text-xs text-muted">
                <input type="checkbox" checked={row.secret} onChange={(e) => update(row.key, { secret: e.target.checked })} />
                Secret
              </label>
              <button type="button" className={small} disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                Up
              </button>
              <button type="button" className={small} disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
                Down
              </button>
              <button
                type="button"
                className={`${small} hover:text-danger`}
                disabled={rows.length === 1}
                onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((list) => [...list, { key: nextKey.current++, label: "", secret: true, value: "", stored: false }])}
          className="w-full rounded-lg border border-dashed border-line py-2.5 text-sm text-muted hover:border-muted hover:text-text"
        >
          Add a field
        </button>
        {credential && <p className="text-xs text-muted">Leave a secret empty to keep its saved value.</p>}
      </div>

      <label className="block">
        <span className={label}>Note (optional)</span>
        <textarea
          className={`${field} min-h-20 text-sm`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What it is for, who set it up."
        />
        <span className="mt-1 block text-xs text-muted">Don&apos;t put secrets here. This note isn&apos;t encrypted.</span>
      </label>

      <div className="flex justify-end gap-3 border-t border-line pt-6">
        <Link
          href={credential ? `/credentials/${credential.slug}` : "/credentials"}
          className="rounded-md border border-line px-4 py-2 text-sm hover:border-muted"
        >
          Cancel
        </Link>
        <button
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Saving" : credential ? "Save" : "Create credential"}
        </button>
      </div>
      {state.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
