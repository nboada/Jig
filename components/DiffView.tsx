import type { VersionDiff } from "@/lib/diff";

const ROW = {
  hunk: "bg-raised text-muted",
  add: "bg-add text-add-text",
  del: "bg-del text-del-text",
  ctx: "text-text/80",
} as const;

const SIGN = { hunk: "", add: "+", del: "-", ctx: " " } as const;

export function DiffView({ diff }: { diff: VersionDiff }) {
  const files = diff.files.filter((f) => f.status !== "unchanged");
  if (!files.length && !diff.fields.length) {
    return <p className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">These versions are identical.</p>;
  }
  return (
    <div className="space-y-4">
      {diff.fields.length > 0 && (
        <div className="rounded-lg border border-line bg-panel">
          <h3 className="border-b border-line px-4 py-2 text-sm font-medium">Details</h3>
          <dl className="divide-y divide-line text-sm">
            {diff.fields.map((f) => (
              <div key={f.field} className="grid gap-2 px-4 py-3 sm:grid-cols-[120px_1fr]">
                <dt className="capitalize text-muted">{f.field}</dt>
                <dd className="min-w-0 space-y-1">
                  <p className="whitespace-pre-wrap break-words text-del-text line-through decoration-del-text/40">{f.from}</p>
                  <p className="whitespace-pre-wrap break-words text-add-text">{f.to}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {files.map((file) => (
        <div key={file.name} className="overflow-hidden rounded-lg border border-line bg-panel">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 text-sm">
            <span className="truncate font-mono">{file.name}</span>
            <span className="shrink-0 font-mono text-xs">
              {file.status !== "modified" && <span className="mr-2 text-muted">{file.status}</span>}
              <span className="text-add-text">+{file.additions}</span>{" "}
              <span className="text-del-text">-{file.deletions}</span>
            </span>
          </div>
          <pre className="overflow-x-auto font-mono text-[13px] leading-6">
            {file.lines.map((line, i) => (
              <div key={i} className={`${ROW[line.kind]} min-w-max px-4`}>
                <span className="mr-3 inline-block w-3 select-none opacity-60">{SIGN[line.kind]}</span>
                {line.text || " "}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
