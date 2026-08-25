/* SYRIUS SOCIAL service worker — precache the shell, cache-first for brand
   assets, network-first for pages, branded offline fallback. No workbox. */

const CACHE = "syrius-sw-v2";
const PRECACHE = ["/", "/icons/icon-192.png", "/logo/favicon.svg"];

/* Nothing behind the gangway is written to disk. The navigation branch used to
   cache every response it saw — /card, /stub/<code>, /sign/<token>, even a 500
   and the sign-in page — into one origin-wide cache that outlived signing out.
   On a shared or resold phone, a failed fetch fell through to the previous
   member's boarding stub. These paths are also the ones the server marks
   `Cache-Control: private, no-store`; the worker was overriding that. */
const PRIVATE = [
  "/home", "/card", "/manifest", "/portal", "/account", "/inbox", "/you",
  "/threads", "/open-deck", "/directory", "/matches", "/tables", "/live",
  "/agreements", "/regattas", "/slop-chest", "/stub", "/sign", "/kiosk",
  "/bridge", "/gangway", "/api",
];

function isPrivate(pathname) {
  return PRIVATE.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · SYRIUS SOCIAL</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0B0B0C;color:#F2F2F4;font:400 14px/1.6 Georgia,serif;text-align:center}
main{padding:32px;max-width:34ch}h1{font-weight:400;font-size:26px;margin:0 0 10px}
p{color:#9A9AA3;margin:0}
span{display:block;margin-top:22px;font:600 9px monospace;letter-spacing:.2em;color:#5C5C66}</style>
</head><body><main><h1>No signal past the breakwater.</h1>
<p>You're offline. What you've loaded keeps working; the rest returns with the signal.</p>
<span>SYRIUS SOCIAL · EST. MMXXIV</span></main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Brand assets: cache-first, fill the cache as they arrive. */
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/logo/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  /* Navigations: network-first; fall back to cache, then the offline page.
     Only public pages are ever written, and only when they actually succeeded
     — caching a 500 or a redirect to the gangway under the address the member
     asked for is how a broken page becomes a sticky one. */
  if (request.mode === "navigate") {
    const priv = isPrivate(url.pathname);
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (!priv && res.status === 200 && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          /* Only the page that was asked for. Falling back to caches.match("/")
             rendered the HOMEPAGE under the requested URL — a member offline on
             /charters/some-slug got the front page wearing that address, which
             reads as "this sailing is the homepage" rather than as "you are
             offline". A wrong page is worse than an honest card. */
          const hit = priv ? null : await caches.match(request);
          return (
            hit || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html" } })
          );
        })
    );
  }
});

/* — The word, pushed —
   send-push delivers {title, body, url}; the outbox is filled by a trigger on
   notifications. Anything unreadable still surfaces as a plain word. */

/* Signing out clears what was kept. The route only ends the Supabase session;
   Cache Storage is the worker's, so the worker has to be told. */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SYRIUS_SIGNED_OUT") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json() || {};
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || "SYRIUS SOCIAL";
  const url = payload.url || "/inbox";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag || url,
      renotify: Boolean(payload.tag),
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/inbox",
    self.location.origin
  );

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        if ("navigate" in client && client.url !== target.href) {
          try {
            await client.navigate(target.href);
          } catch {
            /* Some browsers refuse navigate() — the focused window is enough. */
          }
        }
        return;
      }
      await self.clients.openWindow(target.href);
    })()
  );
});
