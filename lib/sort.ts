export const SORTS = [
  { id: "updated", label: "Recently edited" },
  { id: "created", label: "Newest" },
  { id: "title", label: "Title A–Z" },
] as const;

export type Sort = (typeof SORTS)[number]["id"];

export function parseSort(value: unknown): Sort {
  return SORTS.find((s) => s.id === value)?.id ?? "updated";
}

export function orderBy(alias: string, sort: Sort, relevance: string[] = [], pinnable = false): string {
  const parts = [...(pinnable ? [`(${alias}.pinned_at IS NOT NULL) DESC`] : []), ...relevance.map((r) => `${r} DESC`)];
  if (sort === "title") parts.push(`lower(${alias}.title) ASC`);
  if (sort === "created") parts.push(`${alias}.created_at DESC`);
  parts.push(`${alias}.updated_at DESC`, `${alias}.slug ASC`);
  return parts.join(", ");
}

type Sortable = { slug: string; title: string; createdAt: string; updatedAt: string; pinned?: boolean };

export function sortItems<T extends Sortable>(items: T[], sort: Sort): T[] {
  const byUpdated = (a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug);
  const compare: Record<Sort, (a: T, b: T) => number> = {
    updated: byUpdated,
    created: (a, b) => b.createdAt.localeCompare(a.createdAt) || byUpdated(a, b),
    title: (a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || byUpdated(a, b),
  };
  return [...items].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || compare[sort](a, b));
}
