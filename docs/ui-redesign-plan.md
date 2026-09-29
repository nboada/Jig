# Jig UI redesign plan

Status: the dark theme is built (2026-09-29), not yet committed. It covers tokens and fonts, the header, the list column, item pages, the code panel, notes, the grid, dialogs, empty states, login, the share page and the phone tab bar. Light mode (5.14) is planned for later.

This plan comes from reading the code: `app/globals.css`, the `(app)` layout, the split and grid views, the item pages, the forms, menus, dialogs, login and the share page. The running app wasn't opened, because that would have meant filling in the login form. Before Phase 1, check each proposal against the live app at 1440px and 390px wide.

Owner constraints that apply throughout:

- No visible focus rings or outlines on buttons and links. Text fields keep showing focus through their border colour, as they do now.
- Keep every keyboard shortcut: `1` `2` `3`, `N`, `G` / `L`, `↑` `↓`. New shortcuts may be added, but none removed or rebound.
- No `<Suspense>` and no `loading.tsx` under `app/(app)`. Nothing here needs streaming. The split list keeps reading `?q=` from `window.location` after it mounts.

---

## 1. Audit

### What works

- **The identity is strong and worth keeping.** Near-black ink, one panel colour and a single acid-lime accent make Jig recognisable at a glance. Lime on black reads as "terminal / tool", which fits a library for coding agents.
- **The split view is the right model.** A list that stays put next to the open item, `↑`/`↓` to move through it, optimistic pinning and hiding: this is how Linear or Things feels, and it suits a single-user library you move through quickly.
- **Motion is restrained and correct.** Modal and menu animations are short, eased and respect `prefers-reduced-motion`.
- **The copy is good.** It's plain and specific ("Copy it now: it's shown only once.", "Agents connected over MCP can never read these."). Keep the voice.
- **Destructive actions are handled well.** There's a confirm dialog with the version count, the danger tone, and delete is always last in its menu behind a separator.

### What doesn't work

**Hierarchy**

1. **Lime is overused, so it stops meaning anything.** At any one time, lime fills the active nav tab, the Edit button, the New button (with a kbd hint), the language chip, the selected list row's tint and title, pinned-state buttons, the restore banner, every selected share option pill and the "link created" box. On an item page in split view you can count five or six lime elements, and the eye has nowhere to land.
2. **The item header gives equal weight to every control.** Pin, History, Share, Edit and ⋯ are all 34px bordered boxes in a row, with Edit filled. The useful facts (who saved it, when, which version) are hidden in the Details dialog, even though "saved by mcp:claude-code 2h ago" is exactly what you want to see first on a library that agents write to.
3. **The toolbar sits above both columns.** The search field stretches across the whole width, far from the list it filters. It pushes the list and the pane down about 60px, and repeats New, which also has the `N` shortcut.
4. **The header is heavy for what it holds.** A 64px floating pill with a large drop shadow, a centred tab group with kbd hints on every tab, a Connect button, a divider and a "Log out" button with a label. Log out is used perhaps once a month but gets as much space as a section tab.

**Density and spacing**

5. **Too many one-off values.** There are around 30 arbitrary sizes (`text-[13px]`, `text-[11px]`, `text-[10px]`, `size-[34px]`, `h-[34px]`), plus magic numbers that depend on each other (`md:top-22`, `calc(100dvh-7.5rem)` in three places) and silently tie the column and pane heights to the header height.
6. **Control heights drift.** Across the app: 28px (menu items), 32px (icon buttons), 34px (item actions), 36px (inputs at `py-2`), 40px (header tabs), 42px (share inputs). Buttons use `py-1`, `py-1.5`, `py-2` and `py-2.5`.
7. **Panel padding drifts too.** Dialogs are `p-5 rounded-lg` (confirm), `p-6 rounded-xl` (details) and `p-7 rounded-xl` (share). Cards and panels are `p-4`, notes are `p-6 pr-20`.

**Typography**

8. **System font throughout.** `ui-sans-serif, system-ui` gives the dashboard no voice of its own, and the mono stack falls back differently on each OS, so file names and code look different on each machine.
9. **No type scale.** Sizes are chosen per element: 10, 11, 12, 13, 14, 16, 18, 24 and 30px all appear. Secondary text is made with opacity (`text-text/60`, `/70`, `/75`, `/85`), so the same "secondary" role has four different values.
10. **Notes read like form fields.** The rendered note is `prose-sm` (14px) inside a bordered panel with a Copy button in the corner. A reading surface would be better at 15–16px with a comfortable line length and no box.

**Colour**

11. **The Shiki theme doesn't match the app.** `github-dark-default` brings GitHub's blue-grey palette into a UI that is otherwise warm black and lime. The CodeMirror editor uses `githubDark`, so the editor and the read view also differ from each other.
12. **No secondary-text token.** Opacity on `text` stands in for one, which also muddies colours when text sits on raised or tinted surfaces.

