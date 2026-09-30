import { familyMembers } from "./languages";

type Filterable = { slug: string; tags: string[]; language?: string };
export type Filters = { query: string; language: string; tag: string };

export function filterItems<T extends Filterable>(
  items: T[],
  filters: Filters,
  text: (item: T) => string,
  contentHits?: Set<string>,
): T[] {
  const words = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
  const languages = filters.language ? familyMembers(filters.language) : null;
  return items.filter((item) => {
    if (languages && !languages.includes(item.language ?? "")) return false;
    if (filters.tag && !item.tags.includes(filters.tag)) return false;
    if (words.length === 0) return true;
    const haystack = text(item).toLowerCase();
    return words.every((w) => haystack.includes(w)) || Boolean(contentHits?.has(item.slug));
  });
}
