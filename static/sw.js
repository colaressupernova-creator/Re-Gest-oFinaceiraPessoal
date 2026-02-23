const CACHE_NAME = 're-solution-v3-ia'; // Atualizado para invalidar o cache antigo

const ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/script.js',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    // Reivindica os clientes e garante que as novas regras entrem em vigor imediatamente
    event.waitUntil(self.clients.claim());

    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Removendo cache antigo:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Ignora chamadas de API, deixando o navegador buscar sempre do servidor
    if (event.request.url.includes('/api/')) {
        return;
    }

    // Estratégia Network First (Tenta a rede, se falhar ou estiver offline, usa o cache)
    event.respondWith(
        fetch(event.request).then((networkResponse) => {
            // Se funcionou na rede, armazena no cache a versão mais recente
            return caches.open(CACHE_NAME).then((cache) => {
                if (event.request.method === 'GET') {
                    cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
            });
        }).catch(() => {
            // Se estiver offline, pega do cache
            return caches.match(event.request);
        })
    );
});
