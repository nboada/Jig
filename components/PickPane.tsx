import { EmptyState } from "@/components/EmptyState";
import { Kbd } from "@/components/Kbd";

/** The split view's right-hand pane before anything is picked: quiet, a third of the way down. */
export function PickPane({ noun }: { noun: string }) {
  return (
    <EmptyState className="pt-[18vh]">
      <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        {" to browse · "}
        <Kbd>N</Kbd>
        {` for a new ${noun}`}
      </span>
    </EmptyState>
  );
}
