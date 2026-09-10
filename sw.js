/* V85.1: cache only the public application shell. */
const CACHE = 'dxn-v85.1-app-shell';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];
const APP_SHELL_PATHS = new Set(
  APP_SHELL.map(asset => new URL(asset, self.registration.scope).pathname)
);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('dxn-') && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function appShellFallback(request) {
  return caches.match(request).then(hit => hit || caches.match('./index.html'));
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Authentication, member/session data, Supabase, YouTube, config.js, and all
  // third-party traffic always use the network and are never written to Cache Storage.
  if (url.origin !== self.location.origin || url.pathname.endsWith('/config.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => response)
        .catch(() => appShellFallback(request))
    );
    return;
  }

  // Only public, version-independent shell resources use cache-first behavior.
  if (APP_SHELL_PATHS.has(url.pathname)) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request))
    );
  }
});
