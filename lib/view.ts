import { cookies } from "next/headers";
import { prefCookie, type Section, type View } from "./prefs";
import { parseSort, type Sort } from "./sort";

export type { View };

const LEGACY_VIEW_COOKIE = "jig-view";

export async function getListPrefs(section: Section, urlSort?: string): Promise<{ view: View; sort: Sort }> {
  const jar = await cookies();
  const view = jar.get(prefCookie("view", section))?.value ?? jar.get(LEGACY_VIEW_COOKIE)?.value;
  return {
    view: view === "list" ? "list" : "grid",
    sort: parseSort(urlSort ?? jar.get(prefCookie("sort", section))?.value),
  };
}
