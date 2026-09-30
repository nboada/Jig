"use server";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { renewSession, requireAuth, startSession } from "@/lib/auth";
import { PREFS_SYNCED_COOKIE, prefCookie, SECTION_ORDER } from "@/lib/prefs";
import { loadSettings, saveSetting, SETTING_KEYS, validSetting } from "@/lib/settings";
import { renameForTitle } from "@/lib/slug";
import { getDb } from "@/lib/db";
import { checkPassword, endAllSessions, passwordProblem, SESSION_COOKIE } from "@/lib/session";
import { checkLogin, clearFailures, clientIpFrom, recordFailure } from "@/lib/ratelimit";
import { cloneSnippet, createSnippet, listSnippets, restoreVersion, setSnippetPinned, SnippetError, updateSnippet } from "@/lib/snippets";
import { cloneNote, createNote, getNote, listNotes, restoreNoteVersion, setNoteLocked, setNotePinned, updateNote } from "@/lib/notes";
import { isUnlocked, makeUnlock, noteCodec, UNLOCK_COOKIE, unlockedCodec } from "@/lib/locked-notes";
import {
  authenticationOptions,
  CHALLENGE_COOKIE,
  CHALLENGE_SECONDS,
  listPasskeys,
  makeChallengeCookie,
  readChallengeCookie,
  registrationOptions,
  removePasskey,
  savePasskey,
  siteFrom,
  verifyPasskey,
  type ChallengeUse,
  type Passkey,
} from "@/lib/passkeys";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { createCredential, listCredentials, revealField, updateCredential } from "@/lib/credentials";
import { CredentialsUnavailable, DecryptError, encryptionReady } from "@/lib/crypto";
import { withEncryptionKey } from "@/lib/envfile";
import { createShare, deleteShare, EXPIRIES, listShares, restoreShare, revealShare, revokeShare, type Share } from "@/lib/shares";
import { createToken, revokeToken } from "@/lib/tokens";
import { FLASH_COOKIE } from "@/lib/flash";
import { purgeItem, restoreItem, trashItem, type TrashKind } from "@/lib/trash";
import { approve, checkAuthorizeRequest, redirectError, revokeGrant } from "@/lib/oauth";
import { resourceUrlFrom } from "@/lib/oauth-http";
import { AiError, fixFile, review as reviewSnippet, rewrite, testKey, type Review, type RewriteMode } from "@/lib/ai";
import { PLATFORM_IDS, platformById } from "@/lib/ai-providers";
import { getAiSettings, removeAiKey, saveAiKey, setActivePlatform, setAiModel, type AiSettings } from "@/lib/ai-settings";

export type FormState = { error?: string };
export type Result = { error?: string };


const Slug = z.string().min(1).max(200);
const Id = z.string().min(1).max(200);
const Section = z.enum(["snippets", "notes", "credentials"]);
const Versioned = z.enum(["snippets", "notes"]);

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SnippetError("That request doesn't look right.", "invalid");
  return result.data;
}

function failure(error: unknown, fallback: string): { error: string } {
  if (error instanceof SnippetError || error instanceof DecryptError || error instanceof CredentialsUnavailable) {
    return { error: error.message };
  }
  console.error(`[jig] ${fallback}`, error);
  return { error: fallback };
}

function safeNext(value: unknown) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

async function clientIp() {
  const h = await headers();
  return clientIpFrom(h.get("x-forwarded-for"), h.get("x-real-ip"));
}

async function guardAttempt(ip: string, everywhere: boolean): Promise<string | null> {
  try {
    const db = await getDb();
    await recordFailure(db, ip);
    const { blocked, retryAfterMinutes, everywhere: forEveryone } = await checkLogin(db, ip, new Date(), { everywhere });
    if (!blocked) return null;
    console.warn(`[jig] login attempts blocked ${forEveryone ? "for every IP" : `for ${ip}`} (${retryAfterMinutes} min left)`);
    return `Too many attempts, try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`;
  } catch (error) {
    console.error("[jig] attempt check failed", error);
    return "Could not check that right now. Try again.";
  }
}

