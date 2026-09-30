import { NoteColumn, NoteFilters } from "@/components/NoteColumn";
import { GridToolbar } from "@/components/GridToolbar";
import { SplitView } from "@/components/SplitView";
import { getDb } from "@/lib/db";
import { listNotes } from "@/lib/notes";
import { getListPrefs } from "@/lib/view";
import { requireAuth } from "@/lib/auth";
import { isUnlocked } from "@/lib/locked-notes";

export default async function NotesLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  const { view, sort } = await getListPrefs("notes");
  if (view === "grid") {
    return (
      <div className="@container">
        <GridToolbar section="notes" placeholder="Search notes" newLabel="New note" />
        {children}
      </div>
    );
  }
  const [notes, unlocked] = await Promise.all([listNotes(await getDb(), { sort, limit: 500 }), isUnlocked()]);
  return (
    <NoteFilters notes={notes} sort={sort} unlocked={unlocked}>
      <SplitView base="/notes" column={<NoteColumn />}>
        {children}
      </SplitView>
    </NoteFilters>
  );
}
