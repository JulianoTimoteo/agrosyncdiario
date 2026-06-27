/* ═══════════════════════════════════════════════════════════════
   sync-manager.js — Gerenciador de sincronização online/offline
   ═══════════════════════════════════════════════════════════════ */

var AgroSyncSync = (function() {

    var isOnline = navigator.onLine;
    var initialized = false;

    // ── Loading screen helpers ──
    function showLoading() {
        var s = document.getElementById('loading-screen');
        if (s) s.classList.remove('hidden');
    }

    function hideLoading() {
        var s = document.getElementById('loading-screen');
        if (s) s.classList.add('hidden');
    }

    function updateProgress(pct, msg, detail) {
        var fill = document.getElementById('loading-progress-fill');
        var pctEl = document.getElementById('loading-percent');
        var msgEl = document.getElementById('loading-message');
        var detailEl = document.getElementById('loading-detail');
        if (fill) fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (pctEl) pctEl.textContent = Math.round(pct) + '%';
        if (msgEl) msgEl.textContent = msg || '';
        if (detailEl) detailEl.textContent = detail || '';
    }

    function setStep(stepName) {
        document.querySelectorAll('.loading-step').forEach(function(s) {
            var st = s.getAttribute('data-step');
            s.classList.toggle('done', false);
            s.classList.toggle('active', st === stepName);
        });
        // Mark previous steps as done
        var steps = ['conexao','dados','processamento','graficos'];
        var idx = steps.indexOf(stepName);
        if (idx >= 0) {
            for (var i = 0; i < idx; i++) {
                var el = document.querySelector('.loading-step[data-step="' + steps[i] + '"]');
                if (el) { el.classList.remove('active'); el.classList.add('done'); }
            }
        }
    }

    function setConnectionBadge(online) {
        var badge = document.getElementById('loading-badge-connection');
        var dot = document.getElementById('loading-connection-dot');
        var text = document.getElementById('loading-connection-text');
        if (!badge) return;
        if (online) {
            badge.className = 'loading-badge loading-badge-online';
            if (dot) dot.className = 'loading-badge-dot online';
            if (text) text.textContent = 'Online';
        } else {
            badge.className = 'loading-badge loading-badge-offline';
            if (dot) dot.className = 'loading-badge-dot offline';
            if (text) text.textContent = 'Offline';
        }
    }

    function setSource(source) {
        var el = document.getElementById('loading-source-text');
        if (el) el.textContent = 'Fonte: ' + source;
    }

    function setLastUpdate(text) {
        var el = document.getElementById('loading-last-update');
        if (el) el.textContent = text || '';
    }

    function showOfflineWarning(show) {
        var el = document.getElementById('loading-offline-warning');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    // ── Try to load from cache into the current dashboard ──
    function carregarDadosCache(snapshot) {
        if (!snapshot || !snapshot.dados) return false;
        var d = snapshot.dados;
        if (d.solinftec && Array.isArray(d.solinftec) && d.solinftec.length) {
            try { window.solinftecData = d.solinftec; } catch(e) {}
        }
        if (d.producao && Array.isArray(d.producao) && d.producao.length) {
            try { window.producaoData = d.producao; } catch(e) {}
        }
        if (d.biomassa && Array.isArray(d.biomassa) && d.biomassa.length) {
            try { window.biomassaData = d.biomassa; } catch(e) {}
        }
        return true;
    }

    // ── Load cached data and show dashboard ──
    function abrirComCache(meta) {
        updateProgress(85, 'Carregando última base offline...', 'Cache offline');
        setStep('dados');
        setSource('offline');

        return AgroSyncCache.carregar().then(function(snapshot) {
            if (snapshot) {
                carregarDadosCache(snapshot);
                updateProgress(95, 'Montando dashboard offline...', 'Base local');
                setStep('processamento');
                // Trigger dashboard show
                var folderInfo = document.getElementById('folderInfo');
                if (folderInfo) folderInfo.style.display = 'flex';
                var folderPath = document.getElementById('folderPath');
                if (folderPath) folderPath.textContent = 'Modo Offline';
                var uploadPrompt = document.getElementById('uploadPrompt');
                if (uploadPrompt) uploadPrompt.classList.add('hidden');
                var dashboardContent = document.getElementById('dashboardContent');
                if (dashboardContent) dashboardContent.classList.remove('hidden');

                // Render all modules
                try { if (typeof renderBiomassa === 'function') renderBiomassa(); } catch(e) {}
                try { if (typeof renderTorta === 'function') renderTorta(); } catch(e) {}
                try { if (typeof renderConsumo === 'function') renderConsumo(); } catch(e) {}
                try { if (typeof renderDisponibilidade === 'function') renderDisponibilidade(); } catch(e) {}
                try { if (typeof renderControle === 'function') renderControle(); } catch(e) {}

                updateProgress(100, 'Dashboard pronto', 'Modo offline');
                setStep('graficos');
                setTimeout(hideLoading, 600);

                var ultima = meta && meta.ultimaAtualizacao ? new Date(meta.ultimaAtualizacao).toLocaleString('pt-BR') : '—';
                setLastUpdate('📦 Última atualização: ' + ultima);
                showOfflineWarning(true);
                return true;
            }
            return false;
        }).catch(function() {
            return false;
        });
    }

    // ── Main initialization ──
    function inicializar() {
        if (initialized) return;
        initialized = true;

        showLoading();
        updateProgress(5, 'Inicializando AgroSync...', 'Preparando ambiente');
        setStep('conexao');

        // Estado de conexão
        isOnline = navigator.onLine;
        setConnectionBadge(isOnline);

        var meta = AgroSyncCache.obterMeta();
        var temCache = AgroSyncCache.existeCache();
        if (meta && meta.ultimaAtualizacao) {
            setLastUpdate('📦 Última atualização: ' + new Date(meta.ultimaAtualizacao).toLocaleString('pt-BR'));
        }

        if (isOnline) {
            // ONLINE → carga limpa direto do Google Sheets (sem mostrar cache velho pela metade)
            updateProgress(20, 'Conectado — buscando dados online...', 'Google Sheets');
            setSource('google_sheets');
            setStep('dados');
            showOfflineWarning(false);
            buscarOnline(false);
        } else if (temCache) {
            // OFFLINE com cache → abre a última base salva imediatamente
            setConnectionBadge(false);
            updateProgress(20, 'Sem conexão — carregando base salva...', 'Modo offline');
            setSource('offline_cache');
            showOfflineWarning(true);
            abrirComCache(meta);
        } else {
            // OFFLINE sem cache → orienta o usuário
            setConnectionBadge(false);
            updateProgress(100, 'Nenhuma base offline encontrada', 'Conecte-se à internet');
            setSource('offline_cache');
            showOfflineWarning(true);
            setLastUpdate('❌ Sem cache disponível. Conecte-se à internet ou selecione a pasta local.');
            // Não esconde o loading: os botões (Atualizar / Selecionar pasta) ficam disponíveis
        }

        // Reage a mudanças de conexão
        window.addEventListener('online', function() {
            isOnline = true;
            setConnectionBadge(true);
            showOfflineWarning(false);
            buscarOnline(true); // sincroniza em background
        });

        window.addEventListener('offline', function() {
            isOnline = false;
            setConnectionBadge(false);
            showOfflineWarning(true);
        });
    }

    // ── Fetch online data ──
    function buscarOnline(background) {
        if (!background) {
            updateProgress(40, 'Buscando dados online no Google Sheets...', 'Carregando');
            setSource('google_sheets');
        }

        // Call existing agrosyncOnlineLoad
        if (typeof agrosyncOnlineLoad === 'function') {
            // agrosyncOnlineLoad is async — it will update progress
            agrosyncOnlineLoad().then(function(success) {
                if (success) {
                    // Save to cache after successful load
                    setTimeout(function() {
                        var snapshot = AgroSyncCache.criarSnapshot();
                        AgroSyncCache.salvar(snapshot).catch(function(e) {
                            console.warn('[Sync] Falha ao salvar cache:', e);
                        });
                    }, 500);
                } else {
                    console.warn('[Sync] agrosyncOnlineLoad falhou');
                }

                if (!background) {
                    updateProgress(100, 'Dashboard pronto', success ? 'Dados online' : 'Modo offline');
                    setStep('graficos');
                    setTimeout(hideLoading, 600);
                }
            }).catch(function() {
                if (!background) {
                    // Fallback to cache
                    var meta = AgroSyncCache.obterMeta();
                    if (meta) {
                        abrirComCache(meta);
                    } else {
                        updateProgress(100, 'Erro ao carregar dados', 'Verifique a conexão');
                        setTimeout(hideLoading, 1000);
                    }
                }
            });
        } else {
            // Fallback if agrosyncOnlineLoad not available yet
            if (!background) {
                updateProgress(50, 'Aguardando módulos carregarem...', 'Online');
                setTimeout(function() {
                    if (typeof agrosyncOnlineLoad === 'function') {
                        agrosyncOnlineLoad();
                    }
                    updateProgress(100, 'Dashboard pronto', 'Concluído');
                    setStep('graficos');
                    setTimeout(hideLoading, 600);
                }, 1500);
            }
        }

        return Promise.resolve();
    }

    // ── Public API ──

    return {
        inicializar: inicializar,
        showLoading: showLoading,
        hideLoading: hideLoading,
        updateProgress: updateProgress,
        setStep: setStep,
        setConnectionBadge: setConnectionBadge,
        setSource: setSource,
        setLastUpdate: setLastUpdate,
        showOfflineWarning: showOfflineWarning,
        carregarDadosCache: carregarDadosCache,
        abrirComCache: abrirComCache,
        buscarOnline: buscarOnline
    };

})();

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(AgroSyncSync.inicializar, 100);
    });
} else {
    setTimeout(AgroSyncSync.inicializar, 100);
}
