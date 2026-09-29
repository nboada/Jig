import { SnippetColumn, SnippetFilters } from "@/components/SnippetColumn";
import { GridToolbar } from "@/components/GridToolbar";
import { SplitView } from "@/components/SplitView";
import { getDb } from "@/lib/db";
import { listSnippets } from "@/lib/snippets";
import { getListPrefs } from "@/lib/view";
import { requireAuth } from "@/lib/auth";

/**
 * In list view, snippets open beside a column listing them all, which stays put while you move
 * between them. In grid view the pages get the full width as before.
 */
export default async function SnippetsLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  const { view, sort } = await getListPrefs("snippets");
  if (view === "grid") {
    return (
      <div className="@container">
        <GridToolbar section="snippets" placeholder="Search titles, tags and code" newLabel="New snippet" languageFilter />
        {children}
      </div>
    );
  }
  const snippets = await listSnippets(await getDb(), { sort, limit: 500 });
  return (
    <SnippetFilters snippets={snippets} sort={sort}>
      <SplitView base="/snippets" column={<SnippetColumn />}>
        {children}
      </SplitView>
    </SnippetFilters>
  );
}
