from pathlib import Path
from hashlib import sha256
import json
d=Path(__file__).resolve().parents[1]
names = ["index.html", "app.js", "map.js", "store.js", "config.js", "map.css", "style.css", "atlas.json", "world.json", "manifest.webmanifest", "SOURCES.md", "detail/index.json"]
files = sorted([d / name for name in names] + [p for p in (d / "assets").iterdir() if p.suffix in {".png", ".jpg"}])
h=sha256()
for p in files + sorted((d / "detail").glob("[prw]-*.json")):
    h.update(str(p.relative_to(d)).encode());h.update(p.read_bytes())
header='const version='+json.dumps(h.hexdigest()[:14])+';\nconst files='+json.dumps(['./'+p.relative_to(d).as_posix() for p in files])+';\n'
(d/'sw.js').write_text(header+"""
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
""")
