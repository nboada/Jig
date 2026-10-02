const PAGES = "jig-pages-v1";
const STATIC = "jig-static-v1";
const MAX_PAGES = 150;
const CACHEABLE = /^\/((snippets|notes)(\/[^/]+)?)?$/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "forget") event.waitUntil(caches.delete(PAGES));
  if (event.data?.save) {
    const url = new URL(event.data.save, self.location.origin);
    if (url.origin === self.location.origin && CACHEABLE.test(url.pathname)) {
      event.waitUntil(fetch(url, { credentials: "same-origin" }).then((r) => remember(url, r), () => {}));
    }
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(page(request, url));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function page(request, url) {
  try {
    const response = await fetch(request);
    await remember(url, response.clone());
    return response;
  } catch {
    const cache = await caches.open(PAGES);
    return (await cache.match(url.pathname + url.search)) ?? (await cache.match(url.pathname)) ?? offline();
  }
}

async function remember(url, response) {
  const final = new URL(response.url || url.href);
  if (final.pathname === "/login") return caches.delete(PAGES);
  if (!response.ok || !CACHEABLE.test(final.pathname)) return;
  if ((await response.clone().text()).includes('name="jig-offline" content="skip"')) return;

  const cache = await caches.open(PAGES);
  const key = final.pathname + final.search;
  await cache.delete(key);
  await cache.put(key, response);
  if (response.redirected && url.pathname + url.search !== key) {
    await cache.put(url.pathname + url.search, Response.redirect(final.href, 302));
  }
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_PAGES)).map((k) => cache.delete(k)));
}

function offline() {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#181818"><title>Offline · Jig</title>
<body style="margin:0;min-height:100dvh;display:grid;place-items:center;background:#181818;color:#e8e6e3;font:15px/1.5 system-ui,sans-serif;text-align:center;padding:0 24px">
<div><p style="font-weight:600;margin:0 0 6px">You're offline</p><p style="margin:0 0 18px;color:#9a9893">This page hasn't been opened on this device yet, so there's no saved copy.</p>
<a href="/" style="color:#e8e6e3">Go to saved pages</a></div></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
