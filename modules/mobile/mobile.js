// ═══════════════════════════════════════════════════════════════
//  MobileModule — Layout responsivo com sidebar
//  Ativado em viewport <= 1024px (tablet/celular)
//  ═══════════════════════════════════════════════════════════════

var MobileModule = (function() {

    var cfg = MobileConfig || {};
    var isMobile = false;
    var currentTab = 'solinftec';

    // ── Construir DOM do layout mobile ──
    function buildMobileDOM() {
        if (document.getElementById('mobile-topbar')) return;

        // Overlay
        var overlay = document.createElement('div');
        overlay.className = 'mobile-overlay';
        overlay.id = 'mobile-overlay';
        overlay.addEventListener('click', closeSidebar);
        document.body.appendChild(overlay);

        // Sidebar
        var sidebar = document.createElement('div');
        sidebar.className = 'mobile-sidebar';
        sidebar.id = 'mobile-sidebar';

        var sidebarHTML = '<div class="mobile-sidebar-header">' +
            '<div class="sidebar-logo">A</div>' +
            '<div><h2>AgroSync</h2><small>Análise de Dados</small></div>' +
            '</div><nav class="mobile-nav" id="mobile-nav">';

        cfg.tabs.forEach(function(t) {
            sidebarHTML += '<button class="mobile-nav-item" data-tab="' + t.id + '">' + t.label + '</button>';
        });

        sidebarHTML += '</nav>';
        sidebar.innerHTML = sidebarHTML;
        document.body.appendChild(sidebar);

        // Nav click listeners
        document.querySelectorAll('#mobile-nav .mobile-nav-item').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var tab = this.getAttribute('data-tab');
                closeSidebar();
                switchMainTab(tab);
            });
        });

        // Topbar
        var topbar = document.createElement('div');
        topbar.className = 'mobile-topbar';
        topbar.id = 'mobile-topbar';
        topbar.innerHTML =
            '<button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Menu">☰</button>' +
            '<h1 id="mobile-topbar-title">AgroSync</h1>' +
            '<div class="mobile-top-right">' +
                '<button class="mobile-top-btn" id="mobile-refresh-btn" aria-label="Atualizar">🔄</button>' +
                '<button class="mobile-top-btn" id="mobile-theme-btn" aria-label="Tema">🌙</button>' +
            '</div>';
        document.body.appendChild(topbar);

        document.getElementById('mobile-menu-btn').addEventListener('click', toggleSidebar);

        var refreshBtn = document.getElementById('mobile-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                this.classList.add('spinning');
                if (typeof agrosyncOnlineLoad === 'function') {
                    try { agrosyncOnlineLoad(); } catch(e) {}
                }
                var self = this;
                setTimeout(function() { self.classList.remove('spinning'); }, 1500);
            });
        }

        var themeBtn = document.getElementById('mobile-theme-btn');
        if (themeBtn) {
            themeBtn.addEventListener('click', function() {
                var input = document.getElementById('input');
                if (input) { input.click(); }
                else { document.body.classList.toggle('dark-theme'); }
                this.textContent = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
            });
        }
    }

    // ── Sidebar ──
    function openSidebar() {
        var sidebar = document.getElementById('mobile-sidebar');
        var overlay = document.getElementById('mobile-overlay');
        if (sidebar) sidebar.classList.add('open');
        if (overlay) overlay.classList.add('open');
        document.body.classList.add('mobile-sidebar-open');
    }

    function closeSidebar() {
        var sidebar = document.getElementById('mobile-sidebar');
        var overlay = document.getElementById('mobile-overlay');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        document.body.classList.remove('mobile-sidebar-open');
    }

    function toggleSidebar() {
        var sidebar = document.getElementById('mobile-sidebar');
        if (sidebar && sidebar.classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    // ── Highlight nav item ──
    function highlightNav(tab) {
        document.querySelectorAll('#mobile-nav .mobile-nav-item').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
    }

    // ── Update topbar title from tab name ──
    function updateTopbarTitle(tab) {
        var found = cfg.tabs.find(function(t) { return t.id === tab; });
        var title = document.getElementById('mobile-topbar-title');
        if (title) title.textContent = found ? found.label : 'AgroSync';
    }

    // ── Get desktop tab buttons container to show/hide ──
    function getDesktopTabBar() {
        return document.querySelector('.main-tabs');
    }

    // ── Toggle between mobile and desktop layout ──
    function applyLayout() {
        var w = window.innerWidth;
        var isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        var shouldBeMobile = w <= (cfg.breakpoints ? cfg.breakpoints.tablet : 1024) || isMobileUA;

        if (shouldBeMobile === isMobile) return;
        isMobile = shouldBeMobile;

        // A classe no body controla todos os overrides de CSS (padding, grids, header)
        document.body.classList.toggle('is-mobile', isMobile);

        if (isMobile) {
            closeSidebar();
            highlightNav(currentTab);
            updateTopbarTitle(currentTab);
        } else {
            closeSidebar();
        }
    }

    // ── Tab change handler (called from switchMainTab) ──
    function onTabChange(tab) {
        currentTab = tab;
        if (isMobile) {
            highlightNav(tab);
            updateTopbarTitle(tab);
            closeSidebar();
            resizeCharts();
        }
    }

    // ── Resize all Chart.js instances ──
    function resizeCharts() {
        if (typeof charts === 'undefined') return;
        Object.keys(charts).forEach(function(k) {
            if (charts[k] && typeof charts[k].resize === 'function') {
                charts[k].resize();
            }
        });
    }

    // ── Debounced resize handler ──
    var resizeTimer = null;
    function onResize() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            applyLayout();
            if (isMobile) resizeCharts();
        }, cfg.charts ? cfg.charts.debounceMs : 250);
    }

    // ── Init ──
    function init() {
        if (!cfg.enabled) return;

        buildMobileDOM();

        // Força aplicação inicial (isMobile começa null/false → applyLayout aplica a classe)
        isMobile = null;
        applyLayout();

        // Listen for resize + mudança de orientação
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);

        // Expose public API
        window.mobileModuleOnTabChange = onTabChange;
    }

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    return {
        init: init,
        toggleSidebar: toggleSidebar,
        openSidebar: openSidebar,
        closeSidebar: closeSidebar,
        onTabChange: onTabChange,
        resizeCharts: resizeCharts
    };

})();
