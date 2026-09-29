import { safeEqual, signValue } from "./session";
import { MAX_FAILED, type Share } from "./shares";

/**
 * After someone uses a view (or unlocks a credential link), their browser gets a signed pass so
 * reloading the page for the next hour doesn't use another view. The expiry is inside the signed
 * value, and the purpose prefix keeps a pass from ever passing for a session.
 */

const PASS_SECONDS = 60 * 60;

export const passCookieName = (shareId: string) => `jig_share_${shareId}`;

export async function makePass(shareId: string, now = Date.now()) {
  const expires = String(Math.floor(now / 1000) + PASS_SECONDS);
  return { value: `${expires}.${await signValue(`share:${shareId}:${expires}`)}`, maxAge: PASS_SECONDS };
}

/**
 * Whether a pass still lets its holder see the item. A revoked, expired or locked link shuts it
 * out; a used-up view limit doesn't, since the holder is who used the last view.
 */
export async function passAdmits(share: Share, value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || share.revoked || share.failedAttempts >= MAX_FAILED) return false;
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= now) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) * 1000 < now) return false;
  return safeEqual(signature, await signValue(`share:${share.id}:${expires}`));
}
