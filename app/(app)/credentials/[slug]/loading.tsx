/** Shown in the pane the moment a credential is picked, while it loads. */
export default function LoadingCredential() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="flex items-start justify-between gap-4">
        <div className="h-8 w-1/2 rounded bg-raised" />
        <div className="h-8 w-16 rounded bg-raised" />
      </div>
      <div className="h-40 rounded-lg border border-line bg-panel" />
    </div>
  );
}
