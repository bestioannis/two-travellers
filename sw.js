const version="cd54d28fd4f1b5";
const files=["./SOURCES.md", "./app.js", "./assets/apple-touch-icon.png", "./assets/icon-192.png", "./assets/icon-512.png", "./assets/kyoto.jpg", "./assets/paris.jpg", "./assets/singapore.jpg", "./atlas.json", "./config.js", "./detail/index.json", "./index.html", "./manifest.webmanifest", "./map.css", "./map.js", "./store.js", "./style.css", "./world.json"];

const prefix='two-travellers:'+self.registration.scope+':';
const cacheName=prefix+version;
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(cacheName);
  await cache.addAll(files.map(path=>new Request(path,{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith(prefix)&&name!==cacheName)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||!url.href.startsWith(self.registration.scope))return;
  const path='./'+url.pathname.slice(new URL(self.registration.scope).pathname.length);
  const detail=path.startsWith('./detail/') && path.endsWith('.json');
  if(event.request.mode!=='navigate'&&!files.includes(path)&&!detail)return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    if(path==='./config.js'){
      try{const res=await fetch(event.request);if(res.ok){await cache.put(path,res.clone());return res}}catch{}
    }
    const cached=await cache.match(event.request.mode==='navigate'&&!files.includes(path)&&!detail?'./index.html':path);
    if(cached)return cached;
    const result=await fetch(event.request);
    if(detail && result.ok)await cache.put(path,result.clone());
    return result;
  })());
});
