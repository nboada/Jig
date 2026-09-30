import type { Metadata } from "next";
import { SnippetForm } from "@/components/SnippetForm";
import { requireAuth } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";

export const metadata: Metadata = { title: "New snippet" };

export default async function NewSnippetPage() {
  await requireAuth();
  return (
    <div>
      <SnippetForm
        ai={await aiEnabled()}
        header={{ eyebrow: "New snippet" }}
      />
    </div>
  );
}
