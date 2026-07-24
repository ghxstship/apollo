/* LYRE SOCIAL service worker — precache the shell, cache-first for brand
   assets, network-first for pages, branded offline fallback. No workbox. */

const CACHE = "lyre-sw-v1";
const PRECACHE = ["/", "/icons/icon-192.png", "/logo/favicon.svg"];

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · LYRE SOCIAL</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0B0B0C;color:#F2F2F4;font:400 14px/1.6 Georgia,serif;text-align:center}
main{padding:32px;max-width:34ch}h1{font-weight:400;font-size:26px;margin:0 0 10px}
p{color:#9A9AA3;margin:0}
span{display:block;margin-top:22px;font:600 9px monospace;letter-spacing:.2em;color:#5C5C66}</style>
</head><body><main><h1>No signal past the breakwater.</h1>
<p>You're offline. What you've loaded keeps working; the rest returns with the signal.</p>
<span>LYRE SOCIAL · EST. MMXXIV</span></main></body></html>`;

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

  /* Navigations: network-first; fall back to cache, then the offline page. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(async () => {
          const hit = (await caches.match(request)) || (await caches.match("/"));
          return (
            hit || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html" } })
          );
        })
    );
  }
});
