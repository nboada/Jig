"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveNote } from "@/app/actions";
import { field, indentOnTab, label } from "@/components/SnippetForm";
import type { Note } from "@/lib/notes";

export function NoteForm({ note }: { note?: Note }) {
  const [state, action, pending] = useActionState(saveNote, {});
  const [title, setTitle] = useState(note?.title ?? "");
  const [tags, setTags] = useState(note?.tags.join(", ") ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [message, setMessage] = useState("");

  const payload = JSON.stringify({
    title,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    body,
    message,
    ...(note ? { baseVersion: note.currentVersion } : {}),
  });

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="slug" value={note?.slug ?? ""} />
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={label}>Title</span>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Acme hosting setup"
            required
            autoFocus={!note}
          />
        </label>
        <label>
          <span className={label}>Tags (comma separated)</span>
          <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="acme, hosting" />
        </label>
      </div>

      <label className="block">
        <span className={label}>Note (markdown)</span>
        <textarea
          className={`${field} block min-h-96 resize-y font-mono text-[13px] leading-relaxed`}
          style={{ tabSize: 2 }}
          value={body}
          onKeyDown={indentOnTab}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Steps, decisions, client details. Keep passwords and API keys in Credentials."
        />
      </label>

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className={label}>{note ? "What changed?" : "Change note (optional)"}</span>
          <input
            className={field}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={note ? "Added the rollback steps" : "Created"}
          />
        </label>
        <div className="flex gap-3">
          <Link
            href={note ? `/notes/${note.slug}` : "/notes"}
            className="rounded-md border border-line px-4 py-2 text-sm hover:border-muted"
          >
            Cancel
          </Link>
          <button
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Saving" : note ? `Save as version ${note.currentVersion + 1}` : "Create note"}
          </button>
        </div>
      </div>
      {state.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
