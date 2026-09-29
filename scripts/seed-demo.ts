/**
 * Fills a separate local database with demo content for screenshots. It never touches your own
 * data: it writes to .data/demo (or the directory given as the first argument), which the app
 * reads when started with JIG_PGLITE_DIR=.data/demo. Every credential value here is made up.
 *
 *   JIG_ENCRYPTION_KEY=$(openssl rand -base64 32) bun scripts/seed-demo.ts
 */
import { rm } from "node:fs/promises";
import { createCredential } from "../lib/credentials";
import { encryptionReady } from "../lib/crypto";
import { pgliteDb, prepare, type Db } from "../lib/db";
import { createNote, setNotePinned, updateNote } from "../lib/notes";
import { createSnippet, setSnippetPinned, updateSnippet } from "../lib/snippets";

const dir = process.argv[2] ?? ".data/demo";

const SNIPPETS: Parameters<typeof createSnippet>[1][] = [
  {
    title: "GSAP ScrollTrigger with Lenis",
    language: "javascript",
    tags: ["gsap", "lenis", "scroll", "animation"],
    description: "Runs Lenis smooth scrolling on GSAP's ticker so ScrollTrigger animations stay in sync with the scroll position.",
    dependencies: ["gsap@^3.13", "lenis@^1.3"],
    instructions:
      "Import once in the site's entry file, before any ScrollTrigger animations are created. Remove any other `requestAnimationFrame` loop that calls `lenis.raf`.",
    files: [
      {
        name: "smooth-scroll.js",
        content: `import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export const lenis = new Lenis({
  lerp: 0.1,
  wheelMultiplier: 0.9,
});

// Drive Lenis from GSAP's clock so both update on the same frame.
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  lenis.destroy();
}
`,
      },
    ],
  },
  {
    title: "Reveal on scroll",
    language: "javascript",
    tags: ["gsap", "animation", "scroll"],
    description: "Fades and lifts any element marked data-reveal as it enters the viewport, with optional stagger for groups.",
    dependencies: ["gsap@^3.13"],
    files: [
      {
        name: "reveal.js",
        content: `import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function initReveal(scope = document) {
  scope.querySelectorAll("[data-reveal]").forEach((el) => {
    const children = el.hasAttribute("data-reveal-stagger") ? el.children : el;
    gsap.from(children, {
      y: 32,
      opacity: 0,
      duration: 0.9,
      ease: "power3.out",
      stagger: 0.08,
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });
  });
}
`,
      },
      {
        name: "reveal.css",
        content: `/* Hide until the script runs, so nothing flashes in before it animates. */
.js [data-reveal] {
  visibility: hidden;
}

.js [data-reveal].is-ready {
  visibility: visible;
}
`,
      },
    ],
  },
  {
    title: "Header that hides on scroll",
    language: "typescript",
    tags: ["header", "scroll", "ui"],
    description: "Slides the header away when scrolling down and brings it back on the way up.",
    files: [
      {
        name: "header-scroll.ts",
        content: `export function initHeaderScroll(header: HTMLElement, threshold = 80) {
  let last = window.scrollY;

  const update = () => {
    const y = window.scrollY;
    const goingDown = y > last && y > threshold;
    header.classList.toggle("is-hidden", goingDown);
    header.classList.toggle("is-scrolled", y > 8);
    last = y;
  };

  window.addEventListener("scroll", update, { passive: true });
  update();
  return () => window.removeEventListener("scroll", update);
}
`,
      },
    ],
  },
  {
    title: "Fluid type scale",
    language: "css",
    tags: ["typography", "tokens", "responsive"],
    description: "A clamp() based type scale that grows smoothly from a 375px phone to a 1440px desktop.",
    files: [
      {
        name: "type-scale.css",
        content: `:root {
  --step--1: clamp(0.83rem, 0.8rem + 0.15vw, 0.94rem);
  --step-0: clamp(1rem, 0.95rem + 0.24vw, 1.16rem);
  --step-1: clamp(1.2rem, 1.12rem + 0.4vw, 1.46rem);
  --step-2: clamp(1.44rem, 1.31rem + 0.63vw, 1.85rem);
  --step-3: clamp(1.73rem, 1.53rem + 0.96vw, 2.35rem);
  --step-4: clamp(2.07rem, 1.78rem + 1.44vw, 3rem);
  --step-5: clamp(2.49rem, 2.06rem + 2.11vw, 3.86rem);
}

h1 { font-size: var(--step-5); line-height: 1.05; }
h2 { font-size: var(--step-4); line-height: 1.1; }
h3 { font-size: var(--step-2); line-height: 1.2; }
body { font-size: var(--step-0); }
`,
      },
    ],
  },
  {
    title: "Snap scroll slider",
    language: "css",
    tags: ["scroll-snap", "slider", "no-js"],
    description: "A Swiper-style row in plain CSS: slides per view, gap and peeking set with custom properties.",
    files: [
      {
        name: "snap-scroll.css",
        content: `.snap {
  --snap-per-view: 1.15;
  --snap-gap: 1rem;

  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: calc((100% - (var(--snap-per-view) - 1) * var(--snap-gap)) / var(--snap-per-view));
  gap: var(--snap-gap);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
}

.snap > * {
  min-width: 0;
  scroll-snap-align: start;
}

@media (min-width: 1024px) {
  .snap { --snap-per-view: 3; }
}
`,
      },
    ],
  },
  {
    title: "WordPress AJAX with nonce",
    language: "php",
    tags: ["wordpress", "ajax", "security"],
    description: "Registers an AJAX action for logged-in and public visitors, checks the nonce and returns JSON.",
    instructions: "Add to the theme's functions.php or a small plugin. Localise the nonce into the script that makes the request.",
    files: [
      {
        name: "ajax-load-posts.php",
        content: `<?php
add_action('wp_ajax_load_posts', 'jig_load_posts');
add_action('wp_ajax_nopriv_load_posts', 'jig_load_posts');

function jig_load_posts() {
    check_ajax_referer('load_posts', 'nonce');

    $page = max(1, (int) ($_POST['page'] ?? 1));
    $query = new WP_Query([
        'post_type'      => 'post',
        'posts_per_page' => 6,
        'paged'          => $page,
    ]);

    ob_start();
    while ($query->have_posts()) {
        $query->the_post();
        get_template_part('parts/card', 'post');
    }
    wp_reset_postdata();

    wp_send_json_success([
        'html' => ob_get_clean(),
        'more' => $page < $query->max_num_pages,
    ]);
}
`,
      },
    ],
  },
  {
    title: "ACF fields into JavaScript",
    language: "php",
    tags: ["wordpress", "acf"],
    description: "Passes ACF option values to a script with wp_localize_script instead of printing inline JSON.",
    files: [
      {
        name: "acf-to-js.php",
        content: `<?php
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_script('site', get_theme_file_uri('dist/site.js'), [], null, true);

    wp_localize_script('site', 'SiteSettings', [
        'ajaxUrl'  => admin_url('admin-ajax.php'),
        'nonce'    => wp_create_nonce('load_posts'),
        'mapStyle' => get_field('map_style', 'option') ?: 'dark',
        'phone'    => get_field('phone_number', 'option'),
    ]);
});
`,
      },
    ],
  },
  {
    title: "Shopify product card",
    language: "liquid",
    tags: ["shopify", "product", "ecommerce"],
    description: "A product card section with the sale badge, compare-at price and a lazy-loaded responsive image.",
    files: [
      {
        name: "product-card.liquid",
        content: `{%- liquid
  assign on_sale = false
  if product.compare_at_price > product.price
    assign on_sale = true
  endif
-%}

<a href="{{ product.url }}" class="product-card">
  <div class="product-card__media">
    {{ product.featured_image | image_url: width: 800 | image_tag: loading: 'lazy', sizes: '(min-width: 990px) 25vw, 50vw' }}
    {%- if on_sale -%}
      <span class="badge badge--sale">{{ 'products.sale' | t }}</span>
    {%- endif -%}
  </div>
  <h3 class="product-card__title">{{ product.title }}</h3>
  <p class="product-card__price">
    {{ product.price | money }}
    {%- if on_sale %} <s>{{ product.compare_at_price | money }}</s>{% endif -%}
  </p>
</a>
`,
      },
    ],
  },
  {
    title: "useDebounce hook",
    language: "tsx",
    tags: ["react", "hooks", "utility"],
    description: "Returns a value that only updates after it has stopped changing for the given delay.",
    files: [
      {
        name: "use-debounce.ts",
        content: `import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
`,
      },
    ],
  },
  {
    title: "Astro responsive image",
    language: "astro",
    tags: ["astro", "images", "performance"],
    description: "Wraps astro:assets Picture with AVIF and WebP, sensible widths and a blurred placeholder.",
    files: [
      {
        name: "Img.astro",
        content: `---
import { Picture } from "astro:assets";
import type { ImageMetadata } from "astro";

interface Props {
  src: ImageMetadata;
  alt: string;
  sizes?: string;
  eager?: boolean;
}

const { src, alt, sizes = "100vw", eager = false } = Astro.props;
---

<Picture
  src={src}
  alt={alt}
  sizes={sizes}
  widths={[480, 768, 1200, 1600]}
  formats={["avif", "webp"]}
  loading={eager ? "eager" : "lazy"}
  fetchpriority={eager ? "high" : "auto"}
/>
`,
      },
    ],
  },
  {
    title: "Deploy to staging",
    language: "bash",
    tags: ["deploy", "rsync", "ops"],
    description: "Builds the theme and syncs it to the staging server, skipping node_modules and source files.",
    files: [
      {
        name: "deploy-staging.sh",
        content: `#!/usr/bin/env bash
set -euo pipefail

HOST="deploy@staging.example.com"
TARGET="/var/www/staging/wp-content/themes/site"

npm run build

rsync -az --delete \\
  --exclude node_modules \\
  --exclude src \\
  --exclude .git \\
  ./ "$HOST:$TARGET"

echo "Deployed to https://staging.example.com"
`,
      },
    ],
  },
  {
    title: "Slow query finder",
    language: "sql",
    tags: ["postgres", "performance"],
    description: "Lists the queries that take the most total time, from pg_stat_statements.",
    files: [
      {
        name: "slow-queries.sql",
        content: `SELECT
  round(total_exec_time::numeric, 1) AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  left(query, 120) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
`,
      },
    ],
  },
];

