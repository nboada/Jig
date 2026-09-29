"use client";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";

export type RenderedFile = { name: string; content: string; html: string; lines: number; bytes: number };

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
}

/** The code panel: a tab bar (just the name for one file), the file's size, Copy, and the code. */
export function CodeTabs({ files }: { files: RenderedFile[] }) {
  const [index, setIndex] = useState(0);
  const file = files[Math.min(index, files.length - 1)];
  if (!file) return null;
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-well">
      <div className="flex items-stretch gap-1 border-b border-raised bg-[#0e0f11] pr-2 pl-1">
        <div role={files.length > 1 ? "tablist" : undefined} className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {files.map((f, i) => {
            const active = f === file;
            return files.length > 1 ? (
              <button
                key={f.name}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setIndex(i)}
                className={`relative h-10 shrink-0 px-3.5 font-mono text-[12.5px] transition ${active ? "text-text" : "text-muted hover:text-text"}`}
              >
                {f.name}
                {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
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
      <div role={files.length > 1 ? "tabpanel" : undefined} dangerouslySetInnerHTML={{ __html: file.html }} />
    </figure>
  );
}