**Consistency between snippets, notes and credentials**

13. **Three copy-pasted item headers that have drifted apart.** Snippets put tags and a lime language chip above the title. Notes put a version chip above it. Credentials put tags above it, have no pin, and show the URL below as a lime link. Details dialogs differ in labels ("Note" vs "Change" for the same thing).
14. **Three toolbars.** `ListToolbar`, `GridToolbar` and the inline form at the top of each grid page all do the same job, with small differences: the grid pages' New link has no hover state, and they use `SearchInput` with `useSearchParams` while the others use context.
15. **Grid pages don't match each other.** Only Credentials has a page heading and intro line. Snippet cards show a version chip, notes cards don't. Credential cards show field labels joined with `·`.
16. **Two identical menu `Item` components** in `MoreMenu.tsx` and `ItemMenu.tsx`, and two identical `NOUNS` maps. The right-click menu and the ⋯ menu offer different actions in a different order.

**States**

17. **Empty states are generic.** They're dashed boxes with centred text. `PickPane` fills the whole pane with a dashed rectangle, which is the largest element on the screen on every first visit.
18. **Loading states are plain text.** "Loading…", "Working…" and "Revealing" are fine for a single user, but they shift the layout (button labels change width).

---

## 2. Aesthetic direction: "Workbench"

A jig is the fixture that holds a workpiece steady while you cut it. The UI should behave the same way: a **precise, quiet fixture** that holds your code and gets out of the way. It shouldn't feel like a marketing dashboard or a glossy SaaS app.

**Tone:** industrial and utilitarian, made refined. Think of a well-machined instrument panel: tight tolerances, engraved labels, one indicator light.

**Why this direction:**

- The user is one developer, often arriving from a terminal or an agent session. Calm density matches their context better than spacious cards.
- The lime accent already reads as an indicator LED. The direction leans into that: **lime means "this is live or selected" or "this is the one action", and nothing else.** Rationing it is what makes it memorable.
- Mono becomes a real design material rather than a fallback. Metadata such as slugs, versions, `mcp:` sources, sizes and times is set in mono small caps like engraved labels, and the sans is kept for things you read.
- It stays dark and lime, so existing users see the same app, only sharper. That also means no migration risk for deployed copies.

**The one memorable thing:** the "engraved" metadata line (`v14 · mcp:claude-code · 2h ago · 3 files`), which appears in the same form on every item, row and card across all three sections. It gives Jig a signature look and makes agent activity visible everywhere.

**Rules of the direction**

1. **Lime budget:** lime fills only the current section tab and the page's one primary action, plus the selected row's lime tint and lime title. The owner chose to keep today's tab and selected row. Everything else is neutral.
2. **Borders over boxes.** Use hairlines (`line`) to separate things, and backgrounds only where there's real layering (menus, dialogs, the code well).
3. **Two fonts, strict roles.** The sans is for titles and prose. The mono is for code, metadata, kbd and counts. Capitals are only for the small engraved labels (`SNIPPET · JAVASCRIPT`, `PINNED`). Anything you click, such as the language filter ("All languages"), is in sentence case in the sans.
4. **One radius family:** 6 / 8 / 12, with full pills reserved for the header and segmented controls.
5. **Every control is 28, 32 or 40px tall.** No other heights.

---

## 3. Tokens

All tokens go in the `@theme` block in `app/globals.css`, so Tailwind 4 generates the utilities (`text-ui`, `bg-well`, `h-control`, and so on).

### Colour

```css
@theme {
  /* Surfaces, darkest to lightest */
  --color-well:    #08090a;  /* NEW: code wells and input fields; sunk below the page */
  --color-ink:     #0c0d0f;  /* page */
  --color-panel:   #141518;  /* list column, cards, header */
  --color-raised:  #1b1d21;  /* hover, selected, menus */
  --color-overlay: #202328;  /* NEW: dialogs and menus, so they lift above panels */

  /* Lines */
  --color-line:        #2a2d33;
  --color-line-strong: #3a3e46;  /* NEW: hover borders (replaces hover:border-muted) */

  /* Text, as solid colours instead of opacity */
  --color-text:   #e8e9ec;  /* primary */
  --color-text-2: #b6bac2;  /* NEW: secondary (replaces text/60…/85), 9.6:1 on panel */
  --color-muted:  #8b909a;  /* labels and meta, 5.9:1 on panel */
  --color-faint:  #5d626c;  /* NEW: disabled, placeholders, decoration only (not for content) */

  /* Accent */
  --color-accent:      #cefd53;
  --color-accent-ink:  #1a2106;
  --color-accent-soft: color-mix(in srgb, #cefd53 12%, transparent); /* NEW: selected tints */
  --color-accent-line: color-mix(in srgb, #cefd53 40%, transparent); /* NEW: selected borders */

  /* Status (unchanged) */
  --color-danger: #ff7a70;
  --color-add: #122a1a;  --color-add-text: #8fe3a5;
  --color-del: #331618;  --color-del-text: #ffa39b;
}
```

