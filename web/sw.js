// Service worker – aplikace se rychle načte a funguje i při slabém signálu.
// Při každé nové verzi aplikace zvyš číslo VERZE.
const VERZE = 'jiskra-v3';
const SOUBORY = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERZE).then((c) => c.addAll(SOUBORY)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERZE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Databázi, přihlášení a platby nikdy neukládat
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co') || url.hostname.includes('stripe')) return;
  // Vlastní soubory: nejdřív síť, při výpadku z mezipaměti
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => { const copy = res.clone(); caches.open(VERZE).then((c) => c.put(e.request, copy)); return res; })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
    );
    return;
  }
  // Písma a knihovny: z mezipaměti, jinak ze sítě
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERZE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
