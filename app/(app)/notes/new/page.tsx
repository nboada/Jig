import type { Metadata } from "next";
import { NoteForm } from "@/components/NoteForm";
import { requireAuth } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";

export const metadata: Metadata = { title: "New note" };

export default async function NewNotePage() {
  await requireAuth();
  return (
    <div>
      <NoteForm
        ai={aiEnabled()}
        header={{ eyebrow: "New note" }}
      />
    </div>
  );
}
