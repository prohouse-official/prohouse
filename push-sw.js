// عامل خلفية للإشعارات بس — ما بيخزّن ولا ملف (ما في fetch handler)، فالموقع دايماً بيجيب آخر نسخة من النت.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "برو هاوس", {
    body: data.body || "",
    tag: data.tag || "prohouse",
    renotify: true,
    dir: "rtl",
    lang: "ar",
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    data: { url: data.url || "./" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); if ("navigate" in open) await open.navigate(url).catch(() => {}); return; }
    await self.clients.openWindow(url);
  })());
});
