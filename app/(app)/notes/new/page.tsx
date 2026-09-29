import type { Metadata } from "next";
import { BackLink } from "@/components/BackLink";
import { NoteForm } from "@/components/NoteForm";

export const metadata: Metadata = { title: "New note" };

export default function NewNotePage() {
  return (
    <div className="max-w-4xl space-y-6 @6xl:mx-auto">
      <div>
        <BackLink href="/notes">Notes</BackLink>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New note</h1>
      </div>
      <NoteForm />
    </div>
  );
}
