import { NoteColumn, NoteFilters } from "@/components/NoteColumn";
import { GridToolbar } from "@/components/GridToolbar";
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
  if (view === "grid") {
    return (
      <div className="@container">
        <GridToolbar section="notes" placeholder="Search notes" newLabel="New note" />
        {children}
      </div>
    );
  }
  const notes = await listNotes(await getDb(), { sort, limit: 500 });
  return (
    <NoteFilters notes={notes} sort={sort}>
      <SplitView base="/notes" column={<NoteColumn />}>
        {children}
      </SplitView>
    </NoteFilters>
  );
}
