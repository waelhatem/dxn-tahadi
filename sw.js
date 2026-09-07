const CACHE='dxn-v30-online-shell-v1';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./config.js','./manifest.json','./logo.png']))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request).catch(()=>caches.match('./index.html'))));});
