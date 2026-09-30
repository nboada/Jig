import type { Db } from "./db";
import { MAX_FAILED, type Share } from "./shares";
import { seal, unseal } from "./signing";


const PASS_SECONDS = 60 * 60;

export const passCookieName = (shareId: string) => `jig_share_${shareId}`;

export async function makePass(db: Db, shareId: string, now = Date.now()) {
  const value = await seal(db, "share-pass", [shareId], Math.floor(now / 1000) + PASS_SECONDS);
  return { value, maxAge: PASS_SECONDS };
}

export async function passAdmits(db: Db, share: Share, value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || share.revoked || share.failedAttempts >= MAX_FAILED) return false;
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= now) return false;
  const fields = await unseal(db, "share-pass", value, now);
  return fields?.length === 1 && fields[0] === share.id;
}
