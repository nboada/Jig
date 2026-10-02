import type { Body } from "./api";
import { UnlockRequired, type Caller } from "./api-http";
import { createCredential, getCredential, listCredentials, listCredentialTags, revealField, updateCredential } from "./credentials";
import type { Db } from "./db";
import { listGrants, revokeGrant } from "./oauth";
import { listPasskeys, removePasskey } from "./passkeys";
import { endAllSessions } from "./session";
import { createShare, deleteShare, EXPIRIES, listShares, restoreShare, revealShare, revokeShare, type Expiry, type ShareKind } from "./shares";
import { parseSort } from "./sort";
import { SnippetError } from "./snippets";
import { createToken, listTokens, revokeToken } from "./tokens";
import { listTrash, purgeItem, trashItem } from "./trash";
import type { CredentialInput } from "./validation";

// The app API for credentials, share links, purging, tokens and the account. Like lib/api-locked.ts it is kept
// out of lib/api.ts so that module, and lib/mcp.ts, never reach the credentials or share code.

const KINDS: ShareKind[] = ["snippets", "notes", "credentials"];
const text = (q: URLSearchParams, key: string) => q.get(key)?.trim() || undefined;
const missing = (slug: string) => new SnippetError(`No credential with the slug "${slug}".`, "not_found");

function id(value: string, what = "item"): string {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new SnippetError(`No ${what} with that id.`, "not_found");
  return value;
}

function kind(value: unknown): ShareKind {
  if (typeof value !== "string" || !KINDS.includes(value as ShareKind)) throw new SnippetError("kind must be snippets, notes or credentials.", "invalid");
  return value as ShareKind;
}

export const credentialsApi = {
  list: async (db: Db, q: URLSearchParams) =>
    listCredentials(db, { query: text(q, "q"), tag: text(q, "tag"), sort: parseSort(q.get("sort")), limit: 500 }),

  tags: (db: Db) => listCredentialTags(db),

  async get(db: Db, slug: string) {
    const credential = await getCredential(db, slug);
    if (!credential) throw missing(slug);
    return credential;
  },

  create: async (db: Db, body: Body) => createCredential(db, body as CredentialInput),

  async update(db: Db, slug: string, body: Body) {
    if (!(await getCredential(db, slug))) throw missing(slug);
    return updateCredential(db, slug, body as CredentialInput);
  },

  async remove(db: Db, slug: string) {
    if (!(await getCredential(db, slug))) throw missing(slug);
    return { trashId: await trashItem(db, "credentials", slug) };
  },

  /** The one place a secret value leaves the server; the route requires an unlock token. */
  async reveal(db: Db, slug: string, fieldId: string) {
    if (!(await getCredential(db, slug))) throw missing(slug);
    return { value: await revealField(db, slug, fieldId) };
  },
};

export const sharesApi = {
  list: async (db: Db, q: URLSearchParams) => listShares(db, kind(q.get("kind")), text(q, "slug") ?? ""),

  /** Credential links need the unlock, as on the dashboard; snippet and note links don't. */
  async create(db: Db, body: Body, origin: string, unlocked: boolean) {
    const section = kind(body.kind);
    if (section === "credentials" && !unlocked) throw new UnlockRequired();
    if (typeof body.slug !== "string") throw new SnippetError("slug is required.", "invalid");
    const expiry = typeof body.expiry === "string" && Object.hasOwn(EXPIRIES, body.expiry) ? (body.expiry as Expiry) : null;
    if (!expiry) throw new SnippetError("expiry must be 1h, 24h, 7d, 30d or never.", "invalid");
    const maxViews = body.maxViews == null ? null : Number(body.maxViews);
    const label = typeof body.label === "string" ? body.label : undefined;
    const { token, passcode, share } = await createShare(db, section, body.slug, { expiry, maxViews, label });
    return { url: `${origin}/s/${token}`, token, passcode, share };
  },

  async reveal(db: Db, shareId: string, origin: string, unlocked: boolean) {
    const found = await revealShare(db, id(shareId, "link"));
    if (found.kind === "credentials" && !unlocked) throw new UnlockRequired();
    return { url: `${origin}/s/${found.token}`, token: found.token, passcode: found.passcode };
  },

  revoke: async (db: Db, shareId: string) => revokeShare(db, id(shareId, "link")).then(() => ({ ok: true })),
  restore: async (db: Db, shareId: string) => restoreShare(db, id(shareId, "link")).then(() => ({ ok: true })),
  remove: async (db: Db, shareId: string) => deleteShare(db, id(shareId, "link")).then(() => ({ ok: true })),
};

export const trashApi = {
  list: (db: Db) => listTrash(db),
  purge: async (db: Db, trashId: string) => purgeItem(db, id(trashId)).then(() => ({ ok: true })),
};

export const connectApi = {
  tokens: (db: Db) => listTokens(db),

  async createToken(db: Db, body: Body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new SnippetError("Give the token a name.", "invalid");
    return createToken(db, name.slice(0, 80));
  },

  revokeToken: async (db: Db, tokenId: string) => revokeToken(db, id(tokenId, "token")).then(() => ({ ok: true })),

  apps: async (db: Db, caller: Caller) => (await listGrants(db)).map((grant) => ({ ...grant, current: grant.id === caller.grantId })),

  /** An app can't disconnect itself here; signing out does that. */
  async disconnect(db: Db, caller: Caller, grantId: string) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(grantId)) throw new SnippetError("No app with that id.", "not_found");
    if (grantId === caller.grantId) throw new SnippetError("Use Sign out to disconnect this device.", "invalid");
    await revokeGrant(db, grantId);
    return { ok: true };
  },
};

export const accountApi = {
  passkeys: (db: Db) => listPasskeys(db),
  async removePasskey(db: Db, passkeyId: string) {
    // WebAuthn credential ids are base64url.
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(passkeyId)) throw new SnippetError("No passkey with that id.", "not_found");
    await removePasskey(db, passkeyId);
    return { ok: true };
  },

  /** Ends every dashboard session and app unlock, and disconnects every other app and connector; this device stays. */
  async endSessions(db: Db, caller: Caller) {
    await endAllSessions(db);
    await db.query(`DELETE FROM oauth_grants WHERE id <> $1`, [caller.grantId]);
    return { ok: true };
  },
};
