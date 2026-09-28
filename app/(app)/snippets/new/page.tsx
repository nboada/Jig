import type { Metadata } from "next";
import { SnippetForm } from "@/components/SnippetForm";

export const metadata: Metadata = { title: "New snippet" };

export default function NewSnippetPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New snippet</h1>
      <SnippetForm />
    </div>
  );
}
