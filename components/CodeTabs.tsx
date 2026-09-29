"use client";

import { useId, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";

export type RenderedFile = { name: string; content: string; html: string; lines: number; bytes: number };

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
}

/**
 * The code panel: a tab bar (just the name for one file), the file's size, Copy, and the code. The
 * tabs follow the ARIA tabs pattern: one tab stop, ←/→ (and Home/End) move between files.
 */
export function CodeTabs({ files }: { files: RenderedFile[] }) {
  const [index, setIndex] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.min(index, files.length - 1);
  const file = files[current];
  if (!file) return null;

  function onKeyDown(event: React.KeyboardEvent) {
    const last = files.length - 1;
    const next =
      event.key === "ArrowRight" ? (current === last ? 0 : current + 1)
      : event.key === "ArrowLeft" ? (current === 0 ? last : current - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    setIndex(next);
    tabs.current[next]?.focus();
  }
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-well">
      <div className="flex items-stretch gap-1 border-b border-raised bg-strip pr-2 pl-1">
        <div
          role={files.length > 1 ? "tablist" : undefined}
          aria-label={files.length > 1 ? "Files" : undefined}
          onKeyDown={files.length > 1 ? onKeyDown : undefined}
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        >
          {files.map((f, i) => {
            const active = f === file;
            return files.length > 1 ? (
              <button
                key={f.name}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${i}`}
                aria-selected={active}
                aria-controls={`${id}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => setIndex(i)}
                className={`relative h-10 shrink-0 px-3.5 font-mono text-[12.5px] transition ${active ? "text-text" : "text-muted hover:text-text"}`}
              >
                {f.name}
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />}
              </button>
            ) : (
              <span key={f.name} className="flex h-10 items-center truncate px-3.5 font-mono text-[12.5px] text-text">
                {f.name}
              </span>
            );
          })}
        </div>
        <span className="hidden shrink-0 items-center pr-1 font-mono text-meta text-faint sm:flex">{`${file.lines} line${file.lines === 1 ? "" : "s"} · ${size(file.bytes)}`}</span>
        <span className="flex items-center">
          <CopyButton value={file.content} />
        </span>
      </div>
      <div
        id={`${id}-panel`}
        role={files.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={files.length > 1 ? `${id}-tab-${current}` : undefined}
        dangerouslySetInnerHTML={{ __html: file.html }}
      />
    </figure>
  );
}
