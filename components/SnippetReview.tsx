"use client";

import { diffLines } from "diff";
import { useState, useTransition } from "react";
import { aiFix, aiReview } from "@/app/actions";
import { button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { SparkleIcon } from "@/components/NoteAi";
import type { Review, ReviewIssue } from "@/lib/ai";

const SEVERITY: Record<ReviewIssue["severity"], { label: string; className: string }> = {
  error: { label: "Error", className: "border-danger/40 bg-danger/10 text-danger" },
  warning: { label: "Warning", className: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  suggestion: { label: "Suggestion", className: "border-line-strong bg-raised text-text-2" },
};

const ORDER = { error: 0, warning: 1, suggestion: 2 };

type Draft = { title: string; language: string; instructions: string; files: { name: string; content: string }[] };

export function SnippetReview({
  draft,
  onGoTo,
  onApply,
  disabled = false,
}: {
  draft: () => Draft;
  onGoTo: (file: string, line: number | null) => void;
  onApply: (content: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [checking, start] = useTransition();
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [fixed, setFixed] = useState<{ before: string; after: string } | null>(null);
  const [fixing, startFix] = useTransition();

  const issues = [...(review?.issues ?? [])].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  function check() {
    setError("");
    setReview(null);
    setFixed(null);
    setOpen(true);
    start(async () => {
      const result = await aiReview(draft());
      if (!result.review) return setError(result.error ?? "The AI couldn't answer just now. Try again.");
      setReview(result.review);
      const sorted = [...result.review.issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
      setChosen(new Set(sorted.flatMap((issue, i) => (issue.severity === "suggestion" ? [] : [i]))));
    });
  }

  function fix() {
    const { language, files } = draft();
    const file = files[0];
    setError("");
    startFix(async () => {
      const result = await aiFix({ file, language, issues: issues.filter((_, i) => chosen.has(i)) });
      if (result.content === undefined) return setError(result.error ?? "The AI couldn't answer just now. Try again.");
      setFixed({ before: file.content, after: result.content });
    });
  }

  const toggle = (i: number) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <>
      <button
        type="button"
        onClick={check}
        disabled={disabled || checking}
        title="Check this file for errors with AI"
        className={button({ variant: "ghost", size: "sm", className: "disabled:opacity-40" })}
      >
        <SparkleIcon className={`size-3.5 ${checking ? "animate-pulse text-accent" : ""}`} />
        {checking ? "Checking" : "AI check"}
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        size="md"
        title={`AI check: ${draft().files[0]?.name ?? "file"}`}
        description="An AI review of this file as it is now, unsaved changes included. It can be wrong: treat it as a second pair of eyes."
      >
        <div className="mt-4 space-y-4">
          {checking && (
            <p className="flex items-center gap-2 text-body text-muted">
              <SparkleIcon className="size-4 animate-pulse text-accent" />
              Reading the code…
            </p>
          )}
          {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-ui text-danger">{error}</p>}
          {review && !fixed && (
            <>
              <p className="text-body text-text-2">{review.summary}</p>
              {issues.length > 0 && (
                <ul className="max-h-[50dvh] space-y-2 overflow-y-auto">
                  {issues.map((issue, i) => (
                    <li key={i} className="flex gap-3 rounded-lg border border-line bg-well px-3.5 py-3">
                      <input
                        type="checkbox"
                        checked={chosen.has(i)}
                        onChange={() => toggle(i)}
                        aria-label={`Fix: ${issue.message}`}
                        className="mt-1 size-4 shrink-0 accent-(--color-accent)"
                      />
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded border px-1.5 text-meta font-medium ${SEVERITY[issue.severity].className}`}>
                            {SEVERITY[issue.severity].label}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              onGoTo(issue.file, issue.line);
                            }}
                            title="Go to this line"
                            className="font-mono text-meta text-muted underline decoration-line-strong underline-offset-2 transition hover:text-text"
                          >
                            {issue.line ? `${issue.file}:${issue.line}` : issue.file}
                          </button>
                        </div>
                        <p className="text-body text-text">{issue.message}</p>
                        {issue.fix && <p className="text-ui text-text-2">{issue.fix}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {fixed && <FixDiff before={fixed.before} after={fixed.after} />}
          <div className="flex flex-wrap justify-end gap-2">
            {fixed ? (
              <>
                <button type="button" onClick={() => setFixed(null)} className={button()}>
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(fixed.after);
                    setOpen(false);
                    setFixed(null);
                  }}
                  className={button({ variant: "primary" })}
                >
                  Apply
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={check} disabled={checking || fixing} className={button({ variant: "ghost" })}>
                  {checking ? "Checking…" : "Check again"}
                </button>
                {issues.length > 0 && (
                  <button type="button" onClick={fix} disabled={fixing || chosen.size === 0} className={button({ variant: "primary", className: "disabled:opacity-50" })}>
                    <SparkleIcon className={`size-3.5 ${fixing ? "animate-pulse" : ""}`} />
                    {fixing ? "Fixing…" : `Fix ${chosen.size === issues.length ? "all" : chosen.size} with AI`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function FixDiff({ before, after }: { before: string; after: string }) {
  const parts = diffLines(before, after);
  const changed = parts.filter((p) => p.added || p.removed).reduce((n, p) => n + (p.count ?? 0), 0);
  return (
    <div className="space-y-2">
      <p className="text-meta text-muted">
        {changed === 0 ? "The AI made no changes." : `${changed} line${changed === 1 ? "" : "s"} changed. Apply puts it in the editor; nothing is saved until you press Save.`}
      </p>
      <pre className="max-h-[50dvh] overflow-auto rounded-lg border border-line bg-well py-2 font-mono text-meta leading-relaxed">
        {parts.flatMap((part, i) =>
          part.value
            .replace(/\n$/, "")
            .split("\n")
            .map((line, j) => (
              <div
                key={`${i}-${j}`}
                className={`px-3 ${part.added ? "bg-accent/15 text-text" : part.removed ? "bg-danger/15 text-danger line-through decoration-danger/50" : "text-muted"}`}
              >
                <span className="mr-2 inline-block w-3 select-none opacity-60">{part.added ? "+" : part.removed ? "−" : " "}</span>
                {line || " "}
              </div>
            )),
        )}
      </pre>
    </div>
  );
}
