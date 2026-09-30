"use client";

import { button } from "@/components/Button";
import { useActionState, useRef, useState } from "react";
import { saveCredential } from "@/app/actions";
import { FormBar, type FormHeader } from "@/components/FormBar";
import { field, label } from "@/components/SnippetForm";
import type { Credential } from "@/lib/credentials";

type Row = { key: number; id?: string; label: string; secret: boolean; value: string; stored: boolean };

const small = "h-7 rounded-md px-2 text-meta text-muted transition hover:bg-raised hover:text-text disabled:opacity-40";

export function CredentialForm({ credential, header }: { credential?: Credential; header: FormHeader }) {
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
    <form action={action} className="form-enter space-y-6" autoComplete="off">
      <input type="hidden" name="slug" value={credential?.slug ?? ""} />
      <input type="hidden" name="payload" value={payload} />
      <FormBar
        cancelHref={credential ? `/credentials/${credential.slug}` : "/credentials"}
        pending={pending}
        label={credential ? "Save" : "Create"}
        {...header}
        title={{ value: title, onChange: setTitle, placeholder: "Credential title", autoFocus: !credential }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={label}>URL (optional)</span>
          <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://acme.myshopify.com/admin" />
        </label>
        <label>
          <span className={label}>Tags (comma separated)</span>
          <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="acme, shopify" />
        </label>
      </div>

      <div className="space-y-2">
        <span className={label}>Fields</span>
        {rows.map((row, index) => (
          <div key={row.key} className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-2 sm:flex-row sm:items-center">
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
              type="text"
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              data-form-type="other"
              style={row.secret ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties) : undefined}
              className={`${field} min-w-0 flex-1 font-mono text-ui`}
              value={row.value}
              onChange={(e) => update(row.key, { value: e.target.value })}
              placeholder={row.secret && row.stored ? "Unchanged" : row.stored ? "Enter the value again" : "Value"}
            />
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1.5 px-2 text-meta text-muted">
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
          className="h-10 w-full rounded-xl border border-dashed border-line text-ui text-muted transition hover:border-line-strong hover:text-text"
        >
          Add a field
        </button>
        {credential && <p className="text-meta text-muted">Leave a secret empty to keep its saved value.</p>}
      </div>

      <label className="block">
        <span className={label}>Note (optional)</span>
        <textarea
          className={`${field} min-h-20`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What it is for, who set it up."
        />
        <span className="mt-1 block text-meta text-muted">Don&apos;t put secrets here. This note isn&apos;t encrypted.</span>
      </label>

      <div className="flex justify-end gap-3 border-t border-line pt-6">
        <button
          disabled={pending}
          className={button({ variant: "primary" })}
        >
          {pending ? "Saving" : credential ? "Save" : "Create credential"}
        </button>
      </div>
      {state.error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-ui text-danger">{state.error}</p>}
    </form>
  );
}
