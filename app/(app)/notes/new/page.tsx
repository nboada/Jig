import type { Metadata } from "next";
import { NoteForm } from "@/components/NoteForm";

export const metadata: Metadata = { title: "New note" };

export default function NewNotePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New note</h1>
      <NoteForm />
    </div>
  );
}
