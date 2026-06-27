// ═══════════════════════════════════════════════════════════════
//  MobileModule — Configuração
// ═══════════════════════════════════════════════════════════════

var MobileConfig = {
    enabled: true,
    breakpoints: {
        small: 480,
        large: 767,
        tablet: 1024
    },
    sidebar: {
        width: 280,
        animationMs: 300
    },
    charts: {
        minHeight: 220,
        tabletHeight: 260,
        debounceMs: 250
    },
    tabs: [
        { id: 'solinftec', label: '🚜 Solinftec' },
        { id: 'balance', label: '⚖️ Balanço' },
        { id: 'densidade', label: '📊 Densidade' },
        { id: 'controle', label: '📈 Controle' },
        { id: 'consumo', label: '⛽ Consumo' },
        { id: 'disponibilidade', label: '🛠️ Disponibilidade' },
        { id: 'torta', label: '🗻 Torta' },
        { id: 'biomassa', label: '🌿 Biomassa' }
    ]
};
