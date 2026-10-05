// Only the generic offline page is cached. Signed-in pages and actions always use the network.
const CACHE = 'ironclad-offline-v4';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const message = event.data.json();
    const url = typeof message.url === 'string' && /^\/g\/\d{17,22}\/(tickets|vouches)(\/\d{17,22})?$/.test(message.url) ? message.url : '/';
    event.waitUntil(self.registration.showNotification(message.title || 'Ironclad', {
      body: message.body || 'New server activity', icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png', tag: message.tag || 'ironclad', data: { url }
    }));
  } catch { /* Ignore malformed push payloads. */ }
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => client.url.startsWith(self.location.origin) && 'focus' in client);
    if (existing) { await existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  }));
});
