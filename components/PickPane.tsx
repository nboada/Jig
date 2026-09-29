/** The split view's right-hand pane before anything is picked. */
export function PickPane({ noun }: { noun: string }) {
  return (
    <div className="grid h-[calc(100dvh-7.5rem)] place-items-center rounded-lg border border-dashed border-line text-center">
      <div>
        <p className="font-medium">{`Pick a ${noun}`}</p>
        <p className="mt-1 text-sm text-muted">{`Use ↑ and ↓ to move through the list, or press N for a new one.`}</p>
      </div>
    </div>
  );
}