const NOTES: Parameters<typeof createNote>[1][] = [
  {
    title: "Website launch checklist",
    tags: ["launch", "checklist"],
    body: `## Before launch

- [x] Redirects from the old site mapped and tested
- [x] Favicons, social images and page titles
- [x] Forms send to the right inbox
- [ ] Analytics and consent banner live
- [ ] Lighthouse over 90 on mobile

## On the day

1. Lower the DNS TTL the day before.
2. Point the domain and check SSL.
3. Submit the sitemap in Search Console.

> Keep the old site running on a subdomain for a week, just in case.
`,
  },
  {
    title: "Client onboarding",
    tags: ["process", "clients"],
    body: `## First week

- Kick-off call: goals, audience, three sites they like
- Shared folder for brand assets and copy
- Access: domain registrar, hosting, analytics

## What we ask for

| Item | Owner | Due |
| --- | --- | --- |
| Logo files (SVG) | Client | Week 1 |
| Page copy | Client | Week 2 |
| Photography | Client | Week 3 |
`,
  },
  {
    title: "Staging and deploy runbook",
    tags: ["deploy", "ops"],
    body: `## Staging

Every push to \`develop\` deploys to staging automatically. Check the preview before merging.

## Production

1. Merge \`develop\` into \`main\`.
2. Tag the release: \`git tag v1.4.0 && git push --tags\`.
3. Watch the deploy, then clear the CDN cache.

**Rollback:** redeploy the previous tag from the hosting dashboard.
`,
  },
  {
    title: "Design decisions: Harbour rebrand",
    tags: ["design", "harbour"],
    body: `## Type

Headlines in a tight grotesk, body in a humanist sans at 17px. Fluid scale from 375 to 1440.

## Colour

- Ink **#0f1720** for text
- Harbour blue **#1e5eff** for links and buttons only
- No gradients

## Motion

Short and quiet: 300ms reveals, no parallax on mobile.
`,
  },
  {
    title: "Page speed wins",
    tags: ["performance"],
    body: `- Preload the hero image and the headline font, nothing else.
- Lazy-load video embeds behind a poster image.
- Load chat widgets and maps on first interaction.
- Serve AVIF with a WebP fallback.
- Keep third-party scripts under 100 KB total.
`,
  },
  {
    title: "Font licences",
    tags: ["fonts", "legal"],
    body: `Web licences are per domain and per monthly page views.

- **Harbour:** licensed for harbour.example up to 250k views a month.
- **Northwind:** uses Google Fonts only, no licence needed.

Renewals go in the shared calendar a month before they expire.
`,
  },
];

