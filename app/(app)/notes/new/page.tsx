import type { Metadata } from "next";
import { NoteForm } from "@/components/NoteForm";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "New note" };

export default async function NewNotePage() {
  await requireAuth();
  return (
    <div>
      <NoteForm
        header={{ eyebrow: "New note" }}
      />
    </div>
  );
}
