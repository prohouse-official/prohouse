// الشغل بدون نت انلغى. هاد الملف بيضل موجود بس لحتى الأجهزة اللي منزّلة النسخة القديمة
// تاخده كتحديث، تمسح كل الملفات المخزنة، وتلغي تسجيل نفسها.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
