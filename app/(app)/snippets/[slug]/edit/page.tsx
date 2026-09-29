import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SnippetForm } from "@/components/SnippetForm";
import { getDb } from "@/lib/db";
import { getSnippet } from "@/lib/snippets";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Edit snippet" };

export default async function EditSnippetPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAuth();
  const { slug } = await params;
  const snippet = await getSnippet(await getDb(), slug);
  if (!snippet) notFound();
  return (
    <div>
      <SnippetForm
        snippet={snippet}
        header={{ eyebrow: "Edit snippet" }}
      />
    </div>
  );
}
