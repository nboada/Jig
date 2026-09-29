import type { Metadata } from "next";
import { BackLink } from "@/components/BackLink";
import { SnippetForm } from "@/components/SnippetForm";

export const metadata: Metadata = { title: "New snippet" };

export default function NewSnippetPage() {
  return (
    <div className="max-w-4xl space-y-6 @6xl:mx-auto">
      <div>
        <BackLink href="/snippets">Snippets</BackLink>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New snippet</h1>
      </div>
      <SnippetForm />
    </div>
  );
}