### Syntax theme ("Jig Night")

Write a custom Shiki theme and a matching CodeMirror `HighlightStyle` from these colours, so the read view and the editor look the same. Lime is kept out of code so the accent keeps its meaning.

| Token | Colour | Note |
| --- | --- | --- |
| Foreground | `#e8e9ec` | text |
| Comment | `#5d626c` italic | faint |
| Keyword, storage | `#e9c46a` | warm amber |
| String | `#9fd8a8` | mint |
| Number, constant | `#f2a57c` | apricot |
| Function | `#8cc8ff` | sky |
| Type, class | `#7fd6cf` | teal |
| Tag (HTML/Liquid) | `#ff9e8a` | coral |
| Punctuation, operator | `#8b909a` | muted |
| Selection | `accent-soft` | |
| Cursor | `#cefd53` | the only lime in code |

### Type

Fonts are loaded with `next/font/google`, which self-hosts the files at build time, so there are no runtime requests to Google and the installed app works offline.

- **Sans: Schibsted Grotesk** (400/500/600). It's a grotesk with some ink-trap character: technical without being cold, and uncommon in dev tools.
- **Mono: JetBrains Mono** (400/500). It has excellent code legibility, true italics for comments, and a small-caps-friendly uppercase for the engraved labels.
- Fallback option if the owner prefers fewer web fonts: keep the system sans but self-host JetBrains Mono. Most of the character comes from the mono.

| Token | Size / line height | Font | Use |
| --- | --- | --- | --- |
| `text-micro` | 11 / 16, +0.04em, uppercase | mono 500 | engraved labels, kbd, version chips |
| `text-meta` | 12 / 16 | mono 400 | meta line, times, counts, slugs |
| `text-ui` | 13 / 20 | sans 400/500 | list rows, buttons, menus, fields, code |
| `text-body` | 14 / 22 | sans 400 | descriptions, dialog text |
| `text-read` | 16 / 28 | sans 400 | rendered notes and instructions |
| `text-title` | 24 / 30, −0.015em | sans 600 | item title |
| `text-display` | 32 / 38, −0.02em | sans 600 | login, share page, empty states |

This replaces all ten ad-hoc sizes. Code uses `text-ui` in mono with a line height of 1.65.

### Spacing, sizing and radius

```css
@theme {
  --spacing: 4px;               /* Tailwind's default base: stay on the 4px grid */
  --height-control-sm: 28px;    /* icon buttons in bars, chips, menu items */
  --height-control:    32px;    /* standard buttons and fields */
  --height-control-lg: 40px;    /* login, share page, primary dialog button */
  --header-h: 56px;             /* was 64 */
  --header-gap: 12px;           /* space above the header */
  --pane-top: calc(var(--header-h) + var(--header-gap) * 2);
  --radius-sm: 6px;             /* chips, kbd, menu items */
  --radius-md: 8px;             /* buttons, fields, rows */
  --radius-lg: 12px;            /* panels, cards, dialogs */
}
```

`--pane-top` replaces `md:top-22` and the three `calc(100dvh-7.5rem)` values, so changing the header height changes everything that depends on it.

Rhythm:

- Gap between items in a group: 8px. Between groups in a pane: 24px. Between page sections: 40px.
- Panel padding is 16px everywhere, and dialogs are 24px.

---

## 4. Shared primitives (build these first)

Most of the inconsistency comes from inline class strings copied between files. Five small components remove it:

| Component | Replaces | Notes |
| --- | --- | --- |
| `Button` | ~40 inline button/link class strings | `variant: primary / secondary / ghost / danger`, `size: sm / md / lg`, `icon` (square). Works as `<button>` or `<Link>`. Keeps a fixed width while pending, with a small spinner instead of changing the label, so nothing shifts. |
| `Kbd` | 6 copies of the kbd markup | `text-micro`, the same on light and lime backgrounds. |
| `Meta` | per-page metadata markup | The engraved line: `v14 · mcp:claude-code · 2h ago`. Items separated by middle dots, mono, `text-meta text-muted`, with the version in `text-text-2`. |
| `Modal` | 3 dialog shells | Overlay, content, title, description, close button (an SVG icon instead of the `×` character), `size: sm / md`, 24px padding, `bg-overlay`, `rounded-lg`. |
| `MenuItem` + `menuItems(kind)` | 2 `Item` copies and 2 `NOUNS` maps | One list of actions shared by the right-click menu and the ⋯ menu, in the same order. Optional shortcut hint on the right. |

