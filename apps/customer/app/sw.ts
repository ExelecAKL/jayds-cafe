import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;
const entries = (self.__SW_MANIFEST ?? [])
  .map((entry) =>
    typeof entry === "string"
      ? entry.replace(/\\/g, "/")
      : { ...entry, url: entry.url.replace(/\\/g, "/") },
  )
  .filter((entry) => {
    const url = typeof entry === "string" ? entry : entry.url;
    return (
      /\.(?:m?js|css|woff2?|otf|png|svg|ico)$/.test(url) &&
      !/^\/workbox-/.test(url) &&
      !/^\/?products\//.test(url)
    );
  });
const publicMenu = (path: string) =>
  /^\/menu(?:\/browse(?:\/[a-f0-9-]{36})?)?\/?$/.test(path);
const publicImageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : null;
const serwist = new Serwist({
  cacheId: "jayds-public",
  // Explicitly name the precache: Serwist resolves its default before cacheId,
  // and activation must retain these public assets for offline hydration.
  precacheOptions: { cacheName: "jayds-public-precache-v1" },
  precacheEntries: entries,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url, request }) =>
        request.destination === "image" &&
        ((url.origin === self.location.origin &&
          /^\/products\/[a-z0-9-]+\.(?:png|webp)$/.test(url.pathname)) ||
          (url.origin === publicImageOrigin &&
            /^\/storage\/v1\/object\/public\/jayds-menu-images\/generated\/[a-f0-9-]+\/[a-z0-9-]+\.(?:png|webp)$/.test(
              url.pathname,
            ))),
      handler: new CacheFirst({
        cacheName: "jayds-public-products-v1",
        plugins: [
          new ExpirationPlugin({ maxEntries: 180, maxAgeSeconds: 2592000 }),
        ],
      }),
    },
    {
      matcher: ({ url, request }) =>
        url.origin === self.location.origin &&
        request.mode === "navigate" &&
        publicMenu(url.pathname),
      handler: new NetworkFirst({
        cacheName: "jayds-public-pages-v1",
        networkTimeoutSeconds: 4,
        plugins: [
          new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 86400 }),
        ],
      }),
    },
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin &&
        (/^\/_next\/static\//.test(url.pathname) ||
          /^\/icons\//.test(url.pathname)),
      handler: new CacheFirst({
        cacheName: "jayds-public-assets-v1",
        plugins: [
          new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 2592000 }),
        ],
      }),
    },
    { matcher: () => true, handler: new NetworkOnly() },
  ],
});
serwist.addEventListeners();
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith("jayds-public-"))
            .map((k) => caches.delete(k)),
        ),
      ),
  );
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const data = event.data?.json();
        if (
          !data ||
          typeof data.eventId !== "string" ||
          !/^\/orders\/[a-f0-9-]{36}$/.test(data.url)
        )
          return;
        const seen = await caches.open("jayds-public-push-dedup-v1"),
          key = new Request(
            self.location.origin +
              "/__push_seen/" +
              encodeURIComponent(data.eventId),
          );
        if (await seen.match(key)) return;
        await seen.put(key, new Response("1"));
        const keys = await seen.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - 100)))
          await seen.delete(old);
        await self.registration.showNotification(
          String(data.title || "Jayds order update"),
          {
            body: String(data.body || "Open your order for details."),
            icon: "/icons/jayds-app-192.png",
            badge: "/icons/jayds-badge-96.png",
            tag: data.eventId,
            data: { url: data.url },
          },
        );
      } catch {
        /* Invalid payloads never navigate or expose provider errors. */
      }
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  if (typeof path !== "string" || !/^\/orders\/[a-f0-9-]{36}$/.test(path))
    return;
  event.waitUntil(self.clients.openWindow(self.location.origin + path));
});
