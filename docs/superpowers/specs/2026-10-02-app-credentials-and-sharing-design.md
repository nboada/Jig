# Credentials, sharing and the rest of the dashboard in the apps: design

Date: 2026-10-02
Status: draft, awaiting review
Builds on: `2026-10-02-native-api-design.md`, `2026-10-02-app-actions-and-locked-notes-design.md`

## Goal

The iPhone and Mac apps should do everything the dashboard does. What's missing today:
- **Credentials:** list, search, view, reveal and copy secrets, create, edit, pin, duplicate and delete.
- **Share links** for snippets, notes and credentials:
  - make one, with an expiry, a view limit and a label; credential links also get a passcode
  - see an item's links and their status, and copy one again
  - turn a link off or back on, and delete it
- **Recently deleted:** list deleted items, restore them, or delete them for good.
- **Connect:** API tokens (make, list, revoke) and connected apps (list, disconnect).
- **Settings:** passkeys (list, remove; adding comes later) and **Sign out everywhere**.

Out of scope here, each getting its own spec later:
- AI check
- adding a passkey from the app
- keeping credentials offline

## Decisions

1. **Same rules as the dashboard.**
   - Reading a credential's plain fields needs only the app token, as the dashboard's list and page do.
   - **Revealing a secret field needs the unlock token**, the same 30-minute unlock locked notes use. That unlock now comes from a passkey or password inside the app.
   - Saving a credential doesn't need an unlock, matching the dashboard. Secret values the app didn't change stay as they are.
   - **Credential share links** need an unlock both to make and to copy again, and always get a passcode. Snippet and note links don't need an unlock.
2. **A new module, `lib/api-secure.ts`.** It holds everything that touches credentials, shares, purging and tokens, kept out of `lib/api.ts`. The import check that keeps `lib/api.ts` and `lib/mcp.ts` away from `credentials`, `crypto`, `shares` and `locked-notes` stays as it is. A new test checks that every route reading secret values or credential share links passes `requireUnlock`.
3. **Credentials never touch the offline library or the response cache.** The app reads them fresh each time. Secret values exist only in memory and on the clipboard, and the clipboard copy is marked to expire after 60 seconds (`UIPasteboard` expiration, `NSPasteboard` on the Mac).
4. **Purging (deleting for good)** is allowed from the apps, behind a confirmation, as on the dashboard. Restoring from trash now includes credentials. This replaces the earlier "snippets and notes only" rule, because the full dashboard flow is now in scope.
5. **Managing API tokens and connected apps:**
   - The app can make and revoke `jig_` tokens. A new token is shown once, as on the dashboard.
   - The app can't disconnect its own sign-in from the Connect list; "Sign out" in Settings does that.

## Server (`/api/v1`, all with the app token)

| Area | Routes | Extra requirement |
|---|---|---|
| Credentials | `GET /credentials?q=&tag=&sort=` (summaries); `POST /credentials`; `GET /credentials/:slug` (plain fields, secret values null); `PATCH /credentials/:slug`; `POST /credentials/:slug/pin`, `/duplicate`; `DELETE /credentials/:slug` (to trash) | none |
| Secrets | `GET /credentials/:slug/fields/:id/secret` returns `{ value }` | unlock token |
| Shares | `GET /shares?kind=&slug=` (an item's links); `POST /shares` `{ kind, slug, expiry, maxViews, label }` returns `{ token, passcode?, url }`; `POST /shares/:id/reveal`; `POST /shares/:id/revoke`, `/restore`; `DELETE /shares/:id` | unlock token when the item is a credential |
| Trash | `GET /trash`; `POST /trash/:id/restore` (now any kind); `DELETE /trash/:id` (purge) | none |
| Connect | `GET /tokens`; `POST /tokens` `{ name }` returns the token once; `DELETE /tokens/:id`; `GET /apps`; `DELETE /apps/:id` (refused for the caller's own grant) | none |
| Account | `GET /passkeys`; `DELETE /passkeys/:id`; `POST /sessions/end` (Sign out everywhere, which also ends the caller's unlock) | the unlock token for removing a passkey |

The routes reuse the existing `lib/` functions: `credentials.ts`, `shares.ts`, `trash.ts`, `tokens.ts`, `oauth.ts` (`listGrants`, `revokeGrant`), `passkeys.ts` and `session.ts` (`endAllSessions`). A share link's URL is built from the request's origin, or `JIG_ORIGIN` when set.

## Apps (shared SwiftUI in `Jig/`, plus the Mac's own pages)

- **Credentials tab, after Notes and Snippets:**
  - **List:** searchable, with tag filter, Pinned section, swipe to pin or delete with Undo, and the long-press menu (Pin, Duplicate, Share, Delete).
  - **Detail:** each field shows its label and value. Secret fields show dots with **Reveal** (Face ID through the passkey unlock) and **Copy**, which copies without showing the value. Usernames and URLs can be copied, and URLs opened.
  - **Editing:** in place on the same screen, with add, remove and reorder for fields, a secret toggle, and Cancel and Save.
- **Share sheet** on snippets, notes and credentials, from the toolbar and the long-press menu:
  - expiry (1 hour, 24 hours, 7 days, 30 days, never), view limit, label
  - **Create** shows the link with Copy and the system share button, plus the passcode for credentials
  - the item's existing links, each with its status (open, expired, revoked, used, locked), Copy again, Turn off or on, and Delete
- **Recently deleted** in Settings: items with when they'll be removed, Restore, and Delete for good with a confirmation.
- **Connect** in Settings: API tokens (new token shown once with Copy, revoke) and connected apps (disconnect, except this device).
- **Settings:** Passkeys (list, remove) and **Sign out everywhere**, with a confirmation explaining it ends every session, including this one.

## Testing

- **Server:** every route.
  - Secrets refused without an unlock token, or with another grant's.
  - Credential share creation and reveal need the unlock; snippet and note links don't.
  - Purge, restore of credentials, token creation shown once, and the caller can't disconnect itself.
  - Removing a passkey needs the unlock, and Sign out everywhere also ends app unlocks.
  - The import check stays green for `lib/api.ts` and `lib/mcp.ts`, and there's a gate test for `lib/api-secure.ts` routes.
- **JigKit:** API client encoding and decoding for every new route, and secret values never written to the cache.
- **UI tests on the simulator** against a local Jig:
  - create, edit and reveal a credential, with the unlock by password since the simulator has no passkey
  - make a share link and turn it off
  - restore from Recently deleted
  - make and revoke a token
