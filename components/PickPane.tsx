import { EmptyState } from "@/components/EmptyState";
import { Kbd } from "@/components/Kbd";
import { OpenFirst } from "@/components/OpenFirst";

/**
 * The split view's right-hand pane before anything is picked. It opens the first item, showing a
 * skeleton meanwhile; an empty section gets a quiet hint a third of the way down instead.
 */
export function PickPane({ noun }: { noun: string }) {
  return (
    <OpenFirst
      empty={
        <EmptyState className="pt-[18vh]">
          <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            {" to browse · "}
            <Kbd>N</Kbd>
            {` for a new ${noun}`}
          </span>
        </EmptyState>
      }
    />
  );
}
