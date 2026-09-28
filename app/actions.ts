"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { checkPassword, createSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { checkLogin, clearFailures, clientIpFrom, recordFailure } from "@/lib/ratelimit";
import { createSnippet, deleteSnippet, restoreVersion, SnippetError, updateSnippet } from "@/lib/snippets";
import { createToken, revokeToken } from "@/lib/tokens";

export type FormState = { error?: string };

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  if (!process.env.ADMIN_PASSWORD) return { error: "ADMIN_PASSWORD is not set on the server." };
  const ip = clientIpFrom((await headers()).get("x-forwarded-for"));
  try {
    const db = await getDb();
    const { blocked, retryAfterMinutes } = await checkLogin(db, ip);
    if (blocked) {
      return { error: `Too many attempts, try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.` };
    }
    if (!checkPassword(String(form.get("password") ?? ""))) {
      await recordFailure(db, ip);
      return { error: "Wrong password." };
    }
    await clearFailures(db, ip);
  } catch (error) {
    // Refuse rather than allow unlimited guesses when the check itself fails.
    console.error("[snippeta] login check failed", error);
    return { error: "Could not check the login right now. Try again." };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/** The snippet form posts its fields as one JSON blob so the file list stays structured. */
export async function saveSnippet(_: FormState, form: FormData): Promise<FormState> {
  await requireAuth();
  const slug = String(form.get("slug") ?? "");
  let target: string;
  try {
    const data = JSON.parse(String(form.get("payload") ?? "{}"));
    const db = await getDb();
    if (slug) {
      const { snippet } = await updateSnippet(db, slug, data);
      target = snippet.slug;
    } else {
      target = (await createSnippet(db, data)).slug;
    }
  } catch (error) {
    if (error instanceof SnippetError) return { error: error.message };
    console.error("[snippeta] save failed", error);
    return { error: "Could not save the snippet. Try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/snippets/${target}`);
}

export async function removeSnippet(form: FormData) {
  await requireAuth();
  await deleteSnippet(await getDb(), String(form.get("slug")));
  revalidatePath("/", "layout");
  redirect("/");
}

export async function restore(form: FormData) {
  await requireAuth();
  const slug = String(form.get("slug"));
  await restoreVersion(await getDb(), slug, Number(form.get("version")));
  revalidatePath("/", "layout");
  redirect(`/snippets/${slug}/history`);
}

export async function newToken(_: { token?: string }, form: FormData): Promise<{ token?: string }> {
  await requireAuth();
  const { token } = await createToken(await getDb(), String(form.get("name") ?? ""));
  revalidatePath("/connect");
  return { token };
}

export async function deleteToken(form: FormData) {
  await requireAuth();
  await revokeToken(await getDb(), String(form.get("id")));
  revalidatePath("/connect");
}
