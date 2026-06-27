/* ═══════════════════════════════════════════════════════════════
   service-worker.js — AgroSync PWA
   Cache first para estáticos, network first para dados
   ═══════════════════════════════════════════════════════════════ */

var CACHE_NAME = 'agrosync-v3';
var CACHE_STATIC = 'agrosync-static-v3';

var STATIC_FILES = [
    './index.html',
    './manifest.json',
    './css/base.css',
    './css/components.css',
    './css/solinftec.css',
    './css/balance.css',
    './css/densidade.css',
    './css/controle.css',
    './css/consumo.css',
    './css/disponibilidade.css',
    './css/torta.css',
    './css/biomassa.css',
    './css/loading.css',
    './modules/mobile/mobile.css',
    './js/shared.js',
    './js/solinftec.js',
    './js/balance.js',
    './js/densidade.js',
    './js/controle.js',
    './js/consumo.js',
    './js/disponibilidade.js',
    './js/torta.js',
    './js/biomassa.js',
    './js/offline-cache.js',
    './js/sync-manager.js',
    './modules/mobile/mobile.config.js',
    './modules/mobile/mobile.js',
    './icons/icon-192.svg',
    './icons/icon-512.svg'
];

// ── Install ──
self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE_STATIC).then(function(cache) {
            return cache.addAll(STATIC_FILES);
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// ── Activate ──
self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) {
                    return k !== CACHE_STATIC && k !== CACHE_NAME;
                }).map(function(k) {
                    return caches.delete(k);
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// ── Fetch ──
self.addEventListener('fetch', function(e) {
    var url = new URL(e.request.url);

    // CDN / external: network first, fallback
    if (url.hostname !== self.location.hostname) {
        e.respondWith(
            fetch(e.request).catch(function() {
                return caches.match(e.request);
            })
        );
        return;
    }

    // Navegação / HTML: NETWORK FIRST (nunca prende na versão antiga quando online)
    if (e.request.mode === 'navigate' || url.pathname.match(/\.html$/) || url.pathname.endsWith('/')) {
        e.respondWith(
            fetch(e.request).then(function(response) {
                return caches.open(CACHE_STATIC).then(function(cache) {
                    cache.put(e.request, response.clone());
                    return response;
                });
            }).catch(function() {
                return caches.match(e.request).then(function(cached) {
                    return cached || caches.match('./index.html');
                });
            })
        );
        return;
    }

    // Demais estáticos (js/css/svg/png): cache first
    if (STATIC_FILES.indexOf('./' + url.pathname.replace(/^\//, '')) >= 0 || url.pathname.match(/\.(js|css|json|svg|png)$/)) {
        e.respondWith(
            caches.match(e.request).then(function(cached) {
                var fetchPromise = fetch(e.request).then(function(response) {
                    return caches.open(CACHE_STATIC).then(function(cache) {
                        cache.put(e.request, response.clone());
                        return response;
                    });
                }).catch(function() {
                    return cached;
                });
                return cached || fetchPromise;
            })
        );
        return;
    }

    // Data / API: network first, cache fallback
    e.respondWith(
        fetch(e.request).then(function(response) {
            return caches.open(CACHE_NAME).then(function(cache) {
                cache.put(e.request, response.clone());
                return response;
            });
        }).catch(function() {
            return caches.match(e.request);
        })
    );
});