const CREDENTIALS: Parameters<typeof createCredential>[1][] = [
  {
    title: "Harbour WordPress admin",
    url: "https://harbour.example/wp-admin",
    tags: ["wordpress", "harbour"],
    note: "Admin account for the client site. Editors have their own logins.",
    fields: [
      { label: "Username", secret: false, value: "studio-admin" },
      { label: "Password", secret: true, value: "demo-Tide-Lantern-4821" },
    ],
  },
  {
    title: "Staging server",
    url: "ssh://deploy@staging.example.com",
    tags: ["ops", "ssh"],
    fields: [
      { label: "Host", secret: false, value: "staging.example.com" },
      { label: "User", secret: false, value: "deploy" },
      { label: "Password", secret: true, value: "demo-Copper-Meadow-0937" },
    ],
  },
  {
    title: "Mapbox token",
    url: "https://account.mapbox.com",
    tags: ["api", "maps"],
    note: "Public token, restricted to the production and staging domains.",
    fields: [{ label: "Access token", secret: true, value: "demo-mapbox-7d1f0c9b2e4a" }],
  },
  {
    title: "Northwind Shopify",
    url: "https://northwind.example/admin",
    tags: ["shopify", "northwind"],
    fields: [
      { label: "Store", secret: false, value: "northwind-demo.myshopify.example" },
      { label: "Staff email", secret: false, value: "dev@studio.example" },
      { label: "Password", secret: true, value: "demo-Orchid-Harbor-5513" },
    ],
  },
  {
    title: "Newsletter API",
    url: "https://newsletter.example/settings/api",
    tags: ["api", "email"],
    fields: [
      { label: "API key", secret: true, value: "demo-news-3c8e61a0f5b2" },
      { label: "List ID", secret: false, value: "a1b2c3d4" },
    ],
  },
];

