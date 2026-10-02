"use client";

import type { EditorView } from "@codemirror/view";
import { useActionState, useRef, useState } from "react";
import { saveSnippet } from "@/app/actions";
import { CodeEditor } from "@/components/CodeEditor";
import { FormBar, type FormHeader } from "@/components/FormBar";
import { button } from "@/components/Button";
import { LanguageSelect } from "@/components/LanguageSelect";
import { SnippetReview } from "@/components/SnippetReview";
import { beautify, canBeautify, detectLanguage, findSplit, type Split } from "@/lib/beautify";
import { defaultFileName, languageFamily, languageForFile, languageLabel, withExtension } from "@/lib/languages";
import { renameForTitle } from "@/lib/slug";
import type { Snippet, SnippetFile } from "@/lib/snippets";

export const field =
  "w-full rounded-lg border border-line bg-well px-3 py-2 text-body text-text outline-none transition placeholder:text-faint hover:border-line-strong focus:border-accent";
export const label = "mb-1.5 block text-meta text-muted";

const splitList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);

export function SnippetForm({
  snippet,
  initial,
  header,
  ai = false,
}: {
  snippet?: Snippet;
  initial?: { title?: string; content?: string };
  header: FormHeader;
  ai?: boolean;
}) {
  const [state, action, pending] = useActionState(saveSnippet, {});
  const [title, setTitle] = useState(snippet?.title ?? initial?.title ?? "");
  const [description, setDescription] = useState(snippet?.description ?? "");
  const [language, setLanguage] = useState(snippet?.language ?? "javascript");
  const [tags, setTags] = useState(snippet?.tags.join(", ") ?? "");
  const [dependencies, setDependencies] = useState(snippet?.dependencies.join("\n") ?? "");
  const [instructions, setInstructions] = useState(snippet?.instructions ?? "");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<SnippetFile[]>(() =>
    snippet ? renameForTitle(snippet.files, "", snippet.title) : [{ name: defaultFileName("javascript"), content: initial?.content ?? "" }],
  );
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
      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
      else updateFile(index, { content: formatted });
    } catch (error) {
      const where = error instanceof Error ? error.message.match(/\((\d+):\d+\)/) : null;
      const kind = languageLabel(fileLanguage);
      const content = files[index].content;
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

  function goTo(name: string, line: number | null) {
    const index = Math.max(0, files.findIndex((f) => f.name === name));
    const view = editors.current[index];
    if (!view) return;
    const doc = view.state.doc;
    const at = line && line >= 1 && line <= doc.lines ? doc.line(line).from : 0;
    view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    view.focus();
  }

  function moveSplit(index: number, split: Split) {
    const taken = new Set(files.map((f) => f.name));
    let name = withExtension(files[index].name, split.tailLanguage);
    for (let n = 2; taken.has(name); n++) name = withExtension(`${files[index].name.replace(/\.[^.]+$/, "")}-${n}`, split.tailLanguage);
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
    <form action={action} className="form-enter space-y-6">
      <input type="hidden" name="slug" value={snippet?.slug ?? ""} />
      <input type="hidden" name="payload" value={payload} />
      <FormBar
        cancelHref={snippet ? `/snippets/${snippet.slug}` : "/snippets"}
        pending={pending}
        label={snippet ? "Save" : "Create"}
        {...header}
        title={{
          value: title,
          onChange: (next) => {
            setFiles((list) => renameForTitle(list, title, next));
            setTitle(next);
          },
          placeholder: "Snippet title",
          autoFocus: !snippet,
        }}
      />

      <div className="grid gap-4 sm:grid-cols-[220px]">
        <div>
          <span className={label}>Language</span>
          <LanguageSelect
            className="w-full bg-well text-body"
            value={language}
            onChange={(next) => {
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
            <div key={index} className="overflow-hidden rounded-xl border border-line bg-well transition focus-within:border-line-strong">
              <div className="flex h-11 items-center gap-1.5 border-b border-raised bg-strip pr-2 pl-1.5">
                <input
                  aria-label="File name"
                  className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 font-mono text-[12.5px] text-text outline-none transition hover:bg-raised/60 focus:bg-raised"
                  value={file.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    updateFile(index, { name });
                    const detected = languageForFile(name, "");
                    if (!snippet && files.length === 1 && detected) setLanguage(detected);
                  }}
                  required
                />
                {ai && (
                  <SnippetReview
                    disabled={!file.content.trim()}
                    draft={() => ({ title, language, instructions, files: [files[index]] })}
                    onGoTo={goTo}
                    onApply={(content) => {
                      const view = editors.current[index];
                      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
                      else updateFile(index, { content });
                    }}
                  />
                )}
                <button
                  type="button"
                  disabled={!formattable || !file.content.trim() || formatting === index}
                  title={formattable ? `Format as ${languageLabel(fileLanguage)}` : `No formatter for ${languageLabel(fileLanguage)}`}
                  onClick={() => format(index, fileLanguage)}
                  className={button({ variant: "ghost", size: "sm", className: "disabled:opacity-40" })}
                >
                  <FormatIcon />
                  {formatting === index ? "Formatting" : "Format"}
                </button>
                {files.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setFiles((list) => list.filter((_, i) => i !== index))}
                    className={button({ variant: "ghost", size: "sm", className: "hover:text-danger" })}
                  >
                    Remove
                  </button>
                )}
              </div>
              {formatError?.index === index && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-danger/10 px-4 py-2 text-meta text-danger">
                  <p className="flex-1">{formatError.message}</p>
                  {formatError.rename && (
                    <button
                      type="button"
                      onClick={() => {
                        updateFile(index, { name: formatError.rename! });
                        setFormatError(null);
                      }}
                      className={button({ variant: "primary", size: "sm" })}
                    >
                      {`Rename to ${formatError.rename}`}
                    </button>
                  )}
                  {formatError.split && (
                    <button
                      type="button"
                      onClick={() => moveSplit(index, formatError.split!)}
                      className={button({ variant: "primary", size: "sm" })}
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
          className={button({ variant: "ghost", size: "sm" })}
        >
          + Add another file
        </button>
      </div>

      <details open={hasDetails} className="group rounded-xl border border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-ui text-muted transition hover:text-text [&::-webkit-details-marker]:hidden">
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
                className={`${field} min-h-[42px] font-mono text-ui`}
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
              className={`${field} min-h-24`}
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
          <button
            disabled={pending}
            className={button({ variant: "primary" })}
          >
            {pending ? "Saving" : snippet ? `Save as version ${snippet.currentVersion + 1}` : "Create snippet"}
          </button>
        </div>
      </div>
      {state.error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-ui text-danger">{state.error}</p>}
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
