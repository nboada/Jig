import type { Metadata } from "next";
import { NoteForm } from "@/components/NoteForm";

export const metadata: Metadata = { title: "New note" };

export default function NewNotePage() {
  return (
    <div>
      <NoteForm
        header={{ eyebrow: "Notes", title: "New note" }}
      />
    </div>
  );
}
