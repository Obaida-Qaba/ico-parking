const CACHE='portway-v3-gps';
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const response=await fetch('./data.json',{cache:'no-cache'});
    if(!response.ok)throw new Error('Map catalogue unavailable');
    const atlas=await response.clone().json();
    await cache.addAll(['./','./index.html','./styles.css','./app.mjs','./core.mjs','./gps.mjs','./navigation.mjs','./roads.json','./data.json','./vendor/leaflet.js','./vendor/leaflet.css','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest',...atlas.maps.map(m=>'./'+m.image)]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('portway-')&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));return;
  }
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
