// sw.js - Service Worker do VAI DE BOA! MUSIC
const CACHE_NAME = 'vdb-music-v1';
const urlsToCache = [
    './',
    './index.html',
    './favicon30.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache).catch(() => {});
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Ignora requisições não-GET e cross-origin complicados
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('raw.githubusercontent.com')) {
        // Músicas: sempre tenta rede primeiro
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }
    // Resto: cache-first
    event.respondWith(
        caches.match(event.request).then((res) => {
            return res || fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match('./index.html'));
        })
    );
});