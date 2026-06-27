/* ═══════════════════════════════════════════════════════════════
   offline-cache.js — Cache offline com IndexedDB + localStorage
   ═══════════════════════════════════════════════════════════════ */

var AgroSyncCache = (function() {

    var DB_NAME = 'AgroSyncDB';
    var DB_VER = 1;
    var STORE_NAME = 'cache';
    var LS_KEY_META = 'agrosync_meta';
    var LS_KEY_CACHE_TIME = 'agrosync_cache_time';

    function openDB() {
        return new Promise(function(resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            req.onsuccess = function(e) {
                resolve(e.target.result);
            };
            req.onerror = function(e) {
                reject(e.target.error);
            };
        });
    }

    function getFromDB(id) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readonly');
                var store = tx.objectStore(STORE_NAME);
                var req = store.get(id);
                req.onsuccess = function() { resolve(req.result ? req.result.data : null); };
                req.onerror = function() { reject(req.error); };
                tx.oncomplete = function() { db.close(); };
            });
        }).catch(function() {
            // Fallback: localStorage
            try {
                var raw = localStorage.getItem(LS_KEY_META);
                if (raw) { var all = JSON.parse(raw); return all[id] || null; }
            } catch(e) {}
            return null;
        });
    }

    function setInDB(id, data) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                store.put({ id: id, data: data, updatedAt: new Date().toISOString() });
                tx.oncomplete = function() { db.close(); resolve(); };
                tx.onerror = function() { reject(tx.error); };
            });
        }).catch(function() {
            // Fallback: localStorage
            try {
                var raw = localStorage.getItem(LS_KEY_META);
                var all = raw ? JSON.parse(raw) : {};
                all[id] = data;
                localStorage.setItem(LS_KEY_META, JSON.stringify(all));
            } catch(e) {}
        });
    }

    function removeFromDB(id) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                store.delete(id);
                tx.oncomplete = function() { db.close(); resolve(); };
                tx.onerror = function() { reject(tx.error); };
            });
        }).catch(function() {
            try { var raw = localStorage.getItem(LS_KEY_META); if (raw) { var all = JSON.parse(raw); delete all[id]; localStorage.setItem(LS_KEY_META, JSON.stringify(all)); } } catch(e) {}
        });
    }

    function getMeta() {
        try {
            var raw = localStorage.getItem(LS_KEY_META);
            return raw ? JSON.parse(raw) : null;
        } catch(e) { return null; }
    }

    function setMeta(meta) {
        try { localStorage.setItem(LS_KEY_META, JSON.stringify(meta)); } catch(e) {}
    }

    function getCacheTime() {
        try { return parseInt(localStorage.getItem(LS_KEY_CACHE_TIME), 10) || 0; } catch(e) { return 0; }
    }

    function setCacheTime(t) {
        try { localStorage.setItem(LS_KEY_CACHE_TIME, String(t)); } catch(e) {}
    }

    function isIndexedDBAvailable() {
        return !!window.indexedDB;
    }

    // ── Public API ──

    return {

        /**
         * Salva o snapshot completo no cache offline
         */
        salvar: function(snapshot) {
            var meta = {
                app: 'AgroSync',
                versao: '1.0.0',
                origem: snapshot.origem || 'google_sheets',
                ultimaAtualizacao: snapshot.ultimaAtualizacao || new Date().toISOString(),
                status: snapshot.status || 'ok'
            };
            setMeta(meta);
            setCacheTime(Date.now());
            return setInDB('snapshot', snapshot);
        },

        /**
         * Carrega o último snapshot salvo
         */
        carregar: function() {
            return getFromDB('snapshot');
        },

        /**
         * Obtém metadados do cache (última atualização, origem, etc)
         */
        obterMeta: function() {
            var meta = getMeta();
            if (!meta) return null;
            meta.tempoCache = Date.now() - getCacheTime();
            meta.cacheAtualizado = meta.tempoCache <= 2 * 60 * 60 * 1000;
            return meta;
        },

        /**
         * Verifica se o cache existe
         */
        existeCache: function() {
            return !!getMeta();
        },

        /**
         * Verifica se o cache está atualizado (< 2h)
         */
        cacheEstaAtualizado: function() {
            var meta = this.obterMeta();
            if (!meta) return false;
            var duasHorasMs = 2 * 60 * 60 * 1000;
            var ultima = new Date(meta.ultimaAtualizacao).getTime();
            return Date.now() - ultima <= duasHorasMs;
        },

        /**
         * Remove todo o cache
         */
        limpar: function() {
            try { localStorage.removeItem(LS_KEY_META); localStorage.removeItem(LS_KEY_CACHE_TIME); } catch(e) {}
            return removeFromDB('snapshot');
        },

        /**
         * Exporta dados atuais do dashboard como snapshot
         */
        criarSnapshot: function() {
            var dados = {};
            try { dados.solinftec = window.solinftecData || []; } catch(e) { dados.solinftec = []; }
            try { dados.producao = window.producaoData || []; } catch(e) { dados.producao = []; }
            try { dados.densidade = window.densidadeData || []; } catch(e) { dados.densidade = []; }
            try { dados.controle = window.controleData || []; } catch(e) { dados.controle = []; }
            try { dados.consumo = window.consumoData || []; } catch(e) { dados.consumo = []; }
            try { dados.disponibilidade = window.disponibilidadeData || []; } catch(e) { dados.disponibilidade = []; }
            try { dados.torta = window.tortaData || []; } catch(e) { dados.torta = []; }
            try { dados.biomassa = window.biomassaData || []; } catch(e) { dados.biomassa = []; }

            var indicadores = {};
            try { indicadores.resumoGeral = window.agroSyncIndicadores || {}; } catch(e) {}
            try { indicadores.solinftec = window.solinftecData || {}; } catch(e) {}

            return {
                meta: {
                    app: 'AgroSync',
                    versao: '1.0.0',
                    origem: 'google_sheets',
                    ultimaAtualizacao: new Date().toISOString(),
                    proximaAtualizacaoPrevista: new Date(Date.now() + 2*60*60*1000).toISOString(),
                    status: 'ok'
                },
                dados: dados,
                indicadores: indicadores
            };
        },

        /**
         * Info de debug
         */
        debug: function() {
            return {
                indexedDB: isIndexedDBAvailable(),
                meta: getMeta(),
                cacheTime: getCacheTime()
            };
        }
    };

})();
