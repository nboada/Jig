"use client";

import { useState } from "react";
import { NoteForm } from "@/components/NoteForm";
import { SnippetForm } from "@/components/SnippetForm";

type Kind = "note" | "snippet";

export function ShareForm({ title, body, kind, ai }: { title: string; body: string; kind: Kind; ai: boolean }) {
  const [saveAs, setSaveAs] = useState(kind);
  return (
    <div className="space-y-5">
      <div className="flex w-fit gap-0.5 rounded-lg border border-line bg-well p-0.5" role="group" aria-label="Save as">
        {(["note", "snippet"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={saveAs === k}
            onClick={() => setSaveAs(k)}
            className={`h-8 rounded-md px-3 text-ui transition ${saveAs === k ? "bg-raised text-text" : "text-muted hover:text-text"}`}
          >
            {k === "note" ? "Note" : "Snippet"}
          </button>
        ))}
      </div>
      {saveAs === "note" ? (
        <NoteForm ai={ai} header={{ eyebrow: "New note" }} initial={{ title, body }} />
      ) : (
        <SnippetForm ai={ai} header={{ eyebrow: "New snippet" }} initial={{ title, content: body }} />
      )}
    </div>
  );
}
