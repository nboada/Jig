import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteForm } from "@/components/NoteForm";
import { getDb } from "@/lib/db";
import { getNote } from "@/lib/notes";

export const metadata: Metadata = { title: "Edit note" };

export default async function EditNotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = await getNote(await getDb(), slug);
  if (!note) notFound();
  return (
    <div>
      <NoteForm
        note={note}
        header={{
          eyebrow: "Edit note",
          title: note.title,
          description: `Saving creates version ${note.currentVersion + 1}. Every earlier version stays in the history.`,
        }}
      />
    </div>
  );
}
