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
 * The ORDER BY list for a table alias: search relevance first (expressions that are true for
 * better matches), then the chosen order, with the most recent edit breaking ties.
 */
export function orderBy(alias: string, sort: Sort, relevance: string[] = []): string {
  const parts = relevance.map((r) => `${r} DESC`);
  if (sort === "title") parts.push(`lower(${alias}.title) ASC`);
  if (sort === "created") parts.push(`${alias}.created_at DESC`);
  parts.push(`${alias}.updated_at DESC`, `${alias}.slug ASC`);
  return parts.join(", ");
}
