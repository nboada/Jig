"use client";

import Link from "next/link";
import type { EditorView } from "@codemirror/view";
import { useActionState, useRef, useState } from "react";
import { saveSnippet } from "@/app/actions";
import { CodeEditor } from "@/components/CodeEditor";
import { LanguageSelect } from "@/components/LanguageSelect";
import { beautify, canBeautify, detectLanguage, findSplit, type Split } from "@/lib/beautify";
import { defaultFileName, languageFamily, languageForFile, languageLabel, withExtension } from "@/lib/languages";
import { renameForTitle } from "@/lib/slug";
import type { Snippet, SnippetFile } from "@/lib/snippets";

export const field = "w-full rounded-md border border-line bg-panel px-3 py-2 outline-none focus:border-accent";
export const label = "mb-1.5 block text-sm text-muted";

const splitList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);

export function SnippetForm({ snippet }: { snippet?: Snippet }) {
  const [state, action, pending] = useActionState(saveSnippet, {});
  const [title, setTitle] = useState(snippet?.title ?? "");
  const [description, setDescription] = useState(snippet?.description ?? "");
  const [language, setLanguage] = useState(snippet?.language ?? "javascript");
  const [tags, setTags] = useState(snippet?.tags.join(", ") ?? "");
  const [dependencies, setDependencies] = useState(snippet?.dependencies.join("\n") ?? "");
  const [instructions, setInstructions] = useState(snippet?.instructions ?? "");
  const [message, setMessage] = useState("");
  // Saved files still called snippet.* take the title's name straight away, so the next save keeps it.
  const [files, setFiles] = useState<SnippetFile[]>(() =>
    snippet ? renameForTitle(snippet.files, "", snippet.title) : [{ name: defaultFileName("javascript"), content: "" }],
  );
  // The optional fields start folded away unless the snippet already uses them.
  const hasDetails = Boolean(
    snippet && (snippet.description || snippet.tags.length || snippet.dependencies.length || snippet.instructions),
  );

  const updateFile = (index: number, change: Partial<SnippetFile>) =>
    setFiles((list) => list.map((f, i) => (i === index ? { ...f, ...change } : f)));

  const editors = useRef<(EditorView | undefined)[]>([]);
  const [formatting, setFormatting] = useState<number | null>(null);
  const [formatError, setFormatError] = useState<{ index: number; message: string; split?: Split; rename?: string } | null>(null);
  async function format(index: number, fileLanguage: string) {
    setFormatting(index);
    setFormatError(null);
    try {
      const formatted = await beautify(files[index].content, fileLanguage);
      const view = editors.current[index];
      // Through the editor, the change shows at once and Cmd+Z undoes it; onChange then updates the file.
      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
      else updateFile(index, { content: formatted });
    } catch (error) {
      // Parser messages read like "Unexpected token (15:16)" followed by a code frame; keep the line number.
      const where = error instanceof Error ? error.message.match(/\((\d+):\d+\)/) : null;
      const kind = languageLabel(fileLanguage);
      const content = files[index].content;
      // Either the whole file is another language (wrong extension), or a block at the end is.
      const actual = await detectLanguage(content, fileLanguage, [language]);
      const split = actual ? undefined : ((await findSplit(content, fileLanguage)) ?? undefined);
      setFormatError({
        index,
        message: actual
          ? `This looks like ${languageLabel(actual)}, but ${files[index].name} is formatted as ${kind} because of its extension.`
          : split
            ? `Lines ${split.line}–${split.line + split.tail.trimEnd().split("\n").length - 1} look like ${languageLabel(split.tailLanguage)}, which can't be formatted as ${kind}.`
            : `${where ? `Line ${where[1]} isn't valid ${kind}` : `This isn't valid ${kind}`}, so nothing was changed.`,
        split,
        rename: actual ? withExtension(files[index].name, actual) : undefined,
      });
    } finally {
      setFormatting(null);
    }
  }

  /** Moves a stray block out of a file into a new file named for its language, e.g. snippet.css. */
  function moveSplit(index: number, split: Split) {
    const taken = new Set(files.map((f) => f.name));
    let name = withExtension(files[index].name, split.tailLanguage);
    for (let n = 2; taken.has(name); n++) name = withExtension(`${files[index].name.replace(/\.[^.]+$/, "")}-${n}`, split.tailLanguage);
    // Trim the original through its editor, as Format does; its onChange updates the file.
    const view = editors.current[index];
    if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: split.head } });
    else updateFile(index, { content: split.head });
    setFiles((list) => [...list, { name, content: split.tail }]);
    setFormatError(null);
  }

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
            onChange={(e) => {
              const next = e.target.value;
              setFiles((list) => renameForTitle(list, title, next));
              setTitle(next);
            }}
            placeholder="GSAP ScrollTrigger setup"
            required
            autoFocus={!snippet}
          />
        </label>
        <div>
          <span className={label}>Language</span>
          <LanguageSelect
            className="w-full"
            value={language}
            onChange={(next) => {
              // A lone file whose extension followed the old language follows the new one too.
              if (files.length === 1 && languageFamily(languageForFile(files[0].name, "")) === languageFamily(language)) {
                updateFile(0, { name: withExtension(files[0].name, next) });
              }
              setLanguage(next);
            }}
          />
        </div>
      </div>

      <div className="space-y-4">
        {files.map((file, index) => {
          const fileLanguage = languageForFile(file.name, language);
          const formattable = canBeautify(fileLanguage);
          return (
            <div key={index} className="overflow-hidden rounded-lg border border-line bg-panel focus-within:border-muted">
              <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
                <input
                  aria-label="File name"
                  className="min-w-0 flex-1 rounded bg-transparent px-2 py-1 font-mono text-[13px] outline-none focus:bg-raised"
                  value={file.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    updateFile(index, { name });
                    // On a new single-file snippet, the extension picks the language.
                    const detected = languageForFile(name, "");
                    if (!snippet && files.length === 1 && detected) setLanguage(detected);
                  }}
                  required
                />
                <button
                  type="button"
                  disabled={!formattable || !file.content.trim() || formatting === index}
                  title={formattable ? `Format as ${languageLabel(fileLanguage)}` : `No formatter for ${languageLabel(fileLanguage)}`}
                  onClick={() => format(index, fileLanguage)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-text/85 transition hover:border-muted hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:border-line"
                >
                  <FormatIcon />
                  {formatting === index ? "Formatting" : "Format"}
                </button>
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
              {formatError?.index === index && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-danger/10 px-4 py-2 text-xs text-danger">
                  <p className="flex-1">{formatError.message}</p>
                  {formatError.rename && (
                    <button
                      type="button"
                      onClick={() => {
                        updateFile(index, { name: formatError.rename! });
                        setFormatError(null);
                      }}
                      className="shrink-0 rounded-md bg-accent px-2.5 py-1 font-medium text-accent-ink hover:brightness-110"
                    >
                      {`Rename to ${formatError.rename}`}
                    </button>
                  )}
                  {formatError.split && (
                    <button
                      type="button"
                      onClick={() => moveSplit(index, formatError.split!)}
                      className="shrink-0 rounded-md bg-accent px-2.5 py-1 font-medium text-accent-ink hover:brightness-110"
                    >
                      {`Move them to their own ${languageLabel(formatError.split.tailLanguage)} file`}
                    </button>
                  )}
                </div>
              )}
              <CodeEditor
                label={`Contents of ${file.name}`}
                language={fileLanguage}
                value={file.content}
                onChange={(content) => {
                  updateFile(index, { content });
                  if (formatError?.index === index) setFormatError(null);
                }}
                placeholder="Paste the code here"
                onReady={(view) => {
                  editors.current[index] = view;
                }}
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setFiles((list) => [...list, { name: `file-${list.length + 1}.${defaultFileName(language).split(".").pop()}`, content: "" }])}
          className="text-sm text-muted hover:text-text"
        >
          + Add another file
        </button>
      </div>

      <details open={hasDetails} className="group rounded-lg border border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          <span>More details: description, tags, dependencies, agent instructions</span>
          <span className="transition group-open:rotate-90" aria-hidden>
            ›
          </span>
        </summary>
        <div className="space-y-4 border-t border-line p-4">
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
        </div>
      </details>

      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-end">
        {snippet ? (
          <label className="flex-1">
            <span className={label}>What changed?</span>
            <input
              className={field}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Bumped to GSAP 3.13"
            />
          </label>
        ) : (
          <div className="flex-1" />
        )}
        <div className="flex gap-3">
          <Link
            href={snippet ? `/snippets/${snippet.slug}` : "/snippets"}
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

function FormatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden>
      <path d="M21 6H3M17 12H7M19 18H5" />
    </svg>
  );
}