Also:

- `EmptyState` (a glyph, a heading, one line of text, an optional action and a kbd hint).
- `ItemHeader` (section 5.3), used by all three item pages.

---

## 5. Surface by surface

### 5.1 Header and nav

Now: a 64px pill with a heavy shadow, kbd hints on every tab, a Connect button, a divider and a labelled Log out button.

Proposed:

- Height 56px. Replace `shadow-lg shadow-black/40` with a 1px `line` border and a faint shadow. Once the page scrolls, add a slight `backdrop-blur` and a 92% opaque `panel` so content passes underneath softly.
- Tabs: **keep today's tabs**, at the owner's request: the active tab filled in lime, an icon on each tab, and the `1` `2` `3` hints always visible. Only the height changes, to 40px inside the 56px bar.
- The Snippets tab icon changes from `</>` chevrons to `{ }` braces (`SnippetsIcon` in `components/NavIcons.tsx`), so it no longer repeats the logo.
- Right side: a **search trigger** (`⌘K`, shown as a field-shaped button, "Search everything"), then the **theme button** (sun / moon, see 5.14), then Connect, then a ⋯ **account menu** holding Log out, Connect, Theme and "Keyboard shortcuts". Log out keeps its confirm dialog. Nothing is lost, and "Log out" stops competing with the sections.

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ [</] Jig   (█ Snippets 1 █) ( Notes 2 ) ( Credentials 3 )  [⌕ Search ⌘K] ☼ ⏻ ⋯ │
╰──────────────────────────────────────────────────────────────────────────────╯
```

The `⌘K` search can reuse the home page's cross-section search (`app/(app)/page.tsx` already searches all three sections). It's additive: every existing shortcut stays.

### 5.2 List column (split view)

Now: the toolbar spans both columns above the list; the column head holds a count and sort; selected rows get a lime tint and a lime title.

Proposed: **move the toolbar into the column.** The column becomes self-contained, and the pane starts at the top.

```
┌─ SNIPPETS ────────── 48 ─┐  ┌──────────────────────────────────────────────┐
│ [⌕ Filter…      ] [JS ▾] │  │  (item header, see 5.3)                      │
│ Recent ▾        [▦][≡] + │  │                                              │
├──────────────────────────┤  │                                              │
│ PINNED                   │  │                                              │
│▌GSAP scroll reveal      ◆│  │                                              │
│  JS · 2h · Fade-in on…   │  │                                              │
│  Lenis config            │  │                                              │
│  JS · 3d · Smooth scroll │  │                                              │
│ ALL                      │  │                                              │
│  Liquid product card     │  │                                              │
│  LIQ · 1w · Shopify card │  │                                              │
└──────────────────────────┘  └──────────────────────────────────────────────┘
```

- Column head: the section name as a `text-micro` engraved label with the count on the right. Below it, the filter field (32px, `bg-well`) and the language select. Then a row with sort, the G/L segmented control and an icon-only `+` button (tooltip "New snippet (N)"). The big lime "New snippet" button goes. `N` stays the fast path.
- Column width goes from 280 to **300px**, which gives descriptions room. `@container` queries can hide the description line when the column is narrow.
- Rows:
  - Title in `text-ui` 500.
  - Second line: `Meta` with a language code (`JS`, `PHP`, `LIQ`) in place of the icon plus time plus description.
  - Row height is fixed at 52px, so `↑`/`↓` scrolling is steady.
- Selected row: **keep today's style**: an `accent-soft` tint (lime at 10%) and the title in lime. The owner prefers it to a left bar, and it's the list's "indicator LED".
- Hover: `bg-raised/50`, no border change.
- Pinned group: a `PINNED` / `ALL` micro label instead of the unlabelled border line, with a small filled pin icon before `PINNED`. The pin icon on each row goes, since the group label says it.
- A tag filter shows as a removable chip in the column head (`#gsap ×`), as it does now.

### 5.3 Item page header and actions (one `ItemHeader` for all three sections)

Now: three different layouts, five equal boxes, metadata hidden in a dialog.

Proposed layout, the same for snippets, notes and credentials:

```
  SNIPPET · JAVASCRIPT                                    ◇  ⧗  ⤴   [ Edit ]  ⋯
  GSAP scroll reveal
  v14 · mcp:claude-code · 2h ago · 3 files · #gsap #animation
  Fade elements in as they enter the viewport, with a stagger.
```

- **Line 1, the engraved kicker** (`text-micro muted`): kind plus language (snippets), `NOTE`, or `CREDENTIAL · example.com`. This replaces the lime language chip.
- **Line 2, the title** (`text-title`), with actions on the right in the same row:
  - Pin, History and Share become **28px ghost icon buttons**: no borders, `muted` until hovered, with tooltips. Pin turns lime when on, because that's a state indicator and within the budget.
  - Edit is the single primary button (lime, 32px) and is the page's one lime fill.
  - ⋯ holds the rest. Credentials get the same row, minus History, and minus Pin until credentials support pinning.
