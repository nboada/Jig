import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidSession, SESSION_COOKIE } from "./session";

/** Guards server actions and pages; the proxy only does the optimistic redirect. */
export async function requireAuth() {
  const store = await cookies();
  if (!(await isValidSession(store.get(SESSION_COOKIE)?.value))) redirect("/login");
}
