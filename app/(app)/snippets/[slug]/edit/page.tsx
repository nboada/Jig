import type { Metadata } from "next";
import Link from "next/link";
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/snippets/${slug}`} className="text-sm text-muted hover:text-text">
          Back to {snippet.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Edit snippet</h1>
        <p className="mt-1 text-sm text-muted">
          Saving creates version {snippet.currentVersion + 1}. Every earlier version stays in the history.
        </p>
      </div>
      <SnippetForm snippet={snippet} />
    </div>
  );
}
