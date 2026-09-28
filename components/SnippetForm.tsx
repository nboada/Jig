"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveSnippet } from "@/app/actions";
import { defaultFileName, LANGUAGES } from "@/lib/languages";
import type { Snippet, SnippetFile } from "@/lib/snippets";

export const field = "w-full rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent";
export const label = "mb-1.5 block text-sm text-muted";

const splitList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);

/** Tab inserts two spaces instead of leaving the textarea. */
export function indentOnTab(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  const el = event.currentTarget;
  const { selectionStart: start, selectionEnd: end } = el;
  el.setRangeText("  ", start, end, "end");
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function SnippetForm({ snippet }: { snippet?: Snippet }) {
  const [state, action, pending] = useActionState(saveSnippet, {});
  const [title, setTitle] = useState(snippet?.title ?? "");
  const [description, setDescription] = useState(snippet?.description ?? "");
  const [language, setLanguage] = useState(snippet?.language ?? "javascript");
  const [tags, setTags] = useState(snippet?.tags.join(", ") ?? "");
  const [dependencies, setDependencies] = useState(snippet?.dependencies.join("\n") ?? "");
  const [instructions, setInstructions] = useState(snippet?.instructions ?? "");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<SnippetFile[]>(
    snippet?.files ?? [{ name: defaultFileName("javascript"), content: "" }],
  );

  const updateFile = (index: number, change: Partial<SnippetFile>) =>
    setFiles((list) => list.map((f, i) => (i === index ? { ...f, ...change } : f)));

  const payload = JSON.stringify({
    title,
    description,
    language,
    tags: splitList(tags),
    dependencies: splitList(dependencies),
    instructions,
    files,
    message,
    ...(snippet ? { baseVersion: snippet.currentVersion } : {}),
  });

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="slug" value={snippet?.slug ?? ""} />
      <input type="hidden" name="payload" value={payload} />

      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <label>
          <span className={label}>Title</span>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="GSAP ScrollTrigger setup"
            required
            autoFocus={!snippet}
          />
        </label>
        <label>
          <span className={label}>Language</span>
          <select
            className={field}
            value={language}
            onChange={(e) => {
              const next = e.target.value;
              // Rename the untouched starter file so highlighting follows the language.
              if (!snippet && files.length === 1 && files[0].name === defaultFileName(language)) {
                updateFile(0, { name: defaultFileName(next) });
              }
              setLanguage(next);
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className={label}>Description</span>
        <textarea
          className={`${field} min-h-20`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What it does and when to reach for it."
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={label}>Tags (comma separated)</span>
          <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gsap, animation" />
        </label>
        <label>
          <span className={label}>Dependencies (one per line)</span>
          <textarea
            className={`${field} min-h-[42px] font-mono text-sm`}
            rows={Math.max(1, dependencies.split("\n").length)}
            value={dependencies}
            onChange={(e) => setDependencies(e.target.value)}
            placeholder="gsap@^3.13"
          />
        </label>
      </div>

      <label className="block">
        <span className={label}>Instructions for agents</span>
        <textarea
          className={`${field} min-h-24 text-sm`}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Where the files go, how to wire them up, anything to watch out for."
        />
      </label>

      <div className="space-y-4">
        {files.map((file, index) => (
          <div key={index} className="overflow-hidden rounded-lg border border-line bg-panel focus-within:border-muted">
            <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
              <input
                aria-label="File name"
                className="min-w-0 flex-1 rounded bg-transparent px-2 py-1 font-mono text-[13px] outline-none focus:bg-raised"
                value={file.name}
                onChange={(e) => updateFile(index, { name: e.target.value })}
                required
              />
              {files.length > 1 && (
                <button
                  type="button"
                  onClick={() => setFiles((list) => list.filter((_, i) => i !== index))}
                  className="rounded px-2 py-1 text-xs text-muted hover:text-danger"
                >
                  Remove
                </button>
              )}
            </div>
            <textarea
              aria-label={`Contents of ${file.name}`}
              className="block min-h-72 w-full resize-y bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed outline-none"
              style={{ tabSize: 2 }}
              spellCheck={false}
              value={file.content}
              onKeyDown={indentOnTab}
              onChange={(e) => updateFile(index, { content: e.target.value })}
              placeholder="Paste the code here"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setFiles((list) => [...list, { name: `file-${list.length + 1}.${defaultFileName(language).split(".").pop()}`, content: "" }])}
          className="w-full rounded-lg border border-dashed border-line py-2.5 text-sm text-muted hover:border-muted hover:text-text"
        >
          Add another file
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className={label}>{snippet ? "What changed?" : "Note (optional)"}</span>
          <input
            className={field}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={snippet ? "Bumped to GSAP 3.13" : "Created"}
          />
        </label>
        <div className="flex gap-3">
          <Link
            href={snippet ? `/snippets/${snippet.slug}` : "/"}
            className="rounded-md border border-line px-4 py-2 text-sm hover:border-muted"
          >
            Cancel
          </Link>
          <button
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Saving" : snippet ? `Save as version ${snippet.currentVersion + 1}` : "Create snippet"}
          </button>
        </div>
      </div>
      {state.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
    </form>
  );
}
