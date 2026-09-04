/* [un] service worker — precache the shell, cache-first for brand
   assets, network-first for pages, branded offline fallback. No workbox. */

/* v2: the private list below was still the pre-rename route map and the
   activate handler only drops caches with OTHER names, so bumping the name is
   what actually purges a member's /passes or /tonight from a phone that
   cached it under v1. Bump again whenever what may be written changes. */
const CACHE = "un-sw-v2";
const PRECACHE = ["/", "/icons/icon-192.png", "/logo/favicon.svg"];

/* Nothing behind the gangway is written to disk. The navigation branch used to
   cache every response it saw — /card, /stub/<code>, /sign/<token>, even a 500
   and the sign-in page — into one origin-wide cache that outlived signing out.
   On a shared or resold phone, a failed fetch fell through to the previous
   member's boarding stub. These paths are also the ones the server marks
   `Cache-Control: private, no-store`; the worker was overriding that.

   This list mirrors PROTECTED in src/lib/supabase/middleware.ts — every
   prefix the proxy puts behind the gangway — plus the routes that carry a
   credential in the path and the ones that answer differently per session.
   It drifted once already: after the 2026-09 renames it still named
   /manifest and /tables (now redirects, so never a 200) and not /passes,
   /itinerary or /tonight, so a member's own pass list was being cached to
   disk as if it were the public catalogue. The header check below is what
   holds when the list drifts again. */
const PRIVATE = [
  "/home", "/passes", "/itinerary", "/membership/standing", "/open-deck",
  "/directory", "/threads", "/portal", "/account", "/card", "/inbox", "/you",
  "/live", "/shop", "/stub", "/regattas", "/tonight", "/matches", "/agreements",
  "/kiosk", "/bridge", "/vetting", "/radar", "/show",
  "/sign", "/gangway", "/auth", "/preview", "/api",
];

function isPrivate(pathname) {
  return PRIVATE.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/* The server's own word on whether a page may be kept. Anything it marks
   private or no-store is somebody's, whatever the path says. */
function serverForbidsCaching(res) {
  const cc = (res.headers.get("Cache-Control") || "").toLowerCase();
  return cc.includes("no-store") || cc.includes("private");
}

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · [un]</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#141414;color:#F1F1ED;font:400 14px/1.6 Archivo,'Helvetica Neue',sans-serif;text-align:center}
main{padding:32px;max-width:34ch}h1{font-weight:400;font-size:26px;margin:0 0 10px}
p{color:#8A8A85;margin:0}
span{display:block;margin-top:22px;font:600 9px monospace;letter-spacing:.2em;color:#6E6E69}</style>
</head><body><main><h1>No signal past the breakwater.</h1>
<p>You're offline. What you've loaded keeps working; the rest returns with the signal.</p>
<span>[un] · EST. MMXXVI</span></main></body></html>`;

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
          if (!priv && res.status === 200 && !res.redirected && !serverForbidsCaching(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = priv ? null : (await caches.match(request)) || (await caches.match("/"));
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
   Cache Storage is the worker's, so the worker has to be told.

   The push subscription goes too. It is the DEVICE that is subscribed, not
   the session, and until now it stayed subscribed after sign-out — so the
   next word for the member who left arrived on a phone somebody else was
   now holding. Unsubscribing here ends that at the browser; the row shoreside
   then answers 410 to the next send and send-push drops it. */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "UN_SIGNED_OUT") {
    event.waitUntil(
      Promise.all([
        caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
        self.registration.pushManager
          .getSubscription()
          .then((sub) => (sub ? sub.unsubscribe() : false))
          .catch(() => false),
      ])
    );
  }
});

/* Where a notification may send someone: a path on this origin, and nothing
   else. The payload is ours — only the holder of the VAPID private key can
   push to this subscription — but a rule that does not depend on that is
   cheaper than one that does. Anything off-origin, or unparseable, becomes
   the inbox. */
function safeTarget(raw) {
  try {
    const target = new URL(raw || "/inbox", self.location.origin);
    if (target.origin !== self.location.origin) return new URL("/inbox", self.location.origin);
    return target;
  } catch {
    return new URL("/inbox", self.location.origin);
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json() || {};
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "[un]";
  const url = safeTarget(typeof payload.url === "string" ? payload.url : "/inbox").href;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === "string" ? payload.body.slice(0, 480) : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof payload.tag === "string" ? payload.tag : url,
      renotify: Boolean(payload.tag),
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeTarget(event.notification.data && event.notification.data.url);

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
