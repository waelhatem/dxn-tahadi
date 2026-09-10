/* V86.1: the service worker is intentionally disabled for application runtime. */
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('dxn-')).map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({type:'window'}))
      .then(clients => clients.forEach(client => client.navigate(client.url)))
  );
});

// No fetch handler: all application traffic, including index.html, config.js,
// Supabase RPCs and assets, goes directly to the network.
