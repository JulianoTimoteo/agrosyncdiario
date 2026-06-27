        Chart.register(ChartDataLabels);

        let charts = {};

        // ── Theme toggle ──
        (function initTheme() {
            var saved = localStorage.getItem('agrosyncTheme');
            var preferDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            var isDark = saved === 'dark' || (!saved && preferDark);
            var toggle = document.getElementById('input');
            if (toggle) {
                toggle.checked = isDark;
                toggle.addEventListener('change', function() {
                    document.body.classList.toggle('dark-theme', this.checked);
                    localStorage.setItem('agrosyncTheme', this.checked ? 'dark' : 'light');
                    // Destroy all shared charts
                    Object.keys(charts).forEach(function(k) {
                        if (charts[k] && typeof charts[k].destroy === 'function') { charts[k].destroy(); }
                        delete charts[k];
                    });
                    // Re-render the currently visible tab
                    var activeTabDiv = document.querySelector('.main-tab-content.active');
                    if (activeTabDiv) {
                        var id = activeTabDiv.id;
                        if (id === 'main-biomassa' && typeof renderBiomassa === 'function') renderBiomassa();
                        else if (id === 'main-torta' && typeof renderTorta === 'function') renderTorta();
                        else if (id === 'main-controle' && typeof renderControle === 'function') renderControle();
                        else if (id === 'main-consumo' && typeof renderConsumo === 'function') renderConsumo();
                        else if (id === 'main-disponibilidade' && typeof renderDisponibilidade === 'function') renderDisponibilidade();
                        else if (id === 'main-densidade' && typeof renderDensidade === 'function') renderDensidade();
                    }
                });
            }
            if (isDark) {
                document.body.classList.add('dark-theme');
                // Ensure Chart.js updates on theme change
                document.querySelectorAll('canvas').forEach(function(c) {
                    var chartId = c.id;
                    if (charts[chartId]) {
                        var chart = charts[chartId];
                        chart.options.plugins.legend.labels.color = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
                        chart.update();
                    }
                });
            }
        })();

        let balanceData = [];
        let selectedDay = "TODOS";
        let solinftecData = { frentes: {}, totais: { PRODUTIVO: 0, IMPRODUTIVO: 0, MANUTENCAO: 0 } };
        let solinftecLoaded = false;
        let solinftecPeriodo = ''; // <-- período extraído do cabeçalho (dd/mm/aaaa)
        let solinftecFrotaAtividades = []; // [{frota, data, operacao, segundos}] — usado como fallback da permanência
        let balanceLoaded = false;
        let coaData = []; // [{dia, cargaId, analisado: bool}]
        let horariaRaw = []; // [{dia, hora, frente, peso}]
        let frenteFilter = { propria: false, terceira: false }; // false = não selecionado
        let permanenciaData = []; // [{viagem, frota, codMot, nomeMot, entrada, sonda, dentroUsina, saida, etapas, durMin, tipo, dia}]
        let permanenciaSelectedDay = 'TODOS';
        let densidadeRaw = []; // [{dia, diaAgricola, hora, horaAgricola, frente, tipoCarga, tipoNorm, viagem, peso}]
        let densSelectedDay = 'TODOS';

        const OP_PRODUTIVO = [
            '4001','4005','4009','4010','4015','4018',
            '1049','1050','1055','1068','1069',
            '2007','2030','2031',
            '3051','3056','3062','3083','3085','3095','3097'
        ];
        const OP_IMPRODUTIVO = [
            '3001','3002','3003','3004','3005','3006','3007','3008',
            '3010','3013','3015','3016','3017','3023','3029','3033',
            '3038','3041','3048','3054','3059','3072','3079','3093',
            '3000','3047','3021','3061','4014'
        ];
        const OP_MANUTENCAO = [
            '3020','3027','3028','3077','1035','1036','3009'
        ];
        const OP_NAMES = {
            // Produtivo
            '4001': 'Corte Mecanizado',       '4005': 'Auto Deslocamento',
            '4009': 'Deslocamento Carregado',  '4010': 'Deslocamento Vazio',
            '4015': 'Manobra Meio de Rua',     '4018': 'Aplic. Vinhaça Canal',
            '1049': 'Tração',                  '1050': 'Tração Motobomba',
            '1055': 'Carregando Terra/Bagaço', '1068': 'Aplic. Vinhaça Localizada',
            '1069': 'Manobra TPL',
            '2007': 'Transp. Cana Vazio',      '2030': 'Dentro da Usina',
            '2031': 'Caminhão Fila Balança',
            '3051': 'Caminhão Carregando',     '3056': 'Engate/Desengate Reboque',
            '3062': 'Enlonamento',             '3083': 'Transp. Vinhaça Carreg.',
            '3085': 'Aguard. Encher Canal',    '3095': 'Carregando AR',
            '3097': 'Eletro IMA',
            // Improdutivo
            '3001': 'Abastecimento',           '3002': 'Verificação/Check List',
            '3003': 'Aguardando Caminhão',     '3004': 'Aguardando Comboio',
            '3005': 'Aguardando Ordem',        '3006': 'Aguardando Prancha',
            '3007': 'Troca de Turno',          '3008': 'Condições Climáticas',
            '3010': 'Lavagem/Lubrificação',    '3013': 'Mudança de Área',
            '3015': 'Parada da Usina',         '3016': 'Parada Operador',
            '3017': 'Parada Refeição',         '3023': 'Aguardando Mecânico',
            '3029': 'Pátio de Tratores',       '3033': 'Aguardando Carregamento',
            '3038': 'Sem Apontamento',         '3041': 'Indeterminado',
            '3048': 'Aguardando Descarregar',  '3054': 'Mesa',
            '3059': 'Batendo Pneus',           '3072': 'Sem Operação',
            '3079': 'Aguardando Tração',       '3093': 'Aguardando Projeto',
            '3000': 'Pátio Barracao Adubo',    '3047': 'Aguard. Manobra Transbordo',
            '3021': 'Aguardando Transbordo',   '3061': 'Aguardando Colhedora',
            '4014': 'Fila de Transbordo',
            // Manutenção
            '3020': 'Manutenção Borracharia',  '3027': 'Manutenção Mecânica',
            '3028': 'Pátio Oficina',           '3077': 'Manutenção Solinftec',
            '1035': 'Oficina Externa Barretos','1036': 'Oficina Externa Rib. Preto',
            '3009': 'Manutenção Oficina'
        };

        function getDensidadeMensagem(densidade, viagens) {
            if (densidade <= 65) {
                return {
                    class: 'densidade-ruim',
                    emoji: '🔴',
                    status: 'ABAIXO DO IDEAL',
                    mensagem: `✅ ${viagens} viagem(is) real(is) | 🔴 ABAIXO DO IDEAL<br>📌 MELHORAR DENSIDADE!!`
                };
            }
            if (densidade <= 69.99) {
                return {
                    class: 'densidade-mediano',
                    emoji: '🟡',
                    status: 'MEDIANO',
                    mensagem: `✅ ${viagens} viagem(is) real(is) | 🟡 MEDIANO<br>📌 MELHORAR DENSIDADE!!`
                };
            }
            return {
                class: 'densidade-otimo',
                emoji: '🟢',
                status: 'EXCELENTE',
                mensagem: `✅ ${viagens} viagem(is) real(is) | 🟢 EXCELENTE<br>📌 Bom desempenho das cargas!!`
            };
        }

        // Classificação pela coluna "Tipo Carga"
        function classificarTipoVeiculoProprio(tipoCarga) {
            const tipoUpper = String(tipoCarga || "").toUpperCase();

            // RODOTREM - incluindo "RODOTREM" e "ROMEU E JULIETA"
            if (tipoUpper.includes("RODOTREM") || tipoUpper.includes("ROMEU")) {
                return "rodotrem";
            }

            // TREMINHÃO
            if (tipoUpper.includes("TREMINHAO") || tipoUpper.includes("TREMINHÃO")) {
                return "treminhao";
            }

            return "outro";
        }

        function normalize(txt) { return String(txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\\/–—]+/g, ' ').toUpperCase().trim(); }
        function parseNum(val) { if (val === null || val === undefined || val === "") return 0; if (typeof val === 'number') return isNaN(val) ? 0 : val; let s = String(val).trim().replace(/[R$\s]/g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; }
        function agrosyncPad2(v) { return String(v).padStart(2, '0'); }
        function agrosyncToISODate(dt) {
            if (!dt || isNaN(dt.getTime())) return null;
            return dt.getFullYear() + '-' + agrosyncPad2(dt.getMonth() + 1) + '-' + agrosyncPad2(dt.getDate());
        }
        function agrosyncExcelSerialToDate(value) {
            const n = Number(value);
            if (!isFinite(n)) return null;
            const whole = Math.floor(n);
            const frac = n - whole;
            // Excel/Sheets serial date sem usar toISOString para não virar o dia por fuso horário.
            const base = new Date(1899, 11, 30);
            base.setDate(base.getDate() + whole);
            const totalSeconds = Math.round(frac * 86400);
            base.setHours(Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60, 0);
            return base;
        }
        function parseAgroDateTime(value, baseDate = null) {
            if (value === null || value === undefined || value === '') return null;
            if (typeof value === 'number') {
                if (value > 1) return agrosyncExcelSerialToDate(value);
                if (baseDate) {
                    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
                    const totalSeconds = Math.round(value * 86400);
                    d.setHours(Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60, 0);
                    return d;
                }
                return null;
            }
            const s = String(value).trim();
            if (!s) return null;
            const numeric = s.replace(',', '.');
            if (/^\d+(\.\d+)?$/.test(numeric) && Number(numeric) > 1) return agrosyncExcelSerialToDate(Number(numeric));
            const timeOnly = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (timeOnly && baseDate) {
                const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
                d.setHours(+timeOnly[1], +timeOnly[2], +(timeOnly[3] || 0), 0);
                return d;
            }
            const compact = s.match(/^(\d{2})(\d{2})(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
            if (compact) {
                const [, dd, mm, yyyy, hh = '0', mi = '0'] = compact;
                return new Date(+yyyy, +mm - 1, +dd, +hh, +mi, 0, 0);
            }
            const m = s.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
            if (!m) return null;
            let [, a, b, c, hh = '0', mm = '0', ss = '0'] = m;
            let y, mo, d;
            if (a.length === 4) { y = +a; mo = +b; d = +c; }
            else { d = +a; mo = +b; y = c.length === 2 ? 2000 + +c : +c; }
            return new Date(y, mo - 1, d, +hh, +mm, +ss, 0);
        }
        function parseDateISO(value) { return agrosyncToISODate(parseAgroDateTime(value)); }
        function classColh(cod) { const s = String(cod || "").trim(); if (s.startsWith("80")) return "propria"; if (s.startsWith("83") || s.startsWith("93")) return "terceira"; return ""; }
        function classFrota(cod) { const s = String(cod || "").trim(); if (s.startsWith("31")) return "proprio"; if (s.startsWith("91")) return "terceiro"; return ""; }
        function fmtT(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' t'; }
        function getColorByMeta(pct, meta) { if (pct >= meta) return '#2ecc71'; if (pct >= meta * 0.9) return '#3498db'; if (pct >= meta * 0.8) return '#f1c40f'; return '#e74c3c'; }
        function avg(list) { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0; }

        // Filtro de frentes própria / terceira no gráfico horário
        function toggleFrenteFilter(tipo) {
            frenteFilter[tipo] = !frenteFilter[tipo];

            const btnProp = document.getElementById('btn-frente-prop');
            const btnTerc = document.getElementById('btn-frente-terc');
            const label = document.getElementById('frente-filter-label');

            // Estilos dos botões: ativo = preenchido, inativo = outline
            if (btnProp) {
                const on = frenteFilter.propria;
                btnProp.style.background = on ? '#40800c' : '#fff';
                btnProp.style.color = on ? '#fff' : '#40800c';
                btnProp.style.borderColor = '#40800c';
                btnProp.style.boxShadow = on ? '0 2px 8px rgba(64,128,12,.35)' : 'none';
            }
            if (btnTerc) {
                const on = frenteFilter.terceira;
                btnTerc.style.background = on ? '#e9a23b' : '#fff';
                btnTerc.style.color = on ? '#fff' : '#e9a23b';
                btnTerc.style.borderColor = '#e9a23b';
                btnTerc.style.boxShadow = on ? '0 2px 8px rgba(233,162,59,.35)' : 'none';
            }

            // Label de contexto
            const showP = frenteFilter.propria, showT = frenteFilter.terceira;
            if (label) {
                if (!showP && !showT) label.textContent = 'Exibindo todas as frentes';
                else if (showP && showT) label.textContent = 'Exibindo todas as frentes';
                else if (showP) label.textContent = 'Frentes: 08, 10, 11, 12, 13, 14, 15';
                else label.textContent = 'Frentes: F30, 33, 35, 38, 39';
            }

            renderHorariaChart();
        }

        function updateStatus() {
            const fileStatus = document.getElementById('fileStatus');
            let balanceIcon = balanceLoaded ? '✅' : '❌';
            let solinftecIcon = solinftecLoaded ? '✅' : '❌';

            const temConsumo = !!(window.consumoArquivos && (consumoArquivos.consCam || consumoArquivos.consCol || consumoArquivos.classCam || consumoArquivos.classCol));
            const temDisponibilidade = !!(window.disponibilidadeArquivos && (disponibilidadeArquivos.pdf || disponibilidadeArquivos.classCam || disponibilidadeArquivos.classCol));
            const consumoIcon = temConsumo || (typeof consumoProcessado !== 'undefined' && consumoProcessado) ? '✅' : '❌';
            const dispIcon = temDisponibilidade || (typeof disponibilidadeProcessado !== 'undefined' && disponibilidadeProcessado) ? '✅' : '❌';

            let statusHtml = `${balanceIcon} Producao.xlsx | ${solinftecIcon} Solinftec.xlsx | ${consumoIcon} Consumo/Classificação | ${dispIcon} Disponibilidade`;

            // Adiciona o período ao status global se estiver carregado
            if (solinftecLoaded && solinftecPeriodo) {
                statusHtml += ` | <span style="color:#40800c; font-weight:800;">🗓️ Período: ${formatarPeriodoBR(solinftecPeriodo)}</span>`;
            }

            if (fileStatus) fileStatus.innerHTML = statusHtml;
            const msgDiv = document.getElementById('statusMsg');
            const qualquerModulo = balanceLoaded || solinftecLoaded || temConsumo || temDisponibilidade || (typeof disponibilidadeData !== 'undefined' && disponibilidadeData.length) || (typeof consumoCaminhaoData !== 'undefined' && consumoCaminhaoData.length) || (typeof consumoColhedorasData !== 'undefined' && consumoColhedorasData.length);
            if (balanceLoaded && solinftecLoaded) { msgDiv.innerHTML = '✅ Producao.xlsx e Solinftec.xlsx carregados com sucesso!'; msgDiv.className = 'status-success'; }
            else if (qualquerModulo) { msgDiv.innerHTML = '✅ Arquivos encontrados para os módulos disponíveis. As abas sem arquivo base ficam vazias sem travar o sistema.'; msgDiv.className = 'status-success'; }
            else { msgDiv.innerHTML = '❌ Nenhum arquivo compatível encontrado. Selecione a pasta com os arquivos.'; msgDiv.className = 'status-error'; }
        }

        function normalizarTexto(valor) {
            return String(valor || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim()
                .toLowerCase();
        }

        function formatarDataISO(dataStr) {
            if (!dataStr) return '';
            var s = String(dataStr).trim();
            var d = null;
            // Tenta extrair parte de data de ISO ou string com T
            if (s.indexOf('T') >= 0) {
                d = new Date(s);
                if (!isNaN(d.getTime())) {
                    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
                }
            }
            // Tenta YYYY-MM-DD
            var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (m) return String(parseInt(m[3],10)).padStart(2,'0')+'/'+String(parseInt(m[2],10)).padStart(2,'0')+'/'+m[1];
            // Tenta DD/MM/AAAA ou DD-MM-AAAA
            m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
            if (m) return String(parseInt(m[1],10)).padStart(2,'0')+'/'+String(parseInt(m[2],10)).padStart(2,'0')+'/'+(m[3].length===2?'20'+m[3]:m[3]);
            // Já está em formato brasileiro curto (dd/mm)
            m = s.match(/^(\d{1,2})[\/-](\d{1,2})$/);
            if (m) return String(parseInt(m[1],10)).padStart(2,'0')+'/'+String(parseInt(m[2],10)).padStart(2,'0');
            return s;
        }

        function formatarPeriodoBR(periodo) {
            if (!periodo) return '';
            var s = String(periodo).trim();
            // Se contém " a " (range), formatar cada parte
            if (s.indexOf(' a ') >= 0) {
                var partes = s.split(' a ');
                return partes.map(formatarDataISO).join(' a ');
            }
            return formatarDataISO(s);
        }

        function atualizarVisibilidadeBotaoBiomassa(abaAtiva) {
            var botoes = document.querySelectorAll('[data-biomassa-only]');
            var isBiomassa = normalizarTexto(abaAtiva) === 'biomassa';
            botoes.forEach(function(b) { b.style.display = isBiomassa ? '' : 'none'; });
        }

        function switchMainTab(tab) {
            document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            ['main-solinftec', 'main-balance', 'main-densidade', 'main-controle', 'main-consumo', 'main-disponibilidade', 'main-torta', 'main-biomassa'].forEach(id => {
                const el = document.getElementById(id); if (el) el.classList.remove('active');
            });
            const balHeaderTabs = document.getElementById('balance-tabs-header');
            if (tab === 'solinftec') {
                document.getElementById('main-solinftec').classList.add('active');
                if (balHeaderTabs) balHeaderTabs.style.display = 'none';
            } else if (tab === 'balance') {
                document.getElementById('main-balance').classList.add('active');
                if (balHeaderTabs) balHeaderTabs.style.display = 'flex';
            } else if (tab === 'controle') {
                document.getElementById('main-controle').classList.add('active');
                if (balHeaderTabs) balHeaderTabs.style.display = 'none';
                renderControle();
            } else if (tab === 'consumo') {
                document.getElementById('main-consumo').classList.add('active');
                if (balHeaderTabs) balHeaderTabs.style.display = 'none';
                renderConsumo();
            } else if (tab === 'disponibilidade') {
                document.getElementById('main-disponibilidade').classList.add('active');
                if (balHeaderTabs) balHeaderTabs.style.display = 'none';
                renderDisponibilidade();
            } else if (tab === 'torta') {
                document.getElementById('main-torta').classList.add('active');
                if (balHeaderTabs) balHeaderTabs.style.display = 'none';
                renderTorta();
            } else if (tab === 'biomassa') {
                document.getElementById('main-biomassa').classList.add('active');
                if (balHeaderTabs) balHeaderTabs.style.display = 'none';
                renderBiomassa();
            } else {
                document.getElementById('main-densidade').classList.add('active');
                if (balHeaderTabs) balHeaderTabs.style.display = 'none';
            }
            atualizarVisibilidadeBotaoBiomassa(tab);
            if (typeof mobileModuleOnTabChange === 'function') mobileModuleOnTabChange(tab);
        }

        function switchSolinftecTab(tab) {
            document.querySelectorAll('.solinftec-tab').forEach(t => t.classList.remove('active'));
            if (typeof event !== 'undefined' && event.target) event.target.classList.add('active');
            ['geral', 'colhedoras', 'transbordos', 'permanencia'].forEach(id => {
                const el = document.getElementById('solinftec-' + id);
                if (el) el.classList.remove('active');
            });
            const target = document.getElementById('solinftec-' + tab);
            if (target) target.classList.add('active');
            if (tab === 'permanencia') renderPermanenciaDetalhada();
        }

        function switchBalanceTab(tab) {
            // sync both the header-level tabs and any inline tabs
            document.querySelectorAll('.balance-tab').forEach(t => t.classList.remove('active'));
            // activate all buttons matching the clicked tab label
            document.querySelectorAll('.balance-tab').forEach(t => {
                if ((tab === 'colheita' && t.textContent.includes('COLHEDORAS')) ||
                    (tab === 'transporte' && t.textContent.includes('TRANSPORTE'))) {
                    t.classList.add('active');
                }
            });
            document.getElementById('balance-colheita').classList.remove('active');
            document.getElementById('balance-transporte').classList.remove('active');
            if (tab === 'colheita') document.getElementById('balance-colheita').classList.add('active');
            else document.getElementById('balance-transporte').classList.add('active');
        }

        // ═══════════════════════════════════════════════════════════════
        function openIDB() {
            return new Promise((res, rej) => {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
                req.onsuccess = e => res(e.target.result);
                req.onerror = () => rej(req.error);
            });
        }
        async function saveHandle(handle) {
            try {
                const db = await openIDB();
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
            } catch (_) { }
        }
        async function loadHandle() {
            try {
                const db = await openIDB();
                return await new Promise((res, rej) => {
                    const tx = db.transaction(IDB_STORE, 'readonly');
                    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
                    req.onsuccess = () => res(req.result || null);
                    req.onerror = () => rej(req.error);
                });
            } catch (_) { return null; }
        }

        // Lê e processa os arquivos de um FileSystemDirectoryHandle
        async function loadFromDirHandle(dirHandle) {
            const results = { producao: null, solinftec: null, torta: null, biomassa: null, name: dirHandle.name };
            disponibilidadeResetArquivos(); // novo módulo DISPONIBILIDADE: limpa PDF anterior
            consumoResetArquivos(); // novo módulo CONSUMO: limpa arquivos anteriores
            for await (const [name, fh] of dirHandle.entries()) {
                if (fh.kind !== 'file') continue;
                const low = name.toLowerCase();
                if (low === 'producao.xlsx') results.producao = await fh.getFile();
                if (low === 'solinftec.xlsx') results.solinftec = await fh.getFile();
                if (low === 'torta.xls') results.torta = await fh.getFile();
                if (low === 'biomassa.xlsx' || low === 'biomassa.xls') results.biomassa = await fh.getFile();
                const tipoConsumo = consumoIdentificarArquivo(name); // novo módulo CONSUMO
                if (tipoConsumo) consumoArquivos[tipoConsumo] = await fh.getFile();
                const tipoDisponibilidade = disponibilidadeIdentificarArquivo(name); // novo módulo DISPONIBILIDADE
                if (tipoDisponibilidade) disponibilidadeArquivos[tipoDisponibilidade] = await fh.getFile();
            }
            return results;
        }

        function showDashboard(folderName) {
            document.getElementById('folderInfo').style.display = 'flex';
            document.getElementById('folderPath').innerText = folderName;
            document.getElementById('uploadPrompt').classList.add('hidden');
            document.getElementById('dashboardContent').classList.remove('hidden');
            var ls = document.getElementById('loading-screen');
            if (ls && !ls.classList.contains('hidden')) {
                ls.classList.add('hidden');
            }
        }

        function readXlsxFile(file, isBalance) {
            return new Promise((res) => {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const data = new Uint8Array(evt.target.result);
                    const wb = XLSX.read(data, { type: 'array' });
                    const json = isBalance
                        ? XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
                        : XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                    res(json);
                };
                reader.readAsArrayBuffer(file);
            });
        }

        async function processFiles(producaoFile, solinftecFile) {
            if (producaoFile) {
                const json = await readXlsxFile(producaoFile, true);
                processBalanceData(json);
            }
            if (solinftecFile) {
                const json = await readXlsxFile(solinftecFile, false);
                processSolinftecData(json);
            }
            // Se permanência não veio da Balança, tenta derivar do Solinftec
            if (!permanenciaData.length && solinftecFrotaAtividades.length) {
                permanenciaData = agrosyncDerivarPermanenciaDeSolinftec(solinftecFrotaAtividades);
                permanenciaSelectedDay = 'TODOS';
                renderPermanenciaDetalhada();
            }
            updateStatus();
        }

        function setAutoBanner(msg, done = false) {
            const banner = document.getElementById('auto-load-banner');
            const msgEl = document.getElementById('auto-load-msg');
            const spinner = document.getElementById('auto-load-spinner');
            const dismiss = document.getElementById('auto-load-dismiss');
            banner.style.display = 'flex';
            msgEl.textContent = msg;
            spinner.style.display = done ? 'none' : 'inline-block';
            dismiss.style.display = done ? 'inline-block' : 'none';
        }
        function dismissAutoBanner() {
            document.getElementById('auto-load-banner').style.display = 'none';
        }

        // Tentativa de carregamento automático ao abrir a página
        async function tryAutoLoad() {
            if (!('showDirectoryPicker' in window)) return; // browser não suporta FSA

            const handle = await loadHandle();
            if (!handle) return; // nenhuma pasta salva

            // Mostra dica na upload zone
            const hint = document.getElementById('last-folder-hint');
            if (hint) hint.style.display = 'block';
            setAutoBanner(`📂 Última pasta: "${handle.name}" — solicitando permissão…`);

            try {
                const perm = await handle.requestPermission({ mode: 'read' });
                if (perm !== 'granted') {
                    dismissAutoBanner();
                    if (hint) hint.style.display = 'none';
                    return;
                }
                setAutoBanner(`⏳ Lendo arquivos de "${handle.name}"…`);
                const { producao, solinftec, biomassa, name } = await loadFromDirHandle(handle);
                showDashboard(name);
                if (hint) hint.style.display = 'none';
                await processFiles(producao, solinftec);
                await processConsumoFiles(); // novo módulo CONSUMO
                await processDisponibilidadeFiles(); // novo módulo DISPONIBILIDADE
                await processBiomassaFiles(biomassa); // módulo BIOMASSA
                updateStatus();
                setAutoBanner(`✅ Pasta "${name}" carregada automaticamente!`, true);
            } catch (err) {
                console.warn('Auto-load falhou:', err);
                dismissAutoBanner();
                if (hint) hint.style.display = 'none';
            }
        }

        // Seleção manual de pasta
        async function selectFolder() {
            // Tenta File System Access API primeiro (Chrome/Edge ≥ 86)
            if ('showDirectoryPicker' in window) {
                try {
                    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
                    await saveHandle(dirHandle); // persiste para próxima vez
                    setAutobanner_off();
                    const { producao, solinftec, torta, biomassa, name } = await loadFromDirHandle(dirHandle);
                    showDashboard(name);
                    await processFiles(producao, solinftec);
                    await processConsumoFiles(); // novo módulo CONSUMO
                    await processDisponibilidadeFiles(); // novo módulo DISPONIBILIDADE
                    await processTortaFiles(torta); // módulo TORTA
                    await processBiomassaFiles(biomassa); // módulo BIOMASSA
                    updateStatus();
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return; // usuário cancelou
                    console.warn('showDirectoryPicker falhou, usando fallback:', err);
                }
            }

            // Fallback: <input webkitdirectory> (Firefox / contexto sem FSA)
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.directory = true;
            input.onchange = async (e) => {
                const files = Array.from(e.target.files);
                if (!files.length) return;
                const folderName = files[0].webkitRelativePath.split('/')[0];
                showDashboard(folderName);
                const producaoFile = files.find(f => f.name.toLowerCase() === 'producao.xlsx');
                const solinftecFile = files.find(f => f.name.toLowerCase() === 'solinftec.xlsx');
                const tortaFile = files.find(f => f.name.toLowerCase() === 'torta.xls');
                const biomassaFile = files.find(f => f.name.toLowerCase() === 'biomassa.xlsx' || f.name.toLowerCase() === 'biomassa.xls');
                consumoResetArquivos(); // novo módulo CONSUMO
                disponibilidadeResetArquivos(); // novo módulo DISPONIBILIDADE
                files.forEach(f => {
                    const tipoConsumo = consumoIdentificarArquivo(f.name);
                    if (tipoConsumo && !consumoArquivos[tipoConsumo]) consumoArquivos[tipoConsumo] = f;
                    const tipoDisponibilidade = disponibilidadeIdentificarArquivo(f.name);
                    if (tipoDisponibilidade && !disponibilidadeArquivos[tipoDisponibilidade]) disponibilidadeArquivos[tipoDisponibilidade] = f;
                });
                await processFiles(producaoFile, solinftecFile);
                await processConsumoFiles(); // novo módulo CONSUMO
                await processDisponibilidadeFiles(); // novo módulo DISPONIBILIDADE
                await processTortaFiles(tortaFile);
                await processBiomassaFiles(biomassaFile);
                updateStatus();
            };
            input.click();
        }
        function setAutobanner_off() {
            const b = document.getElementById('auto-load-banner');
            if (b) b.style.display = 'none';
        }


        // ═══════════════════════════════════════════════════════════════
        //  MODO ONLINE — Google Sheets / Apps Script
        //  Fonte: bot Python local → Google Sheets → Apps Script doGet
        // ═══════════════════════════════════════════════════════════════
        var AGROSYNC_ONLINE_API_URL = "https://script.google.com/macros/s/AKfycbxGgyghJguAd0Ww-EVB2O_ntV851Be3WXUtjvoIj-6z3_tcBwkDaZ1nV8yx835rNQAofg/exec";
        var AGROSYNC_ONLINE_TOKEN = "AgroSync_Pitangueiras_2026_x7K92";
        let agrosyncOnlineLoaded = false;
        let agrosyncOnlineUpdatedAt = "";

        function agrosyncOnlineSetMsg(msg, tipo = "info") {
            const msgDiv = document.getElementById('statusMsg');
            if (!msgDiv) return;
            msgDiv.innerHTML = msg;
            msgDiv.className = tipo === 'erro' ? 'status-error' : tipo === 'ok' ? 'status-success' : 'status-warning';
        }

        function agrosyncObjetosParaMatriz(rows) {
            if (!Array.isArray(rows) || !rows.length) return [];
            const headers = Object.keys(rows[0] || {});
            return [headers].concat(rows.map(r => headers.map(h => r[h] == null ? '' : r[h])));
        }

        function agrosyncParseNum(v) {
            if (typeof v === 'number') return isNaN(v) ? null : v;
            if (v == null || v === '') return null;

            let s = String(v).trim();
            if (!s) return null;

            // Remove símbolos, mas preserva separadores.
            s = s.replace(/[R$\s%]/g, '');

            // Corrige valores que o Sheets possa devolver com apóstrofo de texto.
            s = s.replace(/^'/, '');

            // ISO/data/hora não deve virar métrica numérica.
            if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
            if (/^\d{1,4}:\d{2}(:\d{2})?$/.test(s)) return null;

            // Formato brasileiro: 1.234,56
            if (s.includes(',') && s.includes('.')) {
                s = s.replace(/\./g, '').replace(',', '.');
            } else if (s.includes(',')) {
                s = s.replace(',', '.');
            }

            const n = parseFloat(s);
            return isNaN(n) ? null : n;
        }

        function agrosyncNormKey(k) {
            return consumoNormalizarTexto(k || '');
        }

        function agrosyncFindCol(headers, termos) {
            const hs = headers.map(h => ({ raw: h, n: agrosyncNormKey(h) }));
            for (const termo of termos) {
                const tn = agrosyncNormKey(termo);
                const achou = hs.find(h => h.n.includes(tn));
                if (achou) return achou.raw;
            }
            return null;
        }

        function agrosyncProcessarConsumoOnline(rows, tipo) {
            if (!Array.isArray(rows) || !rows.length) return { dados: [], colunas: [] };

            const headers = Object.keys(rows[0] || {});
            const frotaCol = agrosyncFindCol(headers, tipo === 'caminhao'
                ? ['Frota', 'Frota Motriz', 'Equipamento', 'Caminhão', 'Caminhao']
                : ['Frota', 'Equipamento', 'Colhedora']);

            if (!frotaCol) return { dados: [], colunas: [] };

            const ignorar = new Set([frotaCol]);
            const colunasNumericas = [];

            headers.forEach(h => {
                if (ignorar.has(h)) return;
                const nh = agrosyncNormKey(h);
                if (!nh || nh.includes('data') || nh.includes('hora') || nh.includes('periodo')) return;
                const qtdNum = rows.slice(0, 40).filter(r => agrosyncParseNum(r[h]) != null).length;
                if (qtdNum >= Math.min(3, rows.length)) colunasNumericas.push(h);
            });

            const colunasRelevantes = consumoFiltrarColunasRelevantes
                ? consumoFiltrarColunasRelevantes(colunasNumericas)
                : colunasNumericas;

            const dados = rows.map(r => {
                const frota = normalizarFrotaConsumo(r[frotaCol]);
                if (!frota) return null;
                const metrics = {};
                colunasRelevantes.forEach(c => {
                    const n = agrosyncParseNum(r[c]);
                    if (n != null) metrics[c] = n;
                });
                return {
                    frota,
                    grupo: tipo === 'caminhao' ? classificarGrupoCaminhao(frota) : classificarGrupoColhedora(frota),
                    metrics
                };
            }).filter(r => r && Object.keys(r.metrics).length);

            return { dados, colunas: colunasRelevantes };
        }

        function agrosyncProcessarDisponibilidadeOnline(rows, metaRows) {
            disponibilidadeCarregarPrefs();
            disponibilidadeProcessado = true;
            disponibilidadeData = [];
            disponibilidadePeriodo = '';
            disponibilidadeDataRelatorio = '';
            disponibilidadeHoraRelatorio = '';

            if (Array.isArray(metaRows)) {
                const meta = {};
                metaRows.forEach(r => {
                    const campo = String(r.campo || '').trim();
                    if (campo) meta[campo] = r.valor || '';
                });
                if (meta.periodo_inicio && meta.periodo_fim) disponibilidadePeriodo = meta.periodo_inicio + ' a ' + meta.periodo_fim;
                disponibilidadeDataRelatorio = meta.data_emissao || '';
                disponibilidadeHoraRelatorio = meta.hora_emissao || '';
            }

            if (!Array.isArray(rows)) return;

            disponibilidadeData = rows.map(r => {
                const frota = normalizarFrotaConsumo(r.frota || r.Frota || r.EQUIPAMENTO || r.equipamento);
                if (!frota) return null;
                return {
                    frota,
                    equipamento: r.equipamento || r.Equipamento || '',
                    qtdEqp: agrosyncParseNum(r.qtd_eqp || r.qtdEqp || r['qtd_eqp']) || 0,
                    os: agrosyncParseNum(r.os || r.O_S || r['O.S.']) || 0,
                    diasParados: agrosyncParseNum(r.dias_parados || r.diasParados),
                    ic: agrosyncParseNum(r.ic || r.I_C || r['I.C.']),
                    disp: agrosyncParseNum(r.disponibilidade || r.disp || r.Disp),
                    atend: agrosyncParseNum(r.atendimento || r.atend),
                    perm: r.horas_permanencia || r.perm || '',
                    trabalho: r.horas_trabalho || r.trabalho || '',
                    custoMo: agrosyncParseNum(r.custo_mo || r.custoMo),
                    totalPecas: agrosyncParseNum(r.total_pecas || r.totalPecas)
                };
            }).filter(r => r && r.disp != null && !isNaN(r.disp));
        }

        async function agrosyncBuscarGoogleSheets(tentativa) {
            const url = AGROSYNC_ONLINE_API_URL + '?token=' + encodeURIComponent(AGROSYNC_ONLINE_TOKEN) + '&ts=' + Date.now();
            const controller = new AbortController();
            const timeoutId = setTimeout(function() { controller.abort(); }, 200000);
            var resp;
            try {
                resp = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal });
            } finally {
                clearTimeout(timeoutId);
            }
            if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ao buscar Google Sheets.');
            const json = await resp.json();
            if (!json.ok) throw new Error(json.error || 'Apps Script retornou erro.');
            return json;
        }

        function agrosyncMesclarPartes(data) {
            var merged = {};
            var parteKeys = {};
            for (var key in data) {
                var m = key.match(/^(.+)__parte(\d+)$/);
                if (m) {
                    var baseName = m[1];
                    if (!parteKeys[baseName]) parteKeys[baseName] = [];
                    parteKeys[baseName].push({ key: key, num: parseInt(m[2], 10) });
                } else {
                    merged[key] = data[key];
                }
            }
            for (var baseName in parteKeys) {
                parteKeys[baseName].sort(function(a, b) { return a.num - b.num; });
                var combined = [];
                for (var i = 0; i < parteKeys[baseName].length; i++) {
                    var chunk = data[parteKeys[baseName][i].key];
                    if (Array.isArray(chunk)) {
                        for (var j = 0; j < chunk.length; j++) combined.push(chunk[j]);
                    }
                }
                merged[baseName] = combined;
            }
            return merged;
        }

        var agrosyncOnlineLoading = false;

        async function agrosyncOnlineLoad() {
            if (agrosyncOnlineLoading) return;
            agrosyncOnlineLoading = true;
            agrosyncOnlineSetMsg('⏳ Buscando dados no Google Sheets (pode levar ~2 min)...', 'info');
            var ls = document.getElementById('loading-screen');
            if (ls && ls.classList.contains('hidden')) {
                ls.classList.remove('hidden');
                if (typeof AgroSyncSync !== 'undefined' && AgroSyncSync) {
                    AgroSyncSync.updateProgress(10, 'Atualizando dados online...', 'Google Sheets');
                    AgroSyncSync.setSource('google_sheets');
                }
            }

            try {
                var json;
                try {
                    json = await agrosyncBuscarGoogleSheets();
                } catch (e) {
                    agrosyncOnlineSetMsg('⏳ Primeira tentativa falhou, tentando novamente...', 'info');
                    json = await agrosyncBuscarGoogleSheets();
                }
                var rawData = json.data || {};
                var data = agrosyncMesclarPartes(rawData);
                console.log('📦 Chaves recebidas do Google Sheets:', Object.keys(data));
                agrosyncOnlineUpdatedAt = json.updatedAt || '';

                // Mostra dashboard sem depender de seleção de pasta.
                showDashboard('Google Sheets / AgroSync Online');
                const folderInfo = document.getElementById('folderInfo');
                if (folderInfo) folderInfo.style.display = 'flex';

                // Zera módulos antigos antes de recarregar.
                balanceLoaded = false;
                solinftecLoaded = false;

                // Produção / Balança.
                if (Array.isArray(data.producao) && data.producao.length) {
                    const matrizProducao = agrosyncObjetosParaMatriz(data.producao);
                    processBalanceData(matrizProducao);
                }

                // Solinftec.
                if (Array.isArray(data.solinftec) && data.solinftec.length) {
                    processSolinftecData(data.solinftec);
                }

                // Se permanência não veio da Balança, tenta derivar do Solinftec
                if (!permanenciaData.length && solinftecFrotaAtividades.length) {
                    permanenciaData = agrosyncDerivarPermanenciaDeSolinftec(solinftecFrotaAtividades);
                    permanenciaSelectedDay = 'TODOS';
                    renderPermanenciaDetalhada();
                }

                // Classificações.
                consumoClassificacaoCaminhao = {};
                consumoClassificacaoColhedoras = {};
                if (Array.isArray(data.caminhao_classificacao) && data.caminhao_classificacao.length) {
                    consumoClassificacaoCaminhao = consumoParseClassificacao(agrosyncObjetosParaMatriz(data.caminhao_classificacao), 'caminhao');
                }
                if (Array.isArray(data.colhedoras_classificacao) && data.colhedoras_classificacao.length) {
                    consumoClassificacaoColhedoras = consumoParseClassificacao(agrosyncObjetosParaMatriz(data.colhedoras_classificacao), 'colhedoras');
                }

                // Consumo.
                consumoCarregarPrefs();
                consumoProcessado = true;
                consumoArquivos = {
                    classCam: data.caminhao_classificacao && data.caminhao_classificacao.length ? { name: 'Google Sheets' } : null,
                    classCol: data.colhedoras_classificacao && data.colhedoras_classificacao.length ? { name: 'Google Sheets' } : null,
                    consCam: data.consumo_caminhao && data.consumo_caminhao.length ? { name: 'Google Sheets' } : null,
                    consCol: data.consumo_colhedoras && data.consumo_colhedoras.length ? { name: 'Google Sheets' } : null
                };

                const consumoCam = agrosyncProcessarConsumoOnline(data.consumo_caminhao || [], 'caminhao');
                consumoCaminhaoData = consumoCam.dados;
                consumoColunasCaminhao = consumoCam.colunas;

                const consumoCol = agrosyncProcessarConsumoOnline(data.consumo_colhedoras || [], 'colhedoras');
                consumoColhedorasData = consumoCol.dados;
                consumoColunasColhedoras = consumoCol.colunas;

                if (!consumoMetricaCaminhao || consumoColunasCaminhao.indexOf(consumoMetricaCaminhao) < 0)
                    consumoMetricaCaminhao = detectarColunaConsumo(consumoColunasCaminhao, 'caminhao');
                if (!consumoMetricaColhedoras || consumoColunasColhedoras.indexOf(consumoMetricaColhedoras) < 0)
                    consumoMetricaColhedoras = detectarColunaConsumo(consumoColunasColhedoras, 'colhedoras');

                // Disponibilidade.
                disponibilidadeArquivos = {
                    pdf: data.disponibilidade && data.disponibilidade.length ? { name: 'Google Sheets / OS OFICINA GERAL.pdf' } : null,
                    classCam: consumoArquivos.classCam,
                    classCol: consumoArquivos.classCol
                };
                agrosyncProcessarDisponibilidadeOnline(data.disponibilidade || [], data.metadata_disponibilidade || data.metadata_pdf || []);

                // Torta.
                if (Array.isArray(data.torta) && data.torta.length) {
                    processTortaData(agrosyncObjetosParaMatriz(data.torta));
                }

                // Biomassa — busca em qualquer chave que contenha "biomassa"
                var biomassaDataRaw = null;
                for (var bk in data) {
                    if (bk.toLowerCase().indexOf('biomassa') >= 0) { biomassaDataRaw = data[bk]; break; }
                }
                if (biomassaDataRaw != null) {
                    console.log('🌿 Biomassa raw type:', typeof biomassaDataRaw, Array.isArray(biomassaDataRaw) ? 'array[' + biomassaDataRaw.length + ']' : typeof biomassaDataRaw, biomassaDataRaw);
                    if (Array.isArray(biomassaDataRaw)) {
                        if (biomassaDataRaw.length) {
                            console.log('🌿 Biomassa first row:', biomassaDataRaw[0], Array.isArray(biomassaDataRaw[0]) ? '(array)' : typeof biomassaDataRaw[0]);
                            processBiomassaData(biomassaDataRaw);
                        } else {
                            console.warn('🌿 Biomassa array vazio');
                        }
                    } else {
                        console.warn('🌿 Biomassa não é array, é:', typeof biomassaDataRaw);
                    }
                } else {
                    console.warn('🌿 Biomassa — chave não encontrada. Chaves disponíveis:', Object.keys(data));
                }

                // Metadata geral.
                const fileStatus = document.getElementById('fileStatus');
                if (fileStatus) {
                    const qtdConsCam = Array.isArray(data.consumo_caminhao) ? data.consumo_caminhao.length : 0;
                    const qtdConsCol = Array.isArray(data.consumo_colhedoras) ? data.consumo_colhedoras.length : 0;
                    const qtdDisp = Array.isArray(data.disponibilidade) ? data.disponibilidade.length : 0;
                    const fonteDisp = (data.metadata_disponibilidade || data.metadata_pdf || []).find
                        ? ((data.metadata_disponibilidade || data.metadata_pdf || []).find(x => String(x.campo || '').trim() === 'fonte_disponibilidade') || {}).valor || 'Google Sheets'
                        : 'Google Sheets';

                    var qtdTorta = Array.isArray(data.torta) ? data.torta.length : 0;
                    var qtdBiomassa = Array.isArray(biomassaDataRaw) ? biomassaDataRaw.length : 0;
                    fileStatus.innerHTML = '✅ Online Google Sheets | ' +
                        '🚛 Consumo caminhão: <strong>' + qtdConsCam + '</strong> | ' +
                        '🌾 Consumo colhedoras: <strong>' + qtdConsCol + '</strong> | ' +
                        '🛠️ Disponibilidade: <strong>' + qtdDisp + '</strong> | ' +
                        '🗻 Torta: <strong>' + (qtdTorta > 0 ? qtdTorta : '0') + '</strong> | ' +
                        '🌿 Biomassa: <strong>' + (qtdBiomassa > 0 ? qtdBiomassa : '0') + '</strong> | ' +
                        'Fonte disponibilidade: <strong>' + consumoEscHtml(fonteDisp) + '</strong>' +
                        (agrosyncOnlineUpdatedAt ? ' | <span style="color:#40800c;font-weight:800;">Atualizado: ' + new Date(agrosyncOnlineUpdatedAt).toLocaleString('pt-BR') + '</span>' : '');
                }

                updateStatus();
                renderConsumo();
                renderDisponibilidade();
                renderTorta();
                var biomassaContent = document.getElementById('main-biomassa');
                if (biomassaContent && biomassaContent.classList.contains('active')) renderBiomassa();

                agrosyncOnlineLoaded = true;
                agrosyncOnlineSetMsg('✅ Dados carregados do Google Sheets com sucesso.', 'ok');
                agrosyncOnlineLoading = false;
                return true;

            } catch (err) {
                console.error(err);
                agrosyncOnlineSetMsg('❌ Erro ao carregar Google Sheets: ' + err.message, 'erro');
                agrosyncOnlineLoading = false;
                return false;
            } finally {
                var lsEl = document.getElementById('loading-screen');
                if (lsEl && !lsEl.classList.contains('hidden') && (typeof AgroSyncSync === 'undefined' || !AgroSyncSync)) {
                    lsEl.classList.add('hidden');
                }
            }
        }


        // Inicia em modo online. Se falhar, mantém seleção de pasta como plano B.
        // Se sync-manager estiver presente, ele gerencia o carregamento inicial
        window.addEventListener('load', () => {
            if (typeof AgroSyncSync === 'undefined' || !AgroSyncSync) {
                agrosyncOnlineLoad();
            }
            var ativa = document.querySelector('.main-tab.active');
            if (ativa) {
                var tabName = ativa.textContent.trim().toLowerCase().replace(/[^a-z0-9]/g,'');
                var abaMatch = { solinftec:'solinftec', balance:'balance', densidade:'densidade', controle:'controle', consumo:'consumo', disponibilidade:'disponibilidade', torta:'torta', biomassa:'biomassa' };
                for (var k in abaMatch) { if (tabName.indexOf(k) >= 0) { atualizarVisibilidadeBotaoBiomassa(abaMatch[k]); break; } }
            }
        });
        // ═══════════════════════════════════════════════════════════════
        // ═══════════════════════════════════════════════════════════════
        //  captureAndCopy — captura a área de dados e copia pro clipboard
        // ═══════════════════════════════════════════════════════════════
        async function captureAndCopy() {
            const btn = document.getElementById('btn-screenshot');

            // Captura a aba ativa dentro do dashboardContent
            const activeTab = document.querySelector('.main-tab-content.active');
            const wrapper = document.getElementById('dashboardContent');
            const target = activeTab || wrapper;

            if (!target || (wrapper && wrapper.classList.contains('hidden'))) {
                showToast('⚠️ Carregue os dados antes de capturar', '#dc2626');
                return;
            }

            btn.classList.add('capturing');
            btn.textContent = '⏳ Capturando…';

            // Oculta tabelas Detalhamento (caminhão e colhedoras) durante o screenshot
            const tabelasDetalhamento = target.querySelectorAll('#consumo-caminhao-tabela, #consumo-colhedoras-tabela');
            tabelasDetalhamento.forEach(el => el.style.display = 'none');

            try {
                // ── renderiza com html2canvas ──────────────────────────
                const rect = target.getBoundingClientRect();
                const targetW = Math.min(rect.width || target.scrollWidth, 1920);
                const targetH = target.scrollHeight || rect.height;
                const canvas = await html2canvas(target, {
                    backgroundColor: '#ffffff',
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    logging: false,
                    width: targetW,
                    height: targetH,
                    windowWidth: targetW,
                    windowHeight: targetH,
                    scrollX: 0,
                    scrollY: -window.scrollY
                });

                const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));

                // ── tenta Clipboard API moderna ────────────────────────
                let copied = false;
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    copied = true;
                } catch (_) { /* bloqueado por permissions-policy */ }

                if (copied) {
                    showToast('📋 Copiado! Cole no WhatsApp com Ctrl+V', '#16a34a');
                    return;
                }

                // ── fallback: img em contenteditable + execCommand ─────
                const url = URL.createObjectURL(blob);
                const img = new Image();

                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = url;
                });

                // Div invisível fora da tela com a imagem
                const div = document.createElement('div');
                div.setAttribute('contenteditable', 'true');
                Object.assign(div.style, {
                    position: 'fixed', left: '-9999px', top: '0',
                    opacity: '0', pointerEvents: 'none'
                });
                div.appendChild(img);
                document.body.appendChild(div);

                // Seleciona e copia
                const range = document.createRange();
                range.selectNodeContents(div);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                const ok = document.execCommand('copy');
                sel.removeAllRanges();
                document.body.removeChild(div);
                URL.revokeObjectURL(url);

                if (ok) {
                    showToast('📋 Copiado! Cole no WhatsApp com Ctrl+V', '#16a34a');
                } else {
                    throw new Error('execCommand falhou');
                }

            } catch (err) {
                console.warn('Captura:', err);
                showToast('❌ Permissão negada. Abra o HTML direto no navegador (não em iframe).', '#dc2626');
            } finally {
                tabelasDetalhamento.forEach(el => el.style.display = '');
                btn.classList.remove('capturing');
                btn.innerHTML = '📸 CAPTURAR TELA';
            }
        }

        function showToast(msg, color = '#1e293b') {
            const toast = document.getElementById('screenshot-toast');
            toast.textContent = msg;
            toast.style.background = color;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3800);
        }
        // ═══════════════════════════════════════════════════════════════
