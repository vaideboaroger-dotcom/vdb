/* ═══════════════════════════════════════════════════════════
   📲 SERVICE WORKER — VAI DE BOA! MUSIC
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'vdb-music-v1';
const CACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// Instala e faz cache básico
self.addEventListener('install', (event) => {
  console.log('🔧 SW: instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Ativa e limpa caches antigos
self.addEventListener('activate', (event) => {
  console.log('✅ SW: ativado!');
  event.waitUntil(
    caches.keys().then((nomes) => {
      return Promise.all(
        nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepta requisições
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignora requisições que não sejam GET
  if (request.method !== 'GET') return;

  // Ignora requisições externas (deixa passar direto)
  if (request.url.includes('raw.githubusercontent.com')) return;
  if (request.url.includes('api.qrserver.com')) return;
  if (request.url.includes('fonts.googleapis.com')) return;
  if (request.url.includes('fonts.gstatic.com')) return;
  if (request.url.includes('cdnjs.cloudflare.com')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone).catch(() => {});
        });
        return response;
      })
      .catch(() => caches.match(request))
  );
});
