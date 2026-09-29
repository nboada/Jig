import { cookies } from "next/headers";

export type View = "grid" | "list";

/** The cookie holding the dashboard's grid or list preference, shared by every index page. */
export const VIEW_COOKIE = "jig-view";

export async function getView(): Promise<View> {
  return (await cookies()).get(VIEW_COOKIE)?.value === "list" ? "list" : "grid";
}
