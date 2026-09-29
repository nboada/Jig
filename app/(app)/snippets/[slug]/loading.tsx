/** Shown in the pane the moment a snippet is picked, while it loads. */
export default function LoadingSnippet() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="h-4 w-20 rounded bg-raised" />
      <div className="flex items-start justify-between gap-4">
        <div className="h-8 w-2/3 rounded bg-raised" />
        <div className="h-8 w-32 rounded bg-raised" />
      </div>
      <div className="h-72 rounded-lg border border-line bg-panel" />
    </div>
  );
}
