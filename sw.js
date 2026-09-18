/* V86.67 + Push: PWA service worker with Web Push background notifications. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch(_){
    try{data={body:event.data?event.data.text():''};}catch(__){data={};}
  }

  const title=String(data.title||'مجتمع الصحة والثراء');
  const options={
    body:String(data.body||'لديك متابعة جديدة من محمد.'),
    icon:String(data.icon||'/logo.png'),
    badge:String(data.badge||'/favicon.png'),
    data:data.data||{url:'/app/index.html'},
    dir:'rtl',
    lang:'ar',
    tag:String(data.tag||'mohammed-coaching'),
    renotify:Boolean(data.renotify||false)
  };

  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=String(event.notification?.data?.url||'/app/index.html');

  event.waitUntil((async()=>{
    const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clientsList){
      try{
        await client.focus();
        if('navigate' in client && client.url!==new URL(target,self.location.origin).href){
          await client.navigate(target);
        }
        return;
      }catch(_){}
    }
    if(self.clients.openWindow)await self.clients.openWindow(target);
  })());
});

// No fetch handler: application traffic continues directly to the network.
