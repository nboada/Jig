"use client";

import type { Editor } from "@tiptap/react";
import { diffWordsWithSpace } from "diff";
import { useMemo, useState, useTransition } from "react";
import { aiRewrite } from "@/app/actions";
import { AiPrompt, RefineBar } from "@/components/AiPrompt";
import { button } from "@/components/Button";
import { Markdown } from "@/components/Markdown";
import { Modal } from "@/components/Modal";
import type { RewriteMode } from "@/lib/ai";

const MODES: { mode: Exclude<RewriteMode, "custom">; label: string; done: string }[] = [
  { mode: "rephrase", label: "Rephrase", done: "Rephrased" },
  { mode: "shorten", label: "Shorten", done: "Shortened" },
  { mode: "fix", label: "Fix spelling and grammar", done: "Fixed" },
];

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

type Request = { mode: RewriteMode; instruction?: string };
type Suggestion = Request & { original: string; text: string; range: { from: number; to: number } | null };
type Target = { original: string; range: { from: number; to: number } | null };

export function NoteAi({ editor, slug }: { editor: Editor; slug?: string }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [view, setView] = useState<"changes" | "result">("changes");
  const [target, setTarget] = useState<Target | null>(null);
  const [, start] = useTransition();

  // Read when the box opens: typing the request moves the focus, but the editor keeps its selection.
  function capture(): Target {
    const { from: a, to: b, empty } = editor.state.selection;
    const range = empty ? null : { from: a, to: b };
    const original = range
      ? (editor.markdown?.serialize({ type: "doc", content: editor.state.doc.slice(range.from, range.to).content.toJSON() }) ?? "")
      : editor.getMarkdown();
    return { original, range };
  }

  // A refinement sends the AI's last answer with the new request; the diff still compares with the note.
  function run(request: Request, on: Target = target ?? capture(), from?: string) {
    if (!on.original.trim()) return setError("There's no text to work on yet.");
    setError("");
    setWorking(true);
    start(async () => {
      const result = await aiRewrite(request.mode, from ?? on.original, slug, request.instruction);
      setWorking(false);
      if (result.error || result.text === undefined) return setError(result.error ?? "The AI couldn't answer just now. Try again.");
      setSuggestion({ ...request, original: on.original, text: result.text, range: on.range });
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

  const done = suggestion?.mode === "custom" ? "Edited" : MODES.find((m) => m.mode === suggestion?.mode)?.done;

  return (
    <>
      <AiPrompt
        working={working}
        title="AI: tell it what to change in the selection (or the whole note)"
        placeholder="Tell the AI what to do, e.g. fix the spacing"
        hint="Works on the selection, or the whole note."
        onOpen={() => setTarget(capture())}
        onAsk={(instruction) => run({ mode: "custom", instruction })}
        shortcuts={MODES.map(({ mode, label }) => ({ label, run: () => run({ mode }) }))}
      />

      <Modal open={Boolean(error)} onOpenChange={(open) => !open && setError("")} title="The AI couldn't help">
        <p className="mt-3 text-body text-text-2">{error}</p>
      </Modal>

      <Modal
        open={suggestion !== null}
        onOpenChange={(open) => !open && setSuggestion(null)}
        size="md"
        title={done ? `${done} ${suggestion?.range ? "selection" : "note"}` : "Suggestion"}
        description={suggestion?.instruction ? `“${suggestion.instruction}”` : "Nothing changes until you replace it, and the note keeps its old version when you save."}
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
            <RefineBar
              working={working}
              placeholder="Ask for a change to this, e.g. less formal"
              onRefine={(instruction) => run({ mode: "custom", instruction }, suggestion, suggestion.text)}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => run(suggestion, suggestion)} disabled={working} className={button({ variant: "ghost" })}>
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
