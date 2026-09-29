import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { NoteForm } from "@/components/NoteForm";
import { getDb } from "@/lib/db";
import { getNote } from "@/lib/notes";

export const metadata: Metadata = { title: "Edit note" };

export default async function EditNotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = await getNote(await getDb(), slug);
  if (!note) notFound();
  return (
    <div className="max-w-4xl space-y-6 @6xl:mx-auto">
      <div>
        <BackLink href={`/notes/${slug}`}>{note.title}</BackLink>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Edit note</h1>
        <p className="mt-1 text-sm text-muted">
          {`Saving creates version ${note.currentVersion + 1}. Every earlier version stays in the history.`}
        </p>
      </div>
      <NoteForm note={note} />
    </div>
  );
}
