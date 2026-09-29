/** The orders every list can be shown in. The first is the default. */
export const SORTS = [
  { id: "updated", label: "Recently edited" },
  { id: "created", label: "Newest" },
  { id: "title", label: "Title A–Z" },
] as const;

export type Sort = (typeof SORTS)[number]["id"];

/** A sort from a URL value, falling back to the default for anything unknown. */
export function parseSort(value: unknown): Sort {
  return SORTS.find((s) => s.id === value)?.id ?? "updated";
}

/**
 * The ORDER BY list for a table alias: pinned rows first (for tables with pinned_at), then search
 * relevance (expressions that are true for better matches), then the chosen order, with the most
 * recent edit and then the slug breaking ties, so equal timestamps list the same way every time.
 */
export function orderBy(alias: string, sort: Sort, relevance: string[] = [], pinnable = false): string {
  const parts = [...(pinnable ? [`(${alias}.pinned_at IS NOT NULL) DESC`] : []), ...relevance.map((r) => `${r} DESC`)];
  if (sort === "title") parts.push(`lower(${alias}.title) ASC`);
  if (sort === "created") parts.push(`${alias}.created_at DESC`);
  parts.push(`${alias}.updated_at DESC`, `${alias}.slug ASC`);
  return parts.join(", ");
}

type Sortable = { slug: string; title: string; createdAt: string; updatedAt: string; pinned?: boolean };

/**
 * The same order as orderBy, in the browser, so a list that already holds every item can
 * re-sort instantly. ISO timestamps compare correctly as strings.
 */
export function sortItems<T extends Sortable>(items: T[], sort: Sort): T[] {
  const byUpdated = (a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug);
  const compare: Record<Sort, (a: T, b: T) => number> = {
    updated: byUpdated,
    created: (a, b) => b.createdAt.localeCompare(a.createdAt) || byUpdated(a, b),
    title: (a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || byUpdated(a, b),
  };
  // Pinned first, as in orderBy; the chosen order applies within each group.
  return [...items].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || compare[sort](a, b));
}
