"use client";

import { button } from "@/components/Button";
import { useActionState, useState } from "react";
import { saveNote } from "@/app/actions";
import { FormBar, type FormHeader } from "@/components/FormBar";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { field, label } from "@/components/SnippetForm";
import type { Note } from "@/lib/notes";

export function NoteForm({ note, header, ai = false }: { note?: Note; header: FormHeader; /** Offer the AI menu (never on a locked note). */ ai?: boolean }) {
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
    <form action={action} className="form-enter space-y-6">
      <input type="hidden" name="slug" value={note?.slug ?? ""} />
      <input type="hidden" name="payload" value={payload} />
      <FormBar
        cancelHref={note ? `/notes/${note.slug}` : "/notes"}
        pending={pending}
        label={note ? "Save" : "Create"}
        {...header}
        title={{ value: title, onChange: setTitle, placeholder: "Note title", autoFocus: !note }}
      />

      <div>
        <label className="block">
          <span className={label}>Tags (comma separated)</span>
          <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="acme, hosting" />
        </label>
      </div>

      <div>
        <span className={label}>Note</span>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          ai={ai && !note?.locked ? { slug: note?.slug } : undefined}
          placeholder="Steps, decisions, client details. Keep passwords and API keys in Credentials."
        />
      </div>

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
          <button
            disabled={pending}
            className={button({ variant: "primary" })}
          >
            {pending ? "Saving" : note ? `Save as version ${note.currentVersion + 1}` : "Create note"}
          </button>
        </div>
      </div>
      {state.error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-ui text-danger">{state.error}</p>}
    </form>
  );
}
