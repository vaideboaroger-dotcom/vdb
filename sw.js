/* =========================================================
   VAI DE BOA! MUSIC — Service Worker
   Estratégias:
   - Shell (HTML/CSS/JS): cache-first, atualiza em background
   - JSONs (músicas/mídias): stale-while-revalidate
   - Áudios: cache-first, cache sob demanda
   - Fontes/CDN: cache-first com fallback
   ========================================================= */

const SW_VERSION = 'v1.0.0';
const CACHE_STATIC = `vdb-static-${SW_VERSION}`;
const CACHE_RUNTIME = `vdb-runtime-${SW_VERSION}`;
const CACHE_AUDIO = `vdb-audio-${SW_VERSION}`;
const CACHE_JSON = `vdb-json-${SW_VERSION}`;

/* Tamanho máximo de itens no cache de áudio (evita estourar storage) */
const MAX_AUDIO_ITEMS = 60;
/* Tamanho máximo de itens no cache de JSON */
const MAX_JSON_ITEMS = 80;

/* =========================================================
   SHELL — o que precisa pra abrir o app offline
   ========================================================= */
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './favicon30.png',
  './favicon192.png',
  /* Font Awesome + Google Fonts (CSS) */
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Audiowide&family=Rajdhani:wght@600;700&display=swap',
];

/* =========================================================
   INSTALL — pré-cache do shell
   ========================================================= */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      /* addAll falha se 1 recurso falhar; usamos add individual tolerante */
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Falha ao cachear:', url, err);
          })
        )
      );
      /* Ativa imediatamente sem esperar fechar abas */
      await self.skipWaiting();
    })()
  );
});

/* =========================================================
   ACTIVATE — limpa caches antigos
   ========================================================= */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.endsWith(SW_VERSION))
          .map((key) => caches.delete(key))
      );
      /* Toma controle das abas abertas */
      await self.clients.claim();
    })()
  );
});

/* =========================================================
   HELPERS
   ========================================================= */
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  /* Remove os mais antigos (FIFO) */
  const toDelete = keys.slice(0, keys.length - maxItems);
  await Promise.all(toDelete.map((req) => cache.delete(req)));
}

function isHTML(request) {
  return request.headers.get('accept')?.includes('text/html');
}

function isJSON(url) {
  return url.pathname.endsWith('.json');
}

function isAudio(url) {
  return /\.(mp3|m4a|ogg|wav|aac|opus|flac)(\?|$)/i.test(url.pathname);
}

function isMedia(url) {
  return /\.(mp4|webm|mov|m4v|jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(url.pathname);
}

function isFont(url) {
  return (
    /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url.pathname) ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

function isCDN(url) {
  return (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('api.qrserver.com')
  );
}

/* =========================================================
   FETCH — roteamento por tipo de recurso
   ========================================================= */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Ignora métodos não-GET */
  if (request.method !== 'GET') return;

  /* Ignora range requests de áudio/vídeo (o navegador cuida) */
  if (request.headers.get('range')) return;

  /* ---- 1. Navegação (HTML) → network-first com fallback offline ---- */
  if (request.mode === 'navigate' || isHTML(request)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_STATIC);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch (err) {
          const cached = await caches.match('./index.html');
          if (cached) return cached;
          const root = await caches.match('./');
          if (root) return root;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  /* ---- 2. JSON de músicas / mídias → stale-while-revalidate ---- */
  if (isJSON(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_JSON);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then(async (response) => {
            if (response && response.status === 200) {
              await cache.put(request, response.clone());
              trimCache(CACHE_JSON, MAX_JSON_ITEMS);
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })()
    );
    return;
  }

  /* ---- 3. Áudio → cache-first, cache sob demanda ---- */
  if (isAudio(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_AUDIO);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.status === 200) {
            await cache.put(request, response.clone());
            trimCache(CACHE_AUDIO, MAX_AUDIO_ITEMS);
          }
          return response;
        } catch (err) {
          return new Response('', { status: 504, statusText: 'Áudio indisponível offline' });
        }
      })()
    );
    return;
  }

  /* ---- 4. Mídias (vídeo/imagem) → cache-first, cache sob demanda ---- */
  if (isMedia(url) || isCDN(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_RUNTIME);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then(async (response) => {
            if (response && response.status === 200 && response.type !== 'opaque') {
              await cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })()
    );
    return;
  }

  /* ---- 5. Fontes → cache-first ---- */
  if (isFont(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_STATIC);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.status === 200) {
            await cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          return cached || new Response('', { status: 504 });
        }
      })()
    );
    return;
  }

  /* ---- 6. Shell estático (HTML/CSS/JS/ícones) → cache-first ---- */
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_STATIC);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then(async (response) => {
            if (response && response.status === 200) {
              await cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })()
    );
    return;
  }

  /* ---- 7. Qualquer outra coisa → network-first ---- */
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('', { status: 504 });
      }
    })()
  );
});

/* =========================================================
   MENSAGENS (do app.js)
   ========================================================= */
self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || !data.type) return;

  /* App pediu pra limpar tudo (Atualizar App) */
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  /* App pediu pra limpar o cache de áudio/mídia (liberar espaço) */
  if (data.type === 'CLEAR_RUNTIME') {
    event.waitUntil(
      (async () => {
        await caches.delete(CACHE_RUNTIME);
        await caches.delete(CACHE_AUDIO);
        await caches.delete(CACHE_JSON);
        if (event.source && event.source.postMessage) {
          event.source.postMessage({ type: 'RUNTIME_CLEARED' });
        }
      })()
    );
    return;
  }

  /* App pediu info do cache (opcional) */
  if (data.type === 'CACHE_INFO') {
    event.waitUntil(
      (async () => {
        const info = {};
        for (const name of [CACHE_STATIC, CACHE_RUNTIME, CACHE_AUDIO, CACHE_JSON]) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          info[name] = keys.length;
        }
        if (event.source && event.source.postMessage) {
          event.source.postMessage({ type: 'CACHE_INFO_RESULT', info });
        }
      })()
    );
  }
});

/* =========================================================
   PUSH (opcional — pode ignorar se não usa)
   ========================================================= */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch (e) { payload = { title: 'VAI DE BOA! MUSIC', body: event.data.text() }; }
  const title = payload.title || 'VAI DE BOA! MUSIC';
  const options = {
    body: payload.body || 'Nova música disponível!',
    icon: './favicon192.png',
    badge: './favicon30.png',
    vibrate: [100, 50, 100],
    data: { url: payload.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
