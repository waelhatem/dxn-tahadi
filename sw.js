/* V85.8: cache only the public application shell and inject a local login guard into navigations. */
const CACHE = 'dxn-v85.8-app-shell';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];
const APP_SHELL_PATHS = new Set(
  APP_SHELL.map(asset => new URL(asset, self.registration.scope).pathname)
);

const LOGIN_GUARD = `<script id="dxn-login-guard-v858">(function(){if(window.__DXN_LOGIN_GUARD_V858__)return;window.__DXN_LOGIN_GUARD_V858__=true;document.addEventListener('click',function(e){try{var b=e.target&&e.target.closest?e.target.closest('button.primary'):null;if(!b)return;var n=document.getElementById('loginNo'),p=document.getElementById('pin');if(!n||!p)return;if(!String(b.textContent||'').includes('دخول'))return;if(!String(n.value||'').trim()||!String(p.value||'').trim()){e.preventDefault();e.stopImmediatePropagation();var t=document.getElementById('toast');if(t){t.textContent='أدخل بيانات الدخول أولاً.';t.classList.remove('hidden');setTimeout(function(){t.classList.add('hidden')},2600)}else if(typeof window.alert==='function'){window.alert('أدخل بيانات الدخول أولاً.')}return false;}}catch(_){}} ,true);})();<\/script>`;

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

async function serveNavigation(request) {
  try {
    const response = await fetch(request);
    if (!response.ok) return response;
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;
    const html = await response.text();
    if (html.includes('id="dxn-login-guard-v858"')) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
    const injected = html.replace('</head>', LOGIN_GUARD + '</head>');
    return new Response(injected,{status:response.status,statusText:response.statusText,headers:response.headers});
  } catch (_) {
    return appShellFallback(request);
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Authentication, member/session data, Supabase, YouTube, config.js, and all
  // third-party traffic always use the network and are never written to Cache Storage.
  if (url.origin !== self.location.origin || url.pathname.endsWith('/config.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith(serveNavigation(request));
    return;
  }

  // Only public, version-independent shell resources use cache-first behavior.
  if (APP_SHELL_PATHS.has(url.pathname)) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request))
    );
  }
});