async function attemptSucceeded(ip: string) {
  await clearFailures(await getDb(), ip).catch((error) => console.error("[jig] could not clear attempts", error));
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const problem = passwordProblem();
  if (problem) return { error: problem };
  const ip = await clientIp();
  const blocked = await guardAttempt(ip, true);
  if (blocked) return { error: blocked };
  if (!checkPassword(String(form.get("password") ?? ""))) return { error: "Wrong password." };
  await attemptSucceeded(ip);
  await signIn();
  redirect(safeNext(form.get("next")));
}

async function signIn() {
  await startSession();
  await applyStoredPreferences().catch((error) => console.error("[jig] could not load preferences", error));
}

async function flash(message: string) {
  (await cookies()).set(FLASH_COOKIE, message, { path: "/", maxAge: 60, sameSite: "lax" });
}

const PREF_COOKIE = { path: "/", maxAge: 31_536_000, sameSite: "lax" as const };
const SYNC_SECONDS = 5 * 60;

async function applyStoredPreferences(): Promise<boolean> {
  const store = await cookies();
  const db = await getDb();
  const saved = await loadSettings(db);
  for (const key of SETTING_KEYS) {
    const local = store.get(key)?.value;
    if (!(key in saved) && local && validSetting(key, local)) await saveSetting(db, key, local);
  }
  let changed = false;
  for (const [key, value] of Object.entries(saved)) {
    if (store.get(key)?.value === value) continue;
    store.set(key, value, PREF_COOKIE);
    changed = true;
  }
  store.set(PREFS_SYNCED_COOKIE, "1", { path: "/", maxAge: SYNC_SECONDS, sameSite: "lax" });
  return changed;
}

export async function syncPreferences(): Promise<boolean> {
  const session = await requireAuth();
  try {
    await renewSession(session);
    return await applyStoredPreferences();
  } catch (error) {
    console.error("[jig] preference sync failed", error);
    return false;
  }
}

export async function savePreference(key: string, value: string): Promise<void> {
  await requireAuth();
  if (typeof key !== "string" || typeof value !== "string" || !validSetting(key, value)) return;
  (await cookies()).set(key, value, PREF_COOKIE);
  await saveSetting(await getDb(), key, value);
}

async function forgetThisBrowser() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(UNLOCK_COOKIE);
  store.delete(CHALLENGE_COOKIE);
}

export async function logout() {
  await forgetThisBrowser();
  redirect("/login");
}

export async function signOutEverywhere() {
  await requireAuth();
  await endAllSessions(await getDb());
  await forgetThisBrowser();
  redirect("/login");
}

export async function saveSnippet(_: FormState, form: FormData): Promise<FormState> {
  await requireAuth();
  const slug = String(form.get("slug") ?? "");
  let target: string;
  try {
    const data = JSON.parse(String(form.get("payload") ?? "{}"));
    if (Array.isArray(data.files) && typeof data.title === "string") {
      data.files = renameForTitle(data.files, "", data.title);
    }
    const db = await getDb();
    if (slug) {
      const { snippet, changed } = await updateSnippet(db, slug, data);
      target = snippet.slug;
      await flash(changed ? "Snippet saved" : "No changes to save");
    } else {
      target = (await createSnippet(db, data)).slug;
      await flash("Snippet created");
    }
  } catch (error) {
    return failure(error, "Could not save the snippet. Try again.");
  }
  revalidatePath("/", "layout");
  redirect(`/snippets/${target}`);
}

export async function restore(form: FormData) {
  await requireAuth();
  const slug = String(form.get("slug"));
  await restoreVersion(await getDb(), slug, Number(form.get("version")));
  await flash(`Version ${Number(form.get("version"))} restored`);
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

export async function saveNote(_: FormState, form: FormData): Promise<FormState> {
  await requireAuth();
  const slug = String(form.get("slug") ?? "");
  let target: string;
  try {
    const data = JSON.parse(String(form.get("payload") ?? "{}"));
    const db = await getDb();
    if (slug) {
      const { note, changed } = await updateNote(db, slug, data, "web", await unlockedCodec());
      target = note.slug;
      await flash(changed ? "Note saved" : "No changes to save");
    } else {
      target = (await createNote(db, data)).slug;
      await flash("Note created");
    }
  } catch (error) {
    return failure(error, "Could not save the note. Try again.");
  }
  revalidatePath("/", "layout");
  redirect(`/notes/${target}`);
}

export async function restoreNote(form: FormData) {
  await requireAuth();
  const slug = String(form.get("slug"));
  await restoreNoteVersion(await getDb(), slug, Number(form.get("version")), "web", undefined, await unlockedCodec());
  await flash(`Version ${Number(form.get("version"))} restored`);
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
    await flash(slug ? "Credential saved" : "Credential created");
  } catch (error) {
    return failure(error, "Could not save the credential. Try again.");
  }
  revalidatePath("/", "layout");
  redirect(`/credentials/${target}`);
}

