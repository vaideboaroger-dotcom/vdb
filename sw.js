// ═══════════════════════════════════════════════════════════
// SERVICE WORKER — VAI DE BOA! MUSIC
// Versão: v3  ⬅️ Mude a cada atualização
// ═══════════════════════════════════════════════════════════
const CACHE_VERSION = 'v3';
const CACHE_NAME = 'vdb-' + CACHE_VERSION;

self.addEventListener('install', event => {
    console.log('📦 SW instalando:', CACHE_VERSION);
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('✅ SW ativado:', CACHE_VERSION);
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => {
                if(k !== CACHE_NAME) return caches.delete(k);
            }))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if(req.method !== 'GET') return;
    if(!req.url.startsWith('http')) return;

    const url = new URL(req.url);
    if(url.origin !== self.location.origin) return;

    const isHTML = url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/');
    const isSW = url.pathname.endsWith('sw.js');

    if(isHTML || isSW) {
        event.respondWith(
            fetch(req, { cache: 'no-store' })
                .then(response => {
                    if(response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(req))
        );
        return;
    }

    event.respondWith(
        caches.match(req).then(cached => {
            if(cached) return cached;
            return fetch(req).then(response => {
                if(response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
                }
                return response;
            }).catch(() => cached);
        })
    );
});

self.addEventListener('message', event => {
    if(event.data === 'SKIP_WAITING') self.skipWaiting();
});
