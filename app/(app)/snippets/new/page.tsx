import type { Metadata } from "next";
import { SnippetForm } from "@/components/SnippetForm";

export const metadata: Metadata = { title: "New snippet" };

export default function NewSnippetPage() {
  return (
    <div>
      <SnippetForm
        header={{ eyebrow: "Snippets", title: "New snippet" }}
      />
    </div>
  );
}