const LOCKED = "Unlock first: secrets need your passkey or password.";

export async function revealSecret(slug: string, fieldId: string): Promise<{ value?: string; error?: string; locked?: boolean }> {
  await requireAuth();
  if (!(await isUnlocked())) return { error: LOCKED, locked: true };
  try {
    return { value: await revealField(await getDb(), parse(Slug, slug), parse(Id, fieldId)) };
  } catch (error) {
    return failure(error, "Could not reveal this value. Try again.");
  }
}

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
  await startSession();
  revalidatePath("/", "layout");
  return {};
}

export async function searchSnippetSlugs(query: string): Promise<string[]> {
  await requireAuth();
  const found = await listSnippets(await getDb(), { query: String(query).slice(0, 500), limit: 500 });
  return found.map((s) => s.slug);
}

export async function searchNoteSlugs(query: string): Promise<string[]> {
  await requireAuth();
  const found = await listNotes(await getDb(), { query: String(query).slice(0, 500), limit: 500 });
  return found.map((n) => n.slug);
}

export async function searchCredentialSlugs(query: string): Promise<string[]> {
  await requireAuth();
  const found = await listCredentials(await getDb(), { query: String(query).slice(0, 500), limit: 500 });
  return found.map((c) => c.slug);
}

export async function cloneItem(kind: "snippets" | "notes", slug: string): Promise<{ slug?: string; error?: string }> {
  await requireAuth();
  try {
    const db = await getDb();
    const copy = parse(Versioned, kind) === "snippets" ? await cloneSnippet(db, parse(Slug, slug)) : await cloneNote(db, parse(Slug, slug));
    revalidatePath("/", "layout");
    return { slug: copy.slug };
  } catch (error) {
    return failure(error, "Could not make the copy. Try again.");
  }
}

export async function deleteItem(kind: TrashKind, slug: string): Promise<Result & { id?: string }> {
  await requireAuth();
  let id: string;
  try {
    id = await trashItem(await getDb(), parse(Section, kind), parse(Slug, slug));
  } catch (error) {
    return failure(error, "Could not delete it. Try again.");
  }
  revalidatePath("/", "layout");
  return { id };
}

export async function restoreDeleted(id: string): Promise<Result & { kind?: TrashKind; slug?: string }> {
  await requireAuth();
  let restored: { kind: TrashKind; slug: string };
  try {
    restored = await restoreItem(await getDb(), parse(Id, id));
  } catch (error) {
    return failure(error, "Could not restore it. Try again.");
  }
  revalidatePath("/", "layout");
  return restored;
}

export async function purgeDeleted(id: string): Promise<Result> {
  await requireAuth();
  try {
    await purgeItem(await getDb(), parse(Id, id));
  } catch (error) {
    return failure(error, "Could not delete it. Try again.");
  }
  revalidatePath("/", "layout");
  return {};
}

export async function setPinned(kind: "snippets" | "notes", slug: string, pinned: boolean): Promise<Result> {
  await requireAuth();
  try {
    const db = await getDb();
    const target = parse(Slug, slug);
    if (parse(Versioned, kind) === "snippets") await setSnippetPinned(db, target, parse(z.boolean(), pinned));
    else await setNotePinned(db, target, parse(z.boolean(), pinned));
  } catch (error) {
    return failure(error, "Could not change the pin. Try again.");
  }
  revalidatePath("/", "layout");
  return {};
}

