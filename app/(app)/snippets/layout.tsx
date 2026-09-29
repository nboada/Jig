import { Suspense } from "react";
import { SnippetColumn, SnippetFilters, SnippetToolbar } from "@/components/SnippetColumn";
import { SplitView } from "@/components/SplitView";
import { getDb } from "@/lib/db";
import { listSnippets } from "@/lib/snippets";
import { getListPrefs } from "@/lib/view";

/**
 * In list view, snippets open beside a column listing them all, which stays put while you move
 * between them. In grid view the pages get the full width as before.
 */
export default async function SnippetsLayout({ children }: { children: React.ReactNode }) {
  const { view, sort } = await getListPrefs("snippets");
  if (view === "grid") return <div className="@container">{children}</div>;
  const snippets = await listSnippets(await getDb(), { sort, limit: 500 });
  return (
    // The filters read ?q= and friends from the URL, which needs a Suspense boundary.
    <Suspense>
      <SnippetFilters snippets={snippets} sort={sort}>
        <SplitView base="/snippets" toolbar={<SnippetToolbar />} column={<SnippetColumn />}>
          {children}
        </SplitView>
      </SnippetFilters>
    </Suspense>
  );
}
