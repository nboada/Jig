"use client";

import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useState } from "react";
import { readProseClass } from "@/components/Markdown";
import { noteExtensions } from "@/lib/note-editor";

/**
 * A rich text editor that reads and writes markdown: a toolbar for headings, emphasis, lists,
 * checklists, quotes, code and links, plus the usual markdown shortcuts as you type ("- ", "## ",
 * "**bold**"). The Markdown toggle switches to the source for pasting or fine edits.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}) {
  const [source, setSource] = useState(false);
  const editor = useEditor({
    extensions: [...noteExtensions, Placeholder.configure({ placeholder })],
    content: value,
    contentType: "markdown",
    // Rendered on the server first; the editor mounts in the browser.
    immediatelyRender: false,
    editorProps: { attributes: { class: `${readProseClass} min-h-96 px-5 py-4 outline-none sm:px-7 sm:py-6`, "aria-label": "Note" } },
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  });

  function toggleSource() {
    // Coming back from the source, load whatever was typed there.
    if (source) editor?.commands.setContent(value, { contentType: "markdown" });
    setSource(!source);
  }

  return (
    // Framed like a snippet's file: the toolbar is the frame's header, the note its body.
    <div className="rounded-xl border border-line bg-well">
      {/* The toolbar stays in reach under the header on a long note. */}
      <div className="sticky top-(--pane-top) z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-line bg-strip/95 p-1 backdrop-blur">
        {editor && !source ? <Toolbar editor={editor} /> : <span className="px-2 text-meta text-muted">Editing the markdown source</span>}
        <div className="ml-auto flex rounded-md border border-line bg-well p-0.5" role="group" aria-label="Editor">
          {(["Rich", "Markdown"] as const).map((mode) => {
            const on = (mode === "Markdown") === source;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={on}
                onClick={() => !on && toggleSource()}
                className={`h-6 rounded px-2.5 text-meta transition ${on ? "bg-overlay text-text" : "text-muted hover:text-text"}`}
              >
                {mode}
              </button>
            );
          })}
        </div>
      </div>
      {source ? (
        <textarea
          aria-label="Note (markdown)"
          className="block min-h-96 w-full resize-y rounded-b-xl bg-transparent px-5 py-4 font-mono text-ui leading-relaxed outline-none sm:px-7 sm:py-6"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  // Re-render the buttons' pressed states as the selection moves, without re-rendering the editor.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
    }),
  });
  const [linking, setLinking] = useState<string | null>(null);
  const chain = () => editor.chain().focus();

  if (linking !== null) {
    const apply = () => {
      const href = linking.trim();
      if (href) chain().extendMarkRange("link").setLink({ href }).run();
      else chain().extendMarkRange("link").unsetLink().run();
      setLinking(null);
    };
    return (
      <div className="flex flex-1 items-center gap-2 px-1">
        <input
          autoFocus
          value={linking}
          onChange={(e) => setLinking(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
            if (e.key === "Escape") setLinking(null);
          }}
          placeholder="https://example.com"
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-well px-2 text-ui outline-none focus:border-line-strong"
        />
        <button type="button" onClick={apply} className="h-7 rounded-md bg-accent px-2.5 text-meta font-semibold text-accent-ink">
          {linking.trim() ? "Apply" : "Remove link"}
        </button>
        <button type="button" onClick={() => setLinking(null)} className="h-7 px-1.5 text-meta text-muted hover:text-text">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      <Tool label="Heading 1" on={active.h1} run={() => chain().toggleHeading({ level: 1 }).run()} text="H1" />
      <Tool label="Heading 2" on={active.h2} run={() => chain().toggleHeading({ level: 2 }).run()} text="H2" />
      <Tool label="Heading 3" on={active.h3} run={() => chain().toggleHeading({ level: 3 }).run()} text="H3" />
      <Divider />
      <Tool label="Bold (Cmd+B)" on={active.bold} run={() => chain().toggleBold().run()} icon="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
      <Tool label="Italic (Cmd+I)" on={active.italic} run={() => chain().toggleItalic().run()} icon="M19 4h-9M14 20H5M15 4 9 20" />
      <Tool label="Strikethrough" on={active.strike} run={() => chain().toggleStrike().run()} icon="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16" />
      <Tool label="Inline code" on={active.code} run={() => chain().toggleCode().run()} icon="m16 18 6-6-6-6M8 6l-6 6 6 6" />
      <Tool
        label="Link"
        on={active.link}
        run={() => setLinking((editor.getAttributes("link").href as string | undefined) ?? "")}
        icon="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      />
      <Divider />
      <Tool label="Bulleted list" on={active.bullet} run={() => chain().toggleBulletList().run()} icon="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      <Tool label="Numbered list" on={active.ordered} run={() => chain().toggleOrderedList().run()} icon="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
      <Tool label="Checklist" on={active.task} run={() => chain().toggleTaskList().run()} icon="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8" />
      <Divider />
      <Tool label="Quote" on={active.quote} run={() => chain().toggleBlockquote().run()} icon="M17 6H3M21 12H8M21 18H8M3 12v6" />
      <Tool label="Code block" on={active.codeBlock} run={() => chain().toggleCodeBlock().run()} icon="M10 9.5 8 12l2 2.5M14 9.5l2 2.5-2 2.5M3 5h18v14H3z" />
      <Tool label="Divider" on={false} run={() => chain().setHorizontalRule().run()} icon="M3 12h18" />
    </>
  );
}

function Tool({ label, on, run, icon, text }: { label: string; on: boolean; run: () => void; icon?: string; text?: string }) {
  return (
    <button
      type="button"
      // Keep the editor's selection: act on mousedown without taking focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={`grid h-7 min-w-7 place-items-center rounded-md px-1 text-meta font-semibold transition ${on ? "bg-raised text-text" : "text-muted hover:bg-raised/60 hover:text-text"}`}
    >
      {icon ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
          <path d={icon} />
        </svg>
      ) : (
        text
      )}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-line" aria-hidden />;
}