const ShareOptionsSchema = z.object({
  expiry: z.enum(Object.keys(EXPIRIES) as [keyof typeof EXPIRIES, ...(keyof typeof EXPIRIES)[]]),
  maxViews: z.number().int().min(1).max(100).nullable(),
  label: z.string().max(200).optional(),
});

export async function createShareLink(
  kind: "snippets" | "notes" | "credentials",
  slug: string,
  options: z.infer<typeof ShareOptionsSchema>,
): Promise<{ token: string; passcode?: string } | { error: string; locked?: boolean }> {
  await requireAuth();
  try {
    const section = parse(Section, kind);
    if (section === "credentials" && !(await isUnlocked())) return { error: LOCKED, locked: true };
    const { token, passcode } = await createShare(await getDb(), section, parse(Slug, slug), parse(ShareOptionsSchema, options));
    return { token, passcode };
  } catch (error) {
    return failure(error, "Could not make the link. Try again.");
  }
}

export async function listItemShares(kind: "snippets" | "notes" | "credentials", slug: string): Promise<Share[]> {
  await requireAuth();
  return listShares(await getDb(), parse(Section, kind), parse(Slug, slug));
}

export async function revealShareLink(id: string): Promise<{ token?: string; passcode?: string; error?: string; locked?: boolean }> {
  await requireAuth();
  try {
    const { kind, token, passcode } = await revealShare(await getDb(), parse(Id, id));
    if (kind === "credentials" && !(await isUnlocked())) return { error: LOCKED, locked: true };
    return { token, passcode };
  } catch (error) {
    return failure(error, "Could not copy the link. Try again.");
  }
}

export async function deleteShareLink(id: string): Promise<Result> {
  await requireAuth();
  try {
    await deleteShare(await getDb(), parse(Id, id));
    return {};
  } catch (error) {
    return failure(error, "Could not delete the link. Try again.");
  }
}

export async function restoreShareLink(id: string): Promise<Result> {
  await requireAuth();
  try {
    await restoreShare(await getDb(), parse(Id, id));
    return {};
  } catch (error) {
    return failure(error, "Could not turn the link back on. Try again.");
  }
}

export async function revokeShareLink(id: string): Promise<Result> {
  await requireAuth();
  try {
    await revokeShare(await getDb(), parse(Id, id));
    return {};
  } catch (error) {
    return failure(error, "Could not turn the link off. Try again.");
  }
}

export async function setViewPreference(section: string, view: string, goTo?: string): Promise<void> {
  await requireAuth();
  if (!SECTION_ORDER.includes(section as never) || (view !== "grid" && view !== "list")) return;
  const key = prefCookie("view", section as (typeof SECTION_ORDER)[number]);
  (await cookies()).set(key, view, PREF_COOKIE);
  await saveSetting(await getDb(), key, view);
  revalidatePath("/", "layout");
  if (goTo !== undefined) redirect(safeNext(goTo));
}


async function site() {
  const h = await headers();
  return siteFrom(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
}

const shortCookie = (maxAge?: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  ...(maxAge ? { maxAge } : {}),
  path: "/",
});

async function rememberChallenge(use: ChallengeUse, challenge: string) {
  (await cookies()).set(CHALLENGE_COOKIE, await makeChallengeCookie(await getDb(), use, challenge), shortCookie(CHALLENGE_SECONDS));
}

async function takeChallenge(use: ChallengeUse): Promise<string | null> {
  const store = await cookies();
  const challenge = await readChallengeCookie(await getDb(), use, store.get(CHALLENGE_COOKIE)?.value);
  store.delete(CHALLENGE_COOKIE);
  return challenge;
}

export async function myPasskeys(): Promise<Passkey[]> {
  await requireAuth();
  return listPasskeys(await getDb());
}

export async function passkeySetupOptions() {
  await requireAuth();
  const options = await registrationOptions(await getDb(), await site());
  await rememberChallenge("register", options.challenge);
  return options;
}

export async function addPasskey(response: RegistrationResponseJSON, name: string): Promise<{ error?: string }> {
  await requireAuth();
  const challenge = await takeChallenge("register");
  if (!challenge) return { error: "That took too long. Try again." };
  try {
    await savePasskey(await getDb(), await site(), response, challenge, String(name));
  } catch (error) {
    console.error("[jig] passkey setup failed", error);
    return { error: "The passkey couldn't be added. Try again." };
  }
  return {};
}

