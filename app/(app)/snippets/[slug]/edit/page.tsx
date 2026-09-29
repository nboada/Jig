import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SnippetForm } from "@/components/SnippetForm";
import { getDb } from "@/lib/db";
import { getSnippet } from "@/lib/snippets";

export const metadata: Metadata = { title: "Edit snippet" };

export default async function EditSnippetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snippet = await getSnippet(await getDb(), slug);
  if (!snippet) notFound();
  return (
    <div>
      <SnippetForm
        snippet={snippet}
        header={{
          eyebrow: "Edit snippet",
          title: snippet.title,
          description: `Saving creates version ${snippet.currentVersion + 1}. Every earlier version stays in the history.`,
        }}
      />
    </div>
  );
}
