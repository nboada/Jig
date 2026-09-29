import type { Metadata } from "next";
import Link from "next/link";
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/notes/${slug}`} className="text-sm text-muted hover:text-text">
          {`Back to ${note.title}`}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Edit note</h1>
        <p className="mt-1 text-sm text-muted">
          {`Saving creates version ${note.currentVersion + 1}. Every earlier version stays in the history.`}
        </p>
      </div>
      <NoteForm note={note} />
    </div>
  );
}
