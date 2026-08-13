const CACHE_NAME = "family-dashboard-v1";
const APP_SHELL = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.text() : "New family dashboard update";
  event.waitUntil(
    self.registration.showNotification("Family dashboard update", {
      body: payload,
      icon: "/favicon.ico",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        const client = clientList[0];
        return client.focus();
      }
      return clients.openWindow("/");
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        try {
          const proto = new URL(event.request.url).protocol;
          if (proto === "http:" || proto === "https:") {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
        } catch (err) {
          // ignore non-http(s) URLs (chrome-extension:// etc)
        }
        return response;
      }).catch(() => {
        return caches.match("/");
      });
    })
  );
});