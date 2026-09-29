import { Suspense } from "react";
import { NoteColumn, NoteFilters, NoteToolbar } from "@/components/NoteColumn";
import { SplitView } from "@/components/SplitView";
import { getDb } from "@/lib/db";
import { listNotes } from "@/lib/notes";
import { getListPrefs } from "@/lib/view";

/**
 * In list view, notes open beside a column listing them all, which stays put while you move
 * between them. In grid view the pages get the full width.
 */
export default async function NotesLayout({ children }: { children: React.ReactNode }) {
  const { view, sort } = await getListPrefs("notes");
  if (view === "grid") return <div className="@container">{children}</div>;
  const notes = await listNotes(await getDb(), { sort, limit: 500 });
  return (
    // The filters read ?q= and ?tag= from the URL, which needs a Suspense boundary.
    <Suspense>
      <NoteFilters notes={notes} sort={sort}>
        <SplitView base="/notes" toolbar={<NoteToolbar />} column={<NoteColumn />}>
          {children}
        </SplitView>
      </NoteFilters>
    </Suspense>
  );
}