export async function deletePasskey(id: string): Promise<void> {
  await requireAuth();
  await removePasskey(await getDb(), parse(Id, id));
}

export async function passkeyPromptOptions(use: "login" | "unlock") {
  const options = await authenticationOptions(await site());
  await rememberChallenge(use === "unlock" ? "unlock" : "login", options.challenge);
  return options;
}

export async function loginWithPasskey(response: AuthenticationResponseJSON, next: string): Promise<{ error?: string }> {
  const ip = await clientIp();
  const blocked = await guardAttempt(ip, false);
  if (blocked) return { error: blocked };
  try {
    const challenge = await takeChallenge("login");
    if (!challenge || !(await verifyPasskey(await getDb(), await site(), response, challenge))) {
      return { error: "That passkey didn't work. Try again, or use your password." };
    }
  } catch (error) {
    console.error("[jig] passkey login failed", error);
    return { error: "Could not check the passkey right now. Try again." };
  }
  await attemptSucceeded(ip);
  await signIn();
  redirect(safeNext(next));
}

async function startUnlock() {
  const session = await requireAuth();
  const { value } = await makeUnlock(await getDb(), session.issuedAt);
  (await cookies()).set(UNLOCK_COOKIE, value, shortCookie());
  revalidatePath("/", "layout");
}

export async function unlockWithPasskey(response: AuthenticationResponseJSON): Promise<{ error?: string }> {
  await requireAuth();
  const challenge = await takeChallenge("unlock");
  if (!challenge || !(await verifyPasskey(await getDb(), await site(), response, challenge))) {
    return { error: "That passkey didn't work. Try again, or use your password." };
  }
  await startUnlock();
  return {};
}

export async function unlockWithPassword(password: string): Promise<{ error?: string }> {
  await requireAuth();
  const problem = passwordProblem();
  if (problem) return { error: problem };
  const ip = await clientIp();
  const blocked = await guardAttempt(ip, true);
  if (blocked) return { error: blocked };
  if (!checkPassword(String(password))) return { error: "Wrong password." };
  await attemptSucceeded(ip);
  await startUnlock();
  return {};
}

export async function relockNotes(): Promise<void> {
  await requireAuth();
  (await cookies()).delete(UNLOCK_COOKIE);
  revalidatePath("/", "layout");
}

export async function setNoteLock(slug: string, locked: boolean): Promise<{ error?: string }> {
  await requireAuth();
  if (!encryptionReady()) return { error: "Locking notes needs JIG_ENCRYPTION_KEY, the same key as Credentials." };
  try {
    const lock = parse(z.boolean(), locked);
    if (!lock && !(await isUnlocked())) return { error: "Unlock the note first." };
    await setNoteLocked(await getDb(), parse(Slug, slug), lock, noteCodec);
  } catch (error) {
    return failure(error, "Could not change the lock. Try again.");
  }
  revalidatePath("/", "layout");
  return {};
}

async function authorizeRequestFrom(form: FormData) {
  let params: Record<string, string>;
  try {
    params = z.record(z.string(), z.string()).parse(JSON.parse(String(form.get("params") ?? "{}")));
  } catch {
    redirect("/connect");
  }
  return checkAuthorizeRequest(await getDb(), params, resourceUrlFrom(await headers()));
}

export async function allowApp(form: FormData) {
  await requireAuth();
  const request = await authorizeRequestFrom(form);
  redirect("redirect" in request ? request.redirect : await approve(await getDb(), request));
}

export async function denyApp(form: FormData) {
  await requireAuth();
  const request = await authorizeRequestFrom(form);
  redirect("redirect" in request ? request.redirect : redirectError(request.redirectUri, "access_denied", "The owner declined.", request.state));
}

export async function disconnectApp(form: FormData) {
  await requireAuth();
  await revokeGrant(await getDb(), parse(Id, String(form.get("id"))));
  revalidatePath("/connect");
}

