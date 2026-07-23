const CACHE_NAME = 't1era-cache-v1';
const ASSETS = [
  './index.html',
  './landingpage.html',
  './manifest.json',
  './assets/audio/ambient.mp3',
  './assets/videos/vid1.mp4',
  './assets/videos/vid2.mp4'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => {
        console.log("Pre-caching skipped/incomplete. Proceeding offline capability setup:", err);
      });
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
