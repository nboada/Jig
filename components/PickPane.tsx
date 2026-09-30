import { EmptyState } from "@/components/EmptyState";
import { Kbd } from "@/components/Kbd";
import { OpenFirst } from "@/components/OpenFirst";

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
