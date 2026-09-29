/** Shown in the pane the moment a note is picked, while it loads. */
export default function LoadingNote() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="h-4 w-16 rounded bg-raised" />
      <div className="flex items-start justify-between gap-4">
        <div className="h-8 w-2/3 rounded bg-raised" />
        <div className="h-8 w-32 rounded bg-raised" />
      </div>
      <div className="h-64 rounded-lg border border-line bg-panel" />
    </div>
  );
}