/** Spread the dates out, so the list reads "2 hours ago", "3 days ago" and so on. */
async function backdate(db: Db, table: "snippets" | "notes" | "credentials", slug: string, hoursAgo: number) {
  const at = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  await db.query(`UPDATE ${table} SET created_at = $2::timestamptz - interval '9 days', updated_at = $2 WHERE slug = $1`, [slug, at]);
  if (table === "credentials") return;
  const versions = table === "snippets" ? "snippet_versions" : "note_versions";
  const key = table === "snippets" ? "snippet_id" : "note_id";
  // Older versions a few days apart, the latest at the new time.
  await db.query(
    `UPDATE ${versions} v SET created_at = $2::timestamptz - (t.current_version - v.version) * interval '2 days'
       FROM ${table} t WHERE t.id = v.${key} AND t.slug = $1`,
    [slug, at],
  );
}

async function main() {
  if (!encryptionReady()) throw new Error("Set JIG_ENCRYPTION_KEY (openssl rand -base64 32) so the credentials can be saved.");
  await rm(dir, { recursive: true, force: true });
  const db = await prepare(await pgliteDb(dir));

  const hours = [2, 5, 20, 30, 50, 70, 96, 120, 150, 200, 260, 330];
  for (const [i, input] of SNIPPETS.entries()) {
    const snippet = await createSnippet(db, input, i % 3 === 0 ? "mcp:claude-code" : "web");
    await backdate(db, "snippets", snippet.slug, hours[i] ?? 400);
  }

  // A little history to show on the History page.
  const gsap = "gsap-scrolltrigger-with-lenis";
  const first = SNIPPETS[0].files[0].content;
  await updateSnippet(db, gsap, { files: [{ name: "smooth-scroll.js", content: first.replace("lerp: 0.1", "lerp: 0.08") }], message: "Softer easing" }, "web");
  await updateSnippet(
    db,
    gsap,
    {
      files: [{ name: "smooth-scroll.js", content: first.replace("lerp: 0.1", "lerp: 0.08").replace("wheelMultiplier: 0.9", "wheelMultiplier: 1") }],
      dependencies: ["gsap@^3.13", "lenis@^1.3.4"],
      message: "Bump Lenis, reset wheel speed",
    },
    "mcp:claude-code",
  );
  await backdate(db, "snippets", gsap, 2);
  await setSnippetPinned(db, gsap, true);
  await setSnippetPinned(db, "fluid-type-scale", true);

  const noteHours = [3, 26, 48, 75, 140, 300];
  for (const [i, input] of NOTES.entries()) {
    const note = await createNote(db, input, "web");
    await backdate(db, "notes", note.slug, noteHours[i] ?? 400);
  }
  await updateNote(db, "website-launch-checklist", { body: `${NOTES[0].body}\n## After launch\n\n- Check 404s in Search Console after a week\n`, message: "Added after-launch steps" });
  await backdate(db, "notes", "website-launch-checklist", 3);
  await setNotePinned(db, "website-launch-checklist", true);

  const credentialHours = [4, 40, 90, 160, 280];
  for (const [i, input] of CREDENTIALS.entries()) {
    const credential = await createCredential(db, input);
    await backdate(db, "credentials", credential.slug, credentialHours[i] ?? 400);
  }

  console.log(`Seeded ${SNIPPETS.length} snippets, ${NOTES.length} notes and ${CREDENTIALS.length} credentials into ${dir}.`);
}

await main();
