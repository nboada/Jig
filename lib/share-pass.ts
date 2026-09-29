import type { Db } from "./db";
import { MAX_FAILED, type Share } from "./shares";
import { seal, unseal } from "./signing";

/**
 * After someone uses a view (or unlocks a credential link), their browser gets a signed pass so
 * reloading the page for the next hour doesn't use another view. The expiry is inside the signed
 * value, and passes are signed with their own key, so one can never pass for a session.
 */

const PASS_SECONDS = 60 * 60;

export const passCookieName = (shareId: string) => `jig_share_${shareId}`;

export async function makePass(db: Db, shareId: string, now = Date.now()) {
  const value = await seal(db, "share-pass", [shareId], Math.floor(now / 1000) + PASS_SECONDS);
  return { value, maxAge: PASS_SECONDS };
}

/**
 * Whether a pass still lets its holder see the item. A revoked, expired or locked link shuts it
 * out; a used-up view limit doesn't, since the holder is who used the last view.
 */
export async function passAdmits(db: Db, share: Share, value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || share.revoked || share.failedAttempts >= MAX_FAILED) return false;
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= now) return false;
  const fields = await unseal(db, "share-pass", value, now);
  return fields?.length === 1 && fields[0] === share.id;
}
