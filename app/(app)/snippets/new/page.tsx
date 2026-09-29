import type { Metadata } from "next";
import { SnippetForm } from "@/components/SnippetForm";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "New snippet" };

export default async function NewSnippetPage() {
  await requireAuth();
  return (
    <div>
      <SnippetForm
        header={{ eyebrow: "New snippet" }}
      />
    </div>
  );
}