- **Line 3, the `Meta` line**: version, saved by, time, file count, tags as `#tag` links in `text-2`. The Details dialog stays for the full list (slug, created date, change note, agent prompt), but the facts you need every day are now visible.
- **Line 4**: the description in `text-body text-2`, max 68ch.
- **Old version banner**: make it a slim strip directly under the header. `bg-well`, a 2px lime left border, "Viewing v9 of 14", then View latest (ghost) and Restore (secondary). It shouldn't be a lime-tinted box that competes with Edit.
- **Instructions for agents** (snippets): no longer shown on the item page, at the owner's request. They're still edited in the snippet form and sent to agents over MCP, and they're listed in the Details dialog (⋯ → Details…) for checking.

### 5.4 Code view

Now: stacked `figure`s with a name bar and a Copy button, GitHub theme, no line numbers.

Proposed:

- **The Jig Night theme** (section 3) for both Shiki and CodeMirror.
- **One code well per snippet, with file tabs** when there's more than one file. It uses `bg-well` and `rounded-lg`, the tabs sit in the well's top bar, and the active tab has a lime underline. With one file, the bar shows the file name. A "Show all files" toggle keeps the current stacked view for people who like scrolling through everything.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  reveal.js   reveal.css   README.md                          1.2 KB  [Copy] │
│  ────────                                                                    │
│   1  import { gsap } from "gsap";                                            │
│   2  import { ScrollTrigger } from "gsap/ScrollTrigger";                     │
│   3                                                                          │
│   4  gsap.registerPlugin(ScrollTrigger);                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Line numbers** in `faint`, not selectable (a CSS counter on Shiki's `.line`, or `@shikijs/transformers`).
- Copy is a ghost button with an icon and label. "Copied" swaps the icon for a check, keeping the same width.
- The file size is shown in meta mono, which helps you see how big a snippet is for an agent.
- The editor (`SnippetForm`) uses the same well and tabs. The file name field becomes the tab label when you edit it. Format and remove sit in the tab bar, and the Format error strip stays where it is, restyled to the danger colour on `well`.

### 5.5 Notes: reading and editing

Reading:

- **No bordered box.** The note renders straight on the page in `text-read` (16/28), with a max width of 68ch.
- Headings use the sans at 600, and inline code uses mono in `bg-raised`.
- Copy moves into the header actions (the "copy markdown" icon), so the `pr-20` gutter goes.
- Checklists get custom 16px checkboxes: a lime tick on `bg-well`, a `line-strong` border when empty.

Editing:

- The toolbar becomes **sticky** under the header (`top: var(--pane-top)`), so it stays in reach on long notes.
- Group toolbar buttons with hairline dividers as now, but make them 28px `control-sm`, active state `bg-raised text-text` (not lime).
- The "Markdown" toggle becomes a two-way segmented control ("Rich · Markdown").
- The editor surface is borderless on the page, and the same width and type as the reading view, so editing feels like reading with a cursor. Only the title field and the save bar look like a form.
- **A sticky save bar** at the bottom of the pane for all three forms: "What changed?", Cancel and Save, with `⌘↩` to save (an additive shortcut). Today the save row sits below everything and scrolls out of view on long snippets.

### 5.6 Credentials

- Use the same `ItemHeader`. The kicker is `CREDENTIAL · host.com`. The URL moves into the meta line as a link in `text-2` with an external-link icon, instead of a big lime mono line.
- Field rows:
  - Label in `text-micro` muted with a 140px column. Value in mono `text-ui`.
  - Actions are ghost icon buttons (eye / copy), which appear on hover and are always visible on touch.
  - A secret shows `•••• •••• ••••` in `faint`, followed by a small lock glyph.
  - Buttons keep a fixed width when Reveal becomes Hide.
- The encryption-key screen (`KeyMissing`) uses `EmptyState` with the micro label `ENCRYPTION KEY REQUIRED`, instead of a lime-tinted box.

### 5.7 Grid cards

Now: three different card anatomies.

Proposed: one `Card` anatomy for all three sections.

```
┌──────────────────────────────────┐
│ JS                            ◆  │   ← kicker (language / NOTE / host) + pin
│ GSAP scroll reveal               │   ← title, 15px 500
│ Fade elements in as they enter   │   ← 2 lines, text-2
│ the viewport, with a stagger.    │
│                                  │
│ v14 · 3 files · 2h · #gsap       │   ← Meta
└──────────────────────────────────┘
```

- For snippets, show a **3-line code peek** of the first file in `bg-well` in place of the description when there isn't one. It's the fastest way to recognise a snippet. The peek must be server-rendered with plain text and no Shiki, to keep the grid cheap.
- Hover: the border goes to `line-strong` and the card lifts 1px. Right-click keeps `ItemMenu`.
- Grid page heads match across the sections: the micro label `SNIPPETS · 48`, then the same toolbar as the column (filter, language, sort, G/L, +). Credentials keeps its "Agents can never read these" line as a sub-label under the head. The other sections get a one-line sub-label too, or none of them do.
- Tag chips stay as the filter row, restyled to `text-meta` mono in `rounded-sm`. The active tag uses `accent-soft` + `accent-line`, not a lime fill.

### 5.8 Modals and menus

- One `Modal` shell: `bg-overlay` (a step above panels, so dialogs visibly lift), `rounded-lg`, 24px padding, a `line` border, overlay `black/60` with a 2px blur (as now), and an SVG close icon.
  - `sm` (26rem) for confirm and details, `md` (36rem) for share.
- Confirm dialogs: the title is `text-body` 600 and the message `text-2`. Buttons are right-aligned: Cancel (secondary), then the action (primary or danger). The dialog can be confirmed with `↩`.
- **Share dialog:**
  - Replace the lime option pills with **segmented controls** (a `well` track, the selected option `bg-raised text-text`). The only lime is the "Create link" button.
  - The "created" state is a `well` panel with the link and passcode as mono fields with Copy.
  - Existing links use the row style from 5.2. The status appears as a micro label (`ACTIVE` in lime, others muted), and "Turn off" is a ghost danger button.
- **Menus:**
  - `bg-overlay` with 28px items and `rounded-sm` highlights.
  - Icons in `muted`, and optional shortcut hints right-aligned in `Kbd`.
  - One shared action list, the same in both menus: Pin · Clone · Copy for agent · Share… · Open in new tab · Details… | Delete….

### 5.9 Empty states

Use one `EmptyState` everywhere:

- A small line-art glyph drawn from the logo's chevrons: a bracket shape `⟨ ⟩` holding nothing, like an empty jig.
- A `text-body` 600 heading, one `text-2` line, an optional action, and a kbd hint.
- No dashed boxes.

| Where | Heading | Line | Action |
| --- | --- | --- | --- |
| `PickPane` (nothing selected) | *(none)* | `↑ ↓ to browse · N for a new snippet` | the glyph only. Quiet, top-aligned at a third of the pane's height, not a giant dashed box |
| Empty section | "No snippets yet" | "Add one, or ask a connected agent to save one." | New snippet · Connect an agent |
| No search results | "Nothing matches “gsap”" | "Search looks in titles, tags and code." | Clear filters |
| Empty note | "This note is empty" | | Edit |

`PickPane` could also list the five most recently edited items in the section as a quick jump (data the layout already has in memory in list view).

### 5.10 Login

Login is the first thing a new deployer sees, so it can carry more character than the app itself.

```
                    [</]  Jig

                    Your snippet library.
                    ─────────────────────────
                    PASSWORD
                    [••••••••••••          ]
                    [        Log in        ]   ← 40px, lime

                    Forgot your password?
```

- The title is `text-display`. The field is 40px on `bg-well`.
- The background gets a faint dotted grid (a 1px `line` dot every 24px, masked to fade out at the edges). That's the one piece of atmosphere in the app, and it echoes a workbench cutting mat.
- The error shakes the field once (120ms, reduced-motion safe) and shows in `danger` under it. Keep the "Forgot your password?" details as they are, but style them with `EmptyState` typography.

### 5.11 Share page (`/s/[token]`)

This page is seen by people who don't know Jig, so it should look finished and trustworthy.

- A slim top strip: the logo on the left, and on the right `READ-ONLY · EXPIRES 3 OCT, 14:00` in micro mono (or `SHARED FROM JIG`).
- The body uses the same `ItemHeader` anatomy without the actions, and the same code well with tabs or the same reading view as the dashboard. A shared snippet then looks like the real thing.
- Gates (the passcode prompt, "View snippet" for limited links, and the closed and expired messages) use a centred `sm` card on the dotted grid from the login page. Each has a clear micro-label state (`PASSCODE REQUIRED`, `LINK EXPIRED`), a `text-display` heading and one line.
- Credential shares show the same field rows as 5.6.

### 5.12 Keyboard shortcuts sheet (additive)

- `?` opens a small `Modal` listing every shortcut: `1` `2` `3`, `N`, `G`/`L`, `↑`/`↓`, plus the new additive `⌘K` and `⌘↩`.
- While `?` is held, the kbd hints fade in across the UI.
- This lets the header, toolbar and New buttons drop their always-on kbd badges without making the shortcuts harder to find.
- It follows the rules in `AppShortcuts`: ignored while typing, and ignored on new and edit pages.

### 5.13 Mobile

- The header shrinks to logo, search and ⋯ at 48px.
- **The section nav moves to a bottom tab bar:** Snippets · Notes · Credentials · Connect, 56px plus the safe area, with the active tab marked by the lime dot. It replaces the second pill row, which takes vertical space and scrolls sideways today.
- **A floating `+` button** above the tab bar on section pages, the touch version of `N`.
- Item page: the kicker, title and meta line stack. Edit stays visible, and Pin, History and Share move into ⋯, so the title keeps its width.
- The code well scrolls sideways inside itself (it already does). File tabs scroll sideways, and line numbers are hidden below 400px.
- Rows and menu items are at least 44px tall on touch (`@media (pointer: coarse)`).
- The share dialog becomes a bottom sheet under 640px, using the same Radix Dialog with different content classes.

### 5.14 Light and dark theme

A theme button in the header (a sun in dark mode, a moon in light mode) switches between the two. The account menu offers **System · Light · Dark**. System is the default and follows the OS.

**How it works**

- The choice is stored in a `theme` cookie, the same way the list layout and sort already are (`lib/prefs.ts`). The root layout reads it on the server and sets `data-theme="light"` or `"dark"` on `<html>`, or leaves it off for System. The first paint is right, with no flash and no client script before hydration.
- Colours are CSS variables already (the `@theme` tokens), so light mode overrides the same names. It does this under `:root[data-theme="light"]`, and under `@media (prefers-color-scheme: light)` for `:root:not([data-theme])`. `color-scheme` follows, so scrollbars and form controls match.
- **Shiki** renders both themes at once (`themes: { dark: jigNight, light: jigDay }`, `defaultColor: false`), and CSS picks one. Switching needs no re-render and no server call.
- **CodeMirror** gets its theme from the same setting through a `Compartment`, so the editor changes in place without losing the cursor or undo history.
- Add `<meta name="theme-color">` for each scheme, so the installed app's title bar matches too.
- No keyboard shortcut is added (none of the free letters is an obvious fit). It's easy to add one later.

**Light palette: Graphite with slate blue** (the owner's pick, option 2a on the canvas). The greys are cool and neutral, with no warm beige. **In light mode, lime is only in the logo.** Everything the accent does in dark mode, slate blue does in light mode.

| Token | Dark | Light |
| --- | --- | --- |
| `well` | `#08090a` | `#f7f8fa` |
| `ink` (page) | `#0c0d0f` | `#f2f3f5` |
| `panel` | `#141518` | `#ffffff` |
| `raised` | `#1b1d21` | `#eaecef` |
| `overlay` | `#202328` | `#ffffff` (with a stronger shadow) |
| `line` / `line-strong` | `#2a2d33` / `#3a3e46` | `#dfe2e6` / `#c6cad1` |
| `text` / `text-2` | `#e8e9ec` / `#b6bac2` | `#111317` / `#42464d` |
| `muted` / `faint` | `#8b909a` / `#5d626c` | `#666b74` / `#9a9fa8` |
| `accent` (fills) | `#cefd53` lime | `#4a6fa5` slate blue |
| `accent-ink` (text on fills) | `#1a2106` | `#ffffff` (5.1:1) |
| `accent-text` **NEW** (accent as text or an icon) | `#cefd53` | `#34568a` (7.4:1 on white) |
| `accent-soft` (selected row tint) | lime at 10% | `#e9eef6` |
| `brand` **NEW** (the logo only) | `#cefd53` | `#cefd53` |

- The **active tab** and **Edit** are slate blue with white text.
- The **selected row** gets the pale blue tint with a slate-blue title.
- The **pinned icon** and the **active code-tab underline** are slate blue.
- The **logo** keeps its lime tile with dark chevrons in both themes. It reads `brand`, not `accent`, so it never changes with the theme.

Dark mode keeps lime as its accent, as shown on every dark screen. (The owner hasn't said whether dark mode should also drop lime. Nothing in dark mode changes unless they ask.)

**Jig Day syntax colours:** keyword `#8250df`, string `#116329`, number `#953800`, function `#0550ae`, type `#0a6e75`, tag `#b3261e`, punctuation `#666b74`, comment `#9a9fa8` italic.

**Work involved:** once the Phase 0 and Phase 1 token work has removed the hard-coded colours, light mode is mostly the override block above, the cookie and the button. Before that, the ~40 hard-coded and opacity-based colours (`text-text/75`, `bg-black/60`, `border-accent/40`, …) would each need checking. So it belongs in Phase 2.

---

## 6. Phased rollout

Each phase can ship on its own. Phases 0 and 1 change no behaviour, only presentation, so they're low-risk for deployed copies. None of the phases touch the schema.

### Phase 0: quick wins (about 1–2 days, 1–3 hours each)

| # | Change | Files | Effect |
| --- | --- | --- | --- |
| 0.1 | Add the colour tokens (`text-2`, `faint`, `line-strong`, `well`, `overlay`, `accent-soft`) and replace `text-text/60…/85` and `hover:border-muted` | `globals.css`, search-and-replace | consistent secondary text |
| 0.2 | Add `--header-h` / `--pane-top` and replace `top-22` and the three `calc(100dvh-7.5rem)` | `globals.css`, `SplitList`, `PickPane`, history pages | removes hidden coupling |
| 0.3 | **Lime diet**: the language chip becomes a neutral kicker, share options become neutral segments, the restore banner becomes neutral | item pages, `SplitList`, `ShareDialog` | the accent starts meaning something again |
| 0.4 | Extract `MenuItem` and one shared action list, so both menus match | `ItemMenu`, `MoreMenu` | consistency, less code |
| 0.5 | Extract the `Modal` shell with the SVG close icon | `ConfirmButton`, `MoreMenu`, `ShareDialog` | one dialog style |
| 0.6 | Show the `Meta` line under every item title (the data is already loaded) | 3 item pages | agent activity becomes visible |
| 0.7 | Item actions become ghost icon buttons, with Edit as the only filled button | 3 item pages, `PinButton`, `ShareButton` | clear hierarchy |
| 0.8 | Move Log out into a ⋯ account menu | `(app)/layout.tsx` | a calmer header |
| 0.9 | Buttons and Copy keep a fixed width while pending ("Copied", "Revealing") | `CopyButton`, `SecretValue`, `DialogAction` | no layout shift |

### Phase 1: structure (about 3–5 days)

1. Add the `Button`, `Kbd`, `Meta` and `EmptyState` primitives, and the type-scale tokens. Move all arbitrary `text-[Npx]` and `size-[34px]` values onto the scale.
2. Add `ItemHeader`, used by snippets, notes and credentials, and by the share page without actions.
3. **Move the toolbar into the list column** (5.2), and have one `SectionToolbar` serve both the column and the grid head. This removes `GridToolbar`'s duplicate and the grid pages' inline forms.
   - Keep `window.location` for `?q=`, and don't introduce `useSearchParams` or Suspense.
   - The grid pages' existing `SearchInput` already uses `useSearchParams`. Check it isn't rendered under a layout that would now need a boundary. If it is, switch it to the same `window.location` pattern.
4. Add the Jig Night Shiki theme and the matching CodeMirror theme.
5. Replace the three grid card styles with one `Card` anatomy.

### Phase 2: character (about 3–4 days)

1. Fonts: Schibsted Grotesk and JetBrains Mono through `next/font`, with the engraved micro labels.
2. Code well with file tabs and line numbers, in the read view and the editor.
3. Notes reading view (no box, `text-read`), a sticky editor toolbar, and a sticky save bar with `⌘↩`.
4. Login and the share page with the dotted grid, and the share page matching the dashboard's item anatomy.
5. Empty states and the quieter `PickPane` with a recent-items list.
6. **Light and dark theme** (5.14): the Graphite and slate-blue light overrides, the `theme` cookie with a header button and a menu entry, the Jig Day Shiki and CodeMirror themes, and the new `accent-text` and `brand` tokens.

### Phase 3: navigation and mobile (about 3–5 days)

1. The `⌘K` search palette, reusing the home page's cross-section search.
2. The `?` shortcuts sheet and hold-to-reveal kbd hints. Then remove the always-on kbd badges, except on the section tabs, which keep theirs.
3. Mobile: the bottom tab bar, the `+` floating button, a bottom-sheet share dialog, and 44px touch targets.
4. The header shrinks to 56px with a scroll-aware blur.
5. The history page adopts the list row style from 5.2 for its version list.

### Checks for every phase

- `bun run typecheck` and `bun run test` pass. Nothing in `lib/` should change.
- Every shortcut still works manually (`1` `2` `3`, `N`, `G`/`L`, `↑`/`↓`), and they're still ignored while typing and on new and edit pages.
- The code editor and notes editor still mount and hydrate on item, new and edit pages: the regression that the no-Suspense rule exists to prevent.
- No focus outline appears on buttons or links, in Chrome and Safari.
- Screenshots at 390px and 1440px before and after each phase.

---

## 7. Open questions for the owner

1. ~~Lime on the active nav tab or on the primary action?~~ Decided: both, as today.
2. **Web fonts:** is loading Schibsted Grotesk and JetBrains Mono acceptable, or should Jig self-host only the mono?
3. **File tabs vs stacked files:** should tabs be the default for multi-file snippets, with "Show all" as the option, or the other way round?
4. **`⌘K`:** worth adding, given that `1` `2` `3` plus the column filter already cover most navigation?
