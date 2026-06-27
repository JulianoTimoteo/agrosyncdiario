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
            '<div class="mobile-top-right"></div>';
        document.body.appendChild(topbar);

        document.getElementById('mobile-menu-btn').addEventListener('click', toggleSidebar);
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
        var shouldBeMobile = w <= (cfg.breakpoints ? cfg.breakpoints.tablet : 1024);

        if (shouldBeMobile === isMobile) return;
        isMobile = shouldBeMobile;

        var topbar = document.getElementById('mobile-topbar');
        var sidebar = document.getElementById('mobile-sidebar');
        var overlay = document.getElementById('mobile-overlay');
        var desktopTabs = getDesktopTabBar();

        if (isMobile) {
            // Mobile mode
            if (topbar) topbar.style.display = '';
            if (sidebar) sidebar.style.display = '';
            if (overlay) overlay.style.display = '';
            if (desktopTabs) desktopTabs.style.display = 'none';

            // Hide balance-tabs-header
            var balTabs = document.getElementById('balance-tabs-header');
            if (balTabs) balTabs.style.display = 'none';

            closeSidebar();
            highlightNav(currentTab);
            updateTopbarTitle(currentTab);
        } else {
            // Desktop mode
            if (topbar) topbar.style.display = 'none';
            if (sidebar) sidebar.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
            if (desktopTabs) desktopTabs.removeAttribute('style');

            // Restore balance tabs visibility based on active tab
            var balTabs = document.getElementById('balance-tabs-header');
            if (balTabs) {
                balTabs.style.display = currentTab === 'balance' ? 'flex' : 'none';
            }

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

        // Apply initial layout
        isMobile = window.innerWidth <= (cfg.breakpoints ? cfg.breakpoints.tablet : 1024);
        applyLayout();

        // Listen for resize
        window.addEventListener('resize', onResize);

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
