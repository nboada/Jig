# App actions and locked notes: design

Date: 2026-10-02
Status: draft, awaiting review
Builds on: `2026-10-02-native-api-design.md`

## Goal

Bring the native app up to the dashboard for everyday item management:
- pin, duplicate and delete (to Recently deleted) snippets and notes
- locked notes: seeing them, unlocking them with Face ID (via a passkey), reading and editing them, locking and unlocking, and keeping them offline

Success:
- **Pinned items** sit at the top of both lists, as on the dashboard.
- **Swipes:** swiping right pins or unpins, and swiping left deletes, with Undo, like the iOS Notes app.
- **Long-press menu:** Pin, Duplicate, Lock or Unlock (notes), and Delete.
- **Locked notes** show in the list with a lock. Opening one asks for Face ID and then shows it, including offline once it has been synced.

## Decisions

1. **Delete means Recently deleted.** The API moves items to the existing trash (`lib/trash.ts`), where they stay restorable for 30 days. The app offers Undo right after deleting, and nothing is ever hard-deleted from the app. This changes the rule from the first spec, which said there would be no delete over the app API. MCP still can't delete anything.
2. **Locked-note access lives in its own module.** `lib/api-locked.ts` and `app/api/v1/locked/*` hold everything that touches the note key. `lib/api.ts` and `lib/mcp.ts` stay unable to import `locked-notes`, `crypto`, `credentials` or `shares`, and the existing import check keeps enforcing that. A second test checks that every route in `lib/api-locked.ts` requires an unlock token.
3. **Unlocking reuses the dashboard's unlock.** The app opens `/oauth/unlock` in the browser sheet. That page needs the dashboard login and then the same unlock as the dashboard: a passkey (Face ID on the phone) or the password, rate limited the same way. It then sends a one-use code back to the app. The app trades that code, together with its access token, for an **unlock token**. The token is a sealed value bound to the OAuth grant's id, valid for 30 minutes (`UNLOCK_SECONDS`). Disconnecting the app on the Connect page, or "Sign out everywhere", invalidates it.
4. **Locked notes offline, encrypted at rest.** While an unlock token is valid, sync also downloads locked notes. The phone re-encrypts them with its own AES-GCM key, which sits in the Keychain behind a biometric access control (`.biometryCurrentSet`). Reading one back needs Face ID, even offline. They never go into the plain library file or the response cache.
5. **Editing locked notes.** Saving goes to `/api/v1/locked/notes/:slug`, which needs an unlock token, and the server encrypts the body as the dashboard does. Offline, the edit is queued in the outbox, encrypted with the device key, and uploads at the next sync that has a valid unlock token. Without one, it waits and the app asks you to unlock.
6. **Pinning, duplicating, deleting and locking** go through the existing `lib/` functions: `setSnippetPinned`/`setNotePinned`, `cloneSnippet`/`cloneNote`, `trashItem`/`restoreItem`, and `setNoteLocked` with `noteCodec`. A locked note can't be duplicated, matching the dashboard.

## Server (`/api/v1`)

| Method | Path | Does | Auth |
|---|---|---|---|
| POST | `/snippets/:slug/pin`, `/notes/:slug/pin` | Body `{ pinned }`; returns the item | app token |
| POST | `/snippets/:slug/duplicate`, `/notes/:slug/duplicate` | Returns the copy (locked notes refused) | app token |
| DELETE | `/snippets/:slug`, `/notes/:slug` | Moves the item to trash; returns `{ trashId }` | app token |
| POST | `/trash/:id/restore` | Undo; returns `{ kind, slug }` | app token |
| GET | `/locked/notes` | Locked notes' summaries (title, tags, dates; no body) | app token |
| GET | `/locked/notes/:slug?v=` | The decrypted note | app token + unlock token |
| PATCH | `/locked/notes/:slug` | Update, re-encrypted | app token + unlock token |
| POST | `/locked/notes/:slug/lock` | Body `{ locked }`; lock or unlock a note | app token + unlock token |
| GET | `/locked/notes/:slug/versions`, `/diff` | History of a locked note | app token + unlock token |
| POST | `/unlock` | Body `{ code }`; returns `{ unlockToken, expiresIn }` | app token |

- **Restore scope.** `/trash/:id/restore` only accepts snippets and notes, never credentials.
- **The unlock token** travels in the `X-Jig-Unlock` header. A missing or expired token gets 403 `{ error: { code: "locked" } }`, which tells the app to unlock again.
- **`/oauth/unlock`:** query `client_id`, `redirect_uri` (must be one the client registered) and `state`.
  - It needs a dashboard session and a valid unlock: if the session isn't unlocked, it shows the existing UnlockPanel.
  - It then shows "Unlock locked notes for {app name}?" with Allow and Deny. Allow redirects with a one-use code that expires in 5 minutes and is bound to the client and grant.
  - Codes are stored hashed, like the OAuth codes.
- **Lists.** The public `/notes` list keeps hiding locked notes, so MCP and API behaviour is unchanged, and the app gets them from `/locked/notes`. Summaries from both lists include `pinned`.
- **Schema (idempotent).** `CREATE TABLE IF NOT EXISTS oauth_unlock_codes (code_hash text PRIMARY KEY, grant_client_id text NOT NULL, expires_at timestamptz NOT NULL)`. The unlock token itself is sealed with `seal(db, "app-unlock", [grantId], exp)`, so it needs no table.

## App

- **Lists:**
  - pinned items first, under a small "Pinned" label, with a pin icon
  - locked notes appear with a lock and no excerpt
  - **Swipe right:** Pin or Unpin.
  - **Swipe left:** Delete, which moves the item to Recently deleted and shows an Undo toast for about 5 seconds.
  - **Long press:** Pin or Unpin, Duplicate, Lock or Unlock (notes), Copy link to dashboard, and Delete.
- **Opening a locked note:**
  1. Face ID reads the device copy.
  2. If there's no device copy yet, or it's out of date while online, the app checks for a valid unlock token; if there isn't one, the browser sheet unlock runs.
  3. Then it fetches the note and stores it encrypted on the device.
  4. Each Face ID check covers the app until it goes to the background.
- **Locking a note** (from the menu or the note's toolbar) needs an unlock token. The note then leaves the plain library and goes into encrypted storage.
- **Offline:**
  - Pin, unpin, duplicate and delete queue in the outbox like edits; duplicating a locked note isn't offered.
  - A delete made offline hides the item at once and moves it to trash on sync.
  - If an item was changed elsewhere before a delete reaches the server, the delete still goes ahead. Everything lands in trash anyway.
- **Sign out** clears the encrypted store and deletes the device key.

## Testing

- **Server:**
  - pin, duplicate, delete-to-trash, restore (refused for credentials)
  - `/locked/*` refuses requests without an unlock token, with an expired one, with another grant's token, or after a disconnect
  - the unlock-code round trip, single use
  - `/notes` still hides locked notes
  - the import check stays green for `lib/api.ts` and `lib/mcp.ts`
  - the consent page requires an unlocked session
- **JigKit:**
  - the encrypted store round trip
  - the lock state machine: no token, valid token, expired token
  - queued pin and delete
  - delete with Undo
  - pinned sorting, offline and online
- **UI tests:** swipe to pin and delete, the long-press menu, and a locked note shown after unlock. On the simulator, Face ID is driven through the simulator's enrolled-biometry tooling.
