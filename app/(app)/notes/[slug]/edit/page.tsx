import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NoteForm } from "@/components/NoteForm";
import { getDb } from "@/lib/db";
import { unlockedCodec } from "@/lib/locked-notes";
import { getNote } from "@/lib/notes";

export const metadata: Metadata = { title: "Edit note" };

export default async function EditNotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = await getNote(await getDb(), slug, undefined, await unlockedCodec());
  if (!note) notFound();
  // Locked and not unlocked: the note's page asks for Touch ID first.
  if (note.unreadable) redirect(`/notes/${slug}`);
  return (
    <div>
      <NoteForm
        note={note}
        header={{ eyebrow: "Edit note" }}
      />
    </div>
  );
}
