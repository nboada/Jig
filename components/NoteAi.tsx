"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Editor } from "@tiptap/react";
import { diffWordsWithSpace } from "diff";
import { useMemo, useState, useTransition } from "react";
import { aiRewrite } from "@/app/actions";
import { button } from "@/components/Button";
import { menuContentClass, menuItemClass } from "@/components/ItemActions";
import { Markdown } from "@/components/Markdown";
import { Modal } from "@/components/Modal";
import type { RewriteMode } from "@/lib/ai";

const MODES: { mode: RewriteMode; label: string; done: string }[] = [
  { mode: "rephrase", label: "Rephrase", done: "Rephrased" },
  { mode: "shorten", label: "Shorten", done: "Shortened" },
  { mode: "fix", label: "Fix spelling and grammar", done: "Fixed" },
];

export function SparkleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 2l.6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z" />
    </svg>
  );
}

function Changes({ original, text }: { original: string; text: string }) {
  const parts = useMemo(() => diffWordsWithSpace(original, text), [original, text]);
  const count = parts.filter((p) => p.added || p.removed).length;
  return (
    <div className="space-y-2">
      <p className="text-meta text-muted">{count === 0 ? "No changes: the text was already fine." : `${count} change${count === 1 ? "" : "s"}`}</p>
      <div className="max-h-[55dvh] overflow-y-auto rounded-lg border border-line bg-well px-4 py-3 text-body leading-relaxed whitespace-pre-wrap break-words text-text-2">
        {parts.map((part, i) =>
          part.removed ? (
            <del key={i} className="rounded-sm bg-danger/15 text-danger decoration-danger/70">
              {part.value}
            </del>
          ) : part.added ? (
            <ins key={i} className="rounded-sm bg-accent/20 text-text no-underline">
              {part.value}
            </ins>
          ) : (
            <span key={i}>{part.value}</span>
          ),
        )}
      </div>
    </div>
  );
}

type Suggestion = { mode: RewriteMode; original: string; text: string; range: { from: number; to: number } | null };

export function NoteAi({ editor, slug }: { editor: Editor; slug?: string }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<RewriteMode | null>(null);
  const [view, setView] = useState<"changes" | "result">("changes");
  const [, start] = useTransition();

  function run(mode: RewriteMode, from?: Suggestion) {
    const { from: a, to: b, empty } = editor.state.selection;
    const range = from ? from.range : empty ? null : { from: a, to: b };
    const original = from
      ? from.original
      : range
        ? (editor.markdown?.serialize({ type: "doc", content: editor.state.doc.slice(range.from, range.to).content.toJSON() }) ?? "")
        : editor.getMarkdown();
    if (!original.trim()) return setError("There's no text to work on yet.");
    setError("");
    setWorking(mode);
    start(async () => {
      const result = await aiRewrite(mode, original, slug);
      setWorking(null);
      if (result.error || result.text === undefined) return setError(result.error ?? "The AI couldn't answer just now. Try again.");
      setSuggestion({ mode, original, text: result.text, range });
      setView("changes");
    });
  }

  function replace() {
    if (!suggestion) return;
    if (suggestion.range) {
      editor.chain().focus().insertContentAt(suggestion.range, suggestion.text, { contentType: "markdown" }).run();
    } else {
      editor.chain().focus().setContent(suggestion.text, { contentType: "markdown" }).run();
    }
    setSuggestion(null);
  }

  const label = MODES.find((m) => m.mode === (suggestion?.mode ?? working))?.done;

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          onMouseDown={(e) => e.preventDefault()}
          disabled={working !== null}
          title="AI check: rephrase, shorten or fix the selection (or the whole note)"
          className={button({ variant: "ghost", size: "sm", className: "disabled:opacity-60 data-[state=open]:bg-raised data-[state=open]:text-text" })}
        >
          <SparkleIcon className={`size-3.5 ${working ? "animate-pulse text-accent" : ""}`} />
          {working ? "Checking" : "AI check"}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={6} className={menuContentClass} onCloseAutoFocus={(e) => e.preventDefault()}>
            {MODES.map(({ mode, label }) => (
              <DropdownMenu.Item key={mode} onSelect={() => run(mode)} className={menuItemClass()}>
                {label}
              </DropdownMenu.Item>
            ))}
            <p className="px-2.5 pt-1 pb-1.5 text-meta text-faint">Works on the selection, or the whole note.</p>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Modal open={Boolean(error)} onOpenChange={(open) => !open && setError("")} title="The AI couldn't help">
        <p className="mt-3 text-body text-text-2">{error}</p>
      </Modal>

      <Modal
        open={suggestion !== null}
        onOpenChange={(open) => !open && setSuggestion(null)}
        size="md"
        title={label ? `${label} ${suggestion?.range ? "selection" : "note"}` : "Suggestion"}
        description="Nothing changes until you replace it, and the note keeps its old version when you save."
      >
        {suggestion && (
          <div className="mt-4 space-y-4">
            <div className="flex w-fit rounded-md border border-line bg-well p-0.5" role="group" aria-label="View">
              {(["changes", "result"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`h-6 rounded px-2.5 text-meta transition ${view === v ? "bg-overlay text-text" : "text-muted hover:text-text"}`}
                >
                  {v === "changes" ? "Changes" : "Result"}
                </button>
              ))}
            </div>
            {view === "changes" ? (
              <Changes original={suggestion.original} text={suggestion.text} />
            ) : (
              <div className="max-h-[55dvh] overflow-y-auto rounded-lg border border-line bg-well px-4 py-3">
                <Markdown>{suggestion.text}</Markdown>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => run(suggestion.mode, suggestion)} disabled={working !== null} className={button({ variant: "ghost" })}>
                {working ? "Trying again…" : "Try again"}
              </button>
              <button type="button" onClick={() => setSuggestion(null)} className={button()}>
                Cancel
              </button>
              <button type="button" onClick={replace} className={button({ variant: "primary" })}>
                Replace
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