function aiFailure(error: unknown): { error: string } {
  if (error instanceof AiError) return { error: error.message };
  return failure(error, "The AI couldn't answer just now. Try again.");
}

export async function aiRewrite(mode: RewriteMode, text: string, slug?: string): Promise<{ text?: string; error?: string }> {
  await requireAuth();
  try {
    const kind = parse(z.enum(["rephrase", "shorten", "fix"]), mode);
    const body = parse(z.string().trim().min(1, "Select some text first."), text);
    if (slug) {
      const note = await getNote(await getDb(), parse(Slug, slug));
      if (note?.locked) return { error: "Locked notes are never sent to the AI." };
    }
    return { text: await rewrite(kind, body) };
  } catch (error) {
    return aiFailure(error);
  }
}

export async function aiReview(snippet: {
  title: string;
  language: string;
  instructions: string;
  files: { name: string; content: string }[];
}): Promise<{ review?: Review; error?: string }> {
  await requireAuth();
  try {
    const input = parse(
      z.object({
        title: z.string().max(200),
        language: z.string().max(40),
        instructions: z.string().max(20_000),
        files: z.array(z.object({ name: z.string().max(200), content: z.string() })).min(1).max(50),
      }),
      snippet,
    );
    if (!input.files.some((f) => f.content.trim())) return { error: "There's no code to check yet." };
    return { review: await reviewSnippet(input) };
  } catch (error) {
    return aiFailure(error);
  }
}

export async function aiFix(input: {
  file: { name: string; content: string };
  language: string;
  issues: { file: string; line: number | null; severity: "error" | "warning" | "suggestion"; message: string; fix: string }[];
}): Promise<{ content?: string; error?: string }> {
  await requireAuth();
  try {
    const { file, language, issues } = parse(
      z.object({
        file: z.object({ name: z.string().max(200), content: z.string().min(1) }),
        language: z.string().max(40),
        issues: z
          .array(
            z.object({
              file: z.string().max(200),
              line: z.number().int().nullable(),
              severity: z.enum(["error", "warning", "suggestion"]),
              message: z.string().max(2000),
              fix: z.string().max(2000),
            }),
          )
          .min(1, "Pick at least one issue to fix.")
          .max(50),
      }),
      input,
    );
    return { content: await fixFile(file, language, issues) };
  } catch (error) {
    return aiFailure(error);
  }
}

const PlatformIdSchema = z.enum(PLATFORM_IDS);

export async function aiSettings(): Promise<AiSettings> {
  await requireAuth();
  return getAiSettings(await getDb());
}

export async function saveAiPlatform(id: string, input: { key: string; model: string }): Promise<{ settings?: AiSettings; error?: string }> {
  await requireAuth();
  try {
    const platformId = parse(PlatformIdSchema, id);
    const { key, model } = parse(z.object({ key: z.string().trim().max(500), model: z.string().trim().max(200) }), input);
    const db = await getDb();
    if (key) {
      await testKey(platformById(platformId)!, key, model || null);
      await saveAiKey(db, platformId, key);
      await setActivePlatform(db, platformId);
    }
    await setAiModel(db, platformId, model);
  } catch (error) {
    if (error instanceof CredentialsUnavailable) return { error: "Saving AI keys needs JIG_ENCRYPTION_KEY, the same key as Credentials." };
    return aiFailure(error);
  }
  revalidatePath("/", "layout");
  return { settings: await getAiSettings(await getDb()) };
}

export async function removeAiPlatformKey(id: string): Promise<{ settings?: AiSettings; error?: string }> {
  await requireAuth();
  try {
    await removeAiKey(await getDb(), parse(PlatformIdSchema, id));
  } catch (error) {
    return failure(error, "Could not remove the key. Try again.");
  }
  revalidatePath("/", "layout");
  return { settings: await getAiSettings(await getDb()) };
}

export async function chooseAiPlatform(id: string): Promise<{ settings?: AiSettings; error?: string }> {
  await requireAuth();
  try {
    await setActivePlatform(await getDb(), parse(PlatformIdSchema, id));
  } catch (error) {
    return failure(error, "Could not switch. Try again.");
  }
  revalidatePath("/", "layout");
  return { settings: await getAiSettings(await getDb()) };
}
