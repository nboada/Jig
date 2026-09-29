"use server";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { prefCookie, type Section, type View } from "@/lib/prefs";
import { renameForTitle } from "@/lib/slug";
import { getDb } from "@/lib/db";
import { checkPassword, createSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { checkLogin, clearFailures, clientIpFrom, recordFailure } from "@/lib/ratelimit";
import { cloneSnippet, createSnippet, deleteSnippet, listSnippets, restoreVersion, setSnippetPinned, SnippetError, updateSnippet } from "@/lib/snippets";
import { cloneNote, createNote, deleteNote, listNotes, restoreNoteVersion, setNotePinned, updateNote } from "@/lib/notes";
import { createCredential, deleteCredential, listCredentials, revealField, updateCredential } from "@/lib/credentials";
import { CredentialsUnavailable, DecryptError, encryptionReady } from "@/lib/crypto";
import { withEncryptionKey } from "@/lib/envfile";
import { createShare, listShares, revokeShare, type Share, type ShareKind, type ShareOptions } from "@/lib/shares";
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
    await recordFailure(db, ip);
    const { blocked, retryAfterMinutes } = await checkLogin(db, ip);
    if (blocked) {
      return { error: `Too many attempts, try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.` };
    }
    if (!checkPassword(String(form.get("password") ?? ""))) {
      return { error: "Wrong password." };
    }
    await clearFailures(db, ip);
  } catch (error) {
    // Refuse rather than allow unlimited guesses when the check itself fails.
    console.error("[jig] login check failed", error);
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
    // Files still on the generic snippet.* name take the title's, e.g. same-height-divs.js.
    if (Array.isArray(data.files) && typeof data.title === "string") {
      data.files = renameForTitle(data.files, "", data.title);
    }
    const db = await getDb();
    if (slug) {
      const { snippet } = await updateSnippet(db, slug, data);
      target = snippet.slug;
    } else {
      target = (await createSnippet(db, data)).slug;
    }
  } catch (error) {
    if (error instanceof SnippetError) return { error: error.message };
    console.error("[jig] save failed", error);
    return { error: "Could not save the snippet. Try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/snippets/${target}`);
}

export async function removeSnippet(form: FormData) {
  await requireAuth();
  await deleteSnippet(await getDb(), String(form.get("slug")));
  revalidatePath("/", "layout");
  redirect("/snippets");
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

/** The note form posts its fields as one JSON blob, like the snippet form. */
export async function saveNote(_: FormState, form: FormData): Promise<FormState> {
  await requireAuth();
  const slug = String(form.get("slug") ?? "");
  let target: string;
  try {
    const data = JSON.parse(String(form.get("payload") ?? "{}"));
    const db = await getDb();
    target = slug ? (await updateNote(db, slug, data)).note.slug : (await createNote(db, data)).slug;
  } catch (error) {
    if (error instanceof SnippetError) return { error: error.message };
    console.error("[jig] note save failed", error);
    return { error: "Could not save the note. Try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/notes/${target}`);
}

export async function removeNote(form: FormData) {
  await requireAuth();
  await deleteNote(await getDb(), String(form.get("slug")));
  revalidatePath("/", "layout");
  redirect("/notes");
}

export async function restoreNote(form: FormData) {
  await requireAuth();
  const slug = String(form.get("slug"));
  await restoreNoteVersion(await getDb(), slug, Number(form.get("version")));
  revalidatePath("/", "layout");
  redirect(`/notes/${slug}/history`);
}

export async function saveCredential(_: FormState, form: FormData): Promise<FormState> {
  await requireAuth();
  const slug = String(form.get("slug") ?? "");
  let target: string;
  try {
    const data = JSON.parse(String(form.get("payload") ?? "{}"));
    const db = await getDb();
    target = (slug ? await updateCredential(db, slug, data) : await createCredential(db, data)).slug;
  } catch (error) {
    if (error instanceof SnippetError || error instanceof CredentialsUnavailable) return { error: error.message };
    console.error("[jig] credential save failed", error);
    return { error: "Could not save the credential. Try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/credentials/${target}`);
}

export async function removeCredential(form: FormData) {
  await requireAuth();
  await deleteCredential(await getDb(), String(form.get("slug")));
  revalidatePath("/", "layout");
  redirect("/credentials");
}

/** Decrypts one secret for the Reveal and Copy buttons. */
export async function revealSecret(slug: string, fieldId: string): Promise<{ value?: string; error?: string }> {
  await requireAuth();
  try {
    return { value: await revealField(await getDb(), String(slug), String(fieldId)) };
  } catch (error) {
    if (error instanceof SnippetError || error instanceof DecryptError || error instanceof CredentialsUnavailable) {
      return { error: error.message };
    }
    console.error("[jig] reveal failed", error);
    return { error: "Could not reveal this value. Try again." };
  }
}

/**
 * Local development only: writes a new encryption key into .env.local and
 * starts using it straight away. A deployed server can't change its own
 * environment, so there the page generates a key for the user to add instead.
 */
export async function createEncryptionKey(): Promise<{ error?: string }> {
  await requireAuth();
  if (process.env.NODE_ENV === "production") {
    return { error: "A deployed server can't change its own settings. Add the key to your host's environment variables." };
  }
  if (encryptionReady()) return {};
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const file = join(process.cwd(), ".env.local");
  try {
    let current = "";
    try {
      current = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const next = withEncryptionKey(current, key);
    if (next === null) {
      return {
        error: ".env.local already sets JIG_ENCRYPTION_KEY, but it isn't a valid key. Fix or remove that line, then restart the server.",
      };
    }
    await writeFile(file, next, { mode: 0o600 });
  } catch (error) {
    console.error("[jig] could not write .env.local", error);
    return { error: "Could not write .env.local. Add the key to it yourself, then restart the server." };
  }
  process.env.JIG_ENCRYPTION_KEY = key;
  revalidatePath("/", "layout");
  return {};
}

/** Slugs of the snippets matching a search, code included, for the snippet list's search box. */
export async function searchSnippetSlugs(query: string): Promise<string[]> {
  await requireAuth();
  const found = await listSnippets(await getDb(), { query, limit: 500 });
  return found.map((s) => s.slug);
}

/** Slugs of the notes matching a search, full text included, for the note list's search box. */
export async function searchNoteSlugs(query: string): Promise<string[]> {
  await requireAuth();
  const found = await listNotes(await getDb(), { query, limit: 500 });
  return found.map((n) => n.slug);
}

/**
 * Slugs of the credentials matching a search, for the credential list's search box. Like the
 * list itself it matches titles, URLs, tags, labels, notes and non-secret values, never secrets.
 */
export async function searchCredentialSlugs(query: string): Promise<string[]> {
  await requireAuth();
  const found = await listCredentials(await getDb(), { query, limit: 500 });
  return found.map((c) => c.slug);
}

/** Copies a snippet or note from the list's right-click menu; returns the copy's slug to open. */
export async function cloneItem(kind: "snippets" | "notes", slug: string): Promise<string> {
  await requireAuth();
  const db = await getDb();
  const copy = kind === "snippets" ? await cloneSnippet(db, slug) : await cloneNote(db, slug);
  revalidatePath("/", "layout");
  return copy.slug;
}

/**
 * Deletes an item from the list's right-click menu. Unlike the item page's delete, it does not
 * redirect: the menu decides where to go (nowhere, unless the deleted item was open).
 */
export async function deleteItem(kind: "snippets" | "notes" | "credentials", slug: string): Promise<void> {
  await requireAuth();
  const db = await getDb();
  if (kind === "snippets") await deleteSnippet(db, slug);
  else if (kind === "notes") await deleteNote(db, slug);
  else await deleteCredential(db, slug);
  revalidatePath("/", "layout");
}

/** Pins a snippet or note to the top of its list, or unpins it. */
export async function setPinned(kind: "snippets" | "notes", slug: string, pinned: boolean): Promise<void> {
  await requireAuth();
  const db = await getDb();
  if (kind === "snippets") await setSnippetPinned(db, slug, pinned);
  else await setNotePinned(db, slug, pinned);
  revalidatePath("/", "layout");
}

/** Makes a share link for an item. The token and passcode come back once; only hashes are kept. */
export async function createShareLink(
  kind: ShareKind,
  slug: string,
  options: ShareOptions,
): Promise<{ token: string; passcode?: string } | { error: string }> {
  await requireAuth();
  try {
    const { token, passcode } = await createShare(await getDb(), kind, slug, options);
    return { token, passcode };
  } catch (error) {
    if (error instanceof SnippetError) return { error: error.message };
    throw error;
  }
}

/** An item's share links, for the share dialog. */
export async function listItemShares(kind: ShareKind, slug: string): Promise<Share[]> {
  await requireAuth();
  return listShares(await getDb(), kind, slug);
}

export async function revokeShareLink(id: string): Promise<void> {
  await requireAuth();
  await revokeShare(await getDb(), id);
}

/**
 * Saves a list page's grid/list choice and redraws its layout (the split view lives in the
 * section's layout, which a plain navigation doesn't re-render). With `goTo`, lands there too.
 */
export async function setViewPreference(section: Section, view: View, goTo?: string): Promise<void> {
  await requireAuth();
  (await cookies()).set(prefCookie("view", section), view, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  revalidatePath("/", "layout");
  if (goTo) redirect(goTo);
}
