/* V86.67: network-first pass-through service worker used only to enable PWA installation. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Intentionally no fetch handler: all application traffic goes directly to the network.
