"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type Db } from "@/lib/db";
import { makePass, passCookieName } from "@/lib/share-pass";
import { checkPasscode, findShare, recordView, shareStatus } from "@/lib/shares";

/**
 * The public side of share links. These run for anyone holding a link, so there is no login
 * check: the token (and, for credentials, the passcode) is the permission. Owner-side share
 * actions live in app/actions.ts behind requireAuth.
 */

/*
 * Only the actions below are exported: every export of a "use server" file can be called by
 * anyone, so helpers (like issuing a pass) stay private or live in lib/.
 */

async function grantPass(db: Db, shareId: string) {
  const { value, maxAge } = await makePass(db, shareId);
  (await cookies()).set(passCookieName(shareId), value, { httpOnly: true, secure: true, sameSite: "lax", path: "/s", maxAge });
}

/** A view-limited link's "View" button: uses a view, then shows the item. */
export async function openShare(form: FormData) {
  const token = String(form.get("token") ?? "");
  const db = await getDb();
  const share = await findShare(db, token);
  if (share && !share.protected && (await recordView(db, share))) await grantPass(db, share.id);
  redirect(`/s/${encodeURIComponent(token)}`);
}

export type UnlockState = { error?: string };

/** A credential link's passcode form. */
export async function unlockShare(_: UnlockState, form: FormData): Promise<UnlockState> {
  const token = String(form.get("token") ?? "");
  const passcode = String(form.get("passcode") ?? "");
  const db = await getDb();
  const share = await findShare(db, token);
  if (!share || shareStatus(share) !== "open") redirect(`/s/${encodeURIComponent(token)}`);
  const { ok, left } = await checkPasscode(db, share, passcode);
  if (!ok) {
    if (left <= 0) redirect(`/s/${encodeURIComponent(token)}`);
    return { error: `That passcode isn't right. ${left} ${left === 1 ? "try" : "tries"} left before the link locks.` };
  }
  if (await recordView(db, share)) await grantPass(db, share.id);
  redirect(`/s/${encodeURIComponent(token)}`);
}
