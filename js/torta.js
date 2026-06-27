        var tortaData = [];
        var tortaFiltro = 'TODOS';
        var tortaDia = 'TODOS';
        try { localStorage.removeItem('tortaMetaGeral'); } catch(e) {} // limpa legado
        var tortaCharts = {};

        var TORTA_CORES = ['#40800c','#2563eb','#7c3aed','#d97706','#059669','#dc2626','#0891b2','#ca8a04','#be185d','#1d4ed8','#15803d','#b45309','#6d28d9','#0d9488','#c2410c','#0284c7'];

        function tortaParseNum(v) {
            if (v == null || v === '') return 0;
            if (typeof v === 'number') return isNaN(v) ? 0 : v;
            var s = String(v).trim().replace(/\./g, '').replace(',', '.');
            var n = parseFloat(s);
            return isNaN(n) ? 0 : n;
        }

        function processTortaData(rows) {
            // Suporta dois formatos:
            // 1) Formato posicional bruto do XLS do GATec (col 0=Data Entrada, col 2=Data Saída, col 5=Entrada, col 6=Saída, col 7=Líquido, col 8=Placa, col 11=Cliente, col 13=Documento)
            // 2) Formato objeto/mapeado (vindo do Google Sheets ou leitura com cabeçalho)
            if (!Array.isArray(rows) || rows.length < 2) { tortaData = []; return; }

            var data = [];
            var primeiraLinha = rows[0];
            var isMatrizBruta = Array.isArray(primeiraLinha);

            if (isMatrizBruta) {
                // Detecta formato: 14+ cols = GATec raw, 12 cols = novo bot (data,datahora,...,documento)
                var colCount = rows[0].length;
                var isNewFormat = (colCount === 12);
                var produtoAtual = '';
                for (var i = 0; i < rows.length; i++) {
                    var row = rows[i];
                    if (!Array.isArray(row) || row.length < 2) continue;
                    var c0 = String(row[0] || '').trim();
                    var c1 = String(row[1] || '').trim();
                    // Linha de produto
                    if (c0 === 'Produto :' && c1) { produtoAtual = c1; continue; }
                    if (c0.toLowerCase().includes('total')) continue;

                    if (isNewFormat) {
                        // Primeira linha sempre é o cabeçalho ("data","datahora",...);
                        // pula também linhas sem data ISO (evita "Produto :" ou lixo)
                        if (i === 0) continue;
                        if (!c0.match(/^\d{4}-\d{2}-\d{2}/)) continue;
                        // Novo formato bot: data,datahora,mes,semana,produto,cliente,placa,entrada_kg,saida_kg,liquido_kg,liquido_ton,documento
                        var dataEntrada = c0.split('T')[0].split(' ')[0];
                        var entradaKg   = tortaParseNum(row[7]);
                        var saidaKg     = tortaParseNum(row[8]);
                        var liquidoKg   = tortaParseNum(row[9]);
                        var placa       = String(row[6] || '').trim();
                        var cliente     = String(row[5] || '').trim();
                        var documento   = String(row[11] || '').trim();
                        var produto2    = String(row[4] || '').trim() || produtoAtual;
                        if (!cliente || (!entradaKg && !liquidoKg && !placa)) continue;
                        data.push({
                            data: dataEntrada,
                            data_entrada: String(row[1] || row[0] || '').trim(),
                            data_saida: '',
                            produto: produto2,
                            cliente: cliente,
                            placa: placa,
                            entrada_kg: entradaKg || 0,
                            saida_kg: saidaKg || 0,
                            liquido_kg: liquidoKg || 0,
                            liquido_ton: (liquidoKg || 0) / 1000,
                            documento: documento
                        });
                    } else {
                        // Formato raw GATec (old): col 0=Data Entrada dd/mm/aaaa, col 5=Entrada, col 6=Saída, col 7=Líquido, col 8=Placa, col 11=Cliente, col 13=Documento
                        if (!c0.match(/^\d{2}\/\d{2}\/\d{4}/)) continue;
                        var dataEntrada = c0.split(' ')[0];
                        var dataSaida   = String(row[2] || '').trim().split(' ')[0];
                        var entradaKg_  = tortaParseNum(row[5]);
                        var saidaKg_    = tortaParseNum(row[6]);
                        var liquidoKg_  = tortaParseNum(row[7]);
                        var placa_      = String(row[8] || '').trim();
                        var cliente_    = String(row[11] || '').trim();
                        var documento_  = String(row[13] || '').trim();
                        if (!cliente_ || (!entradaKg_ && !liquidoKg_)) continue;
                        data.push({
                            data: dataEntrada,
                            data_entrada: c0,
                            data_saida: String(row[2] || '').trim(),
                            produto: produtoAtual,
                            cliente: cliente_,
                            placa: placa_,
                            entrada_kg: entradaKg_,
                            saida_kg: saidaKg_,
                            liquido_kg: liquidoKg_,
                            liquido_ton: liquidoKg_ / 1000,
                            documento: documento_
                        });
                    }
                }
            } else {
                // Formato objeto (Google Sheets / cabeçalho mapeado)
                var header = rows[0];
                for (var i = 1; i < rows.length; i++) {
                    var obj = {};
                    for (var j = 0; j < header.length; j++) { obj[header[j]] = rows[i][j]; }
                    // Normalizar campos
                    var dataEntrada = String(obj['Data Entrada'] || obj.data_entrada || obj.data || '').trim().split(' ')[0];
                    var liquidoKg2 = tortaParseNum(obj['Líquido'] || obj.liquido_kg || obj.liquido);
                    var entradaKg2 = tortaParseNum(obj['Entrada'] || obj.entrada_kg);
                    var saidaKg2   = tortaParseNum(obj['Saída'] || obj.saida_kg);
                    var placa2     = String(obj['Placa'] || obj.placa || '').trim();
                    var cliente2   = String(obj['Cliente'] || obj.cliente || obj.fazenda || '').trim();
                    var doc2       = String(obj['Documento'] || obj.documento || '').trim();
                    var produto2   = String(obj['Produto'] || obj.produto || '').trim();
                    if (!cliente2 || (!entradaKg2 && !liquidoKg2)) continue;
                    data.push({
                        data: dataEntrada,
                        data_entrada: String(obj['Data Entrada'] || obj.data_entrada || '').trim(),
                        data_saida: String(obj['Data Saída'] || obj.data_saida || '').trim(),
                        produto: produto2,
                        cliente: cliente2,
                        placa: placa2,
                        entrada_kg: entradaKg2,
                        saida_kg: saidaKg2,
                        liquido_kg: liquidoKg2,
                        liquido_ton: liquidoKg2 / 1000,
                        documento: doc2
                    });
                }
            }
            tortaData = data;
        }

        function tortaDestroyCharts() {
            for (var k in tortaCharts) { if (tortaCharts[k]) { tortaCharts[k].destroy(); } }
            tortaCharts = {};
        }

        function setTortaFiltro(valor) {
            tortaFiltro = valor;
            document.querySelectorAll('#torta-client-chips .consumo-chip, #torta-chip-todos').forEach(function(b) { b.classList.remove('active'); });
            if (valor === 'TODOS') {
                document.getElementById('torta-chip-todos').classList.add('active');
            } else {
                var btn = document.querySelector('#torta-client-chips .consumo-chip[data-cliente="' + valor.replace(/"/g, '') + '"]');
                if (btn) btn.classList.add('active');
            }
            renderTorta();
        }

        function setTortaDia(dia) {
            tortaDia = dia;
            document.querySelectorAll('#torta-dia-chips .consumo-chip, #torta-chip-dia-todos').forEach(function(b) { b.classList.remove('active'); });
            if (dia === 'TODOS') {
                var el = document.getElementById('torta-chip-dia-todos');
                if (el) el.classList.add('active');
            } else {
                var btn = document.querySelector('#torta-dia-chips .consumo-chip[data-dia="' + dia.replace(/"/g,'') + '"]');
                if (btn) btn.classList.add('active');
            }
            // Reset fazenda filter when day changes
            tortaFiltro = 'TODOS';
            renderTorta();
        }

        function tortaFiltrarDados() {
            var d = tortaData;
            if (tortaDia !== 'TODOS') d = d.filter(function(r) { return (r.data || '') === tortaDia; });
            if (tortaFiltro !== 'TODOS') d = d.filter(function(r) { return (r.cliente || '') === tortaFiltro; });
            return d;
        }

        function tortaRenderDayChips() {
            var container = document.getElementById('torta-dia-chips');
            if (!container) return;
            var dias = {};
            for (var i = 0; i < tortaData.length; i++) {
                var d = tortaData[i].data;
                if (d && d.trim()) dias[d] = (dias[d] || 0) + 1;
            }
            var keys = Object.keys(dias).sort(function(a,b){
                var pa = a.split(/[\/-]/), pb = b.split(/[\/-]/);
                if (pa.length !== 3) return 0;
                if (pb.length !== 3) return 0;
                var aKey = pa[0].length === 4 ? pa[0]+pa[1]+pa[2] : pa[2]+pa[1]+pa[0];
                var bKey = pb[0].length === 4 ? pb[0]+pb[1]+pb[2] : pb[2]+pb[1]+pb[0];
                return aKey.localeCompare(bKey);
            });
            var html = '';
            for (var j = 0; j < keys.length; j++) {
                var parts = keys[j].split(/[\/-]/);
                var label = parts.length === 3 ? (parts[0].length === 4 ? parts[2]+'/'+parts[1] : parts[0]+'/'+parts[1]) : keys[j].slice(0,5);
                var cnt = dias[keys[j]];
                html += '<button class="consumo-chip' + (tortaDia === keys[j] ? ' active' : '') + '" data-dia="' + keys[j] + '" onclick="setTortaDia(\'' + keys[j] + '\')">' + label + ' <span style="font-weight:400;opacity:0.6;">(' + cnt + 'V)</span></button>';
            }
            container.innerHTML = html;
        }

        function tortaRenderClientChips() {
            var container = document.getElementById('torta-client-chips');
            if (!container) return;
            // Only show clients visible in current day filter
            var base = tortaDia !== 'TODOS' ? tortaData.filter(function(r){ return r.data === tortaDia; }) : tortaData;
            var clientes = {};
            for (var i = 0; i < base.length; i++) {
                var c = base[i].cliente;
                if (c && c.trim()) clientes[c] = (clientes[c] || 0) + 1;
            }
            var keys = Object.keys(clientes).sort();
            var html = '';
            for (var j = 0; j < keys.length; j++) {
                var trips = clientes[keys[j]];
                html += '<button class="consumo-chip' + (tortaFiltro === keys[j] ? ' active' : '') + '" data-cliente="' + keys[j].replace(/"/g, '') + '" onclick="setTortaFiltro(\'' + keys[j].replace(/'/g, "\\'") + '\')">' + tortaNomeLimpo(keys[j]) + ' <span style="font-weight:400;opacity:0.6;">(' + trips + 'V)</span></button>';
            }
            container.innerHTML = html;
        }

        function tortaNomeLimpo(label) {
            var m = String(label).match(/^\d+\s*-\s*(.+)/);
            return m ? m[1].trim() : label;
        }
        function tortaFmtKg(v) {
            var n = tortaParseNum(v);
            if (!n) return '—';
            return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        }

        // ── Race ranking (by TRIPS) ──
        function tortaRenderRaceRankingViagens(containerId, entries, maxTrips) {
            var container = document.getElementById(containerId);
            if (!container) return;
            if (!entries || !entries.length) {
                container.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">Sem dados</div>';
                return;
            }
            var isClienteRanking = (containerId === 'torta-ranking-cliente');
            var metas = {};
            try { metas = JSON.parse(localStorage.getItem('tortaMetas') || '{}'); } catch(e) {}
            var max = maxTrips || entries[0].trips || 1;
            if (max <= 0) max = 1;
            var isDark = document.body.classList.contains('dark-theme');
            var labelColor = isDark ? '#f1f5f9' : '#1e293b';
            var totalColor = isDark ? '#f1f5f9' : '#000';
            var itemBg = isDark ? '#1e293b' : '#f8fafc';
            var barBg = isDark ? '#334155' : '#e2e8f0';
            var metaBg = isDark ? '#334155' : '#e2e8f0';
            var metaText = isDark ? '#94a3b8' : '#475569';
            var html = '';
            var medalhas = ['🥇','🥈','🥉'];
            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                var cor = TORTA_CORES[i % TORTA_CORES.length];
                var rank = i < 3 ? medalhas[i] : (i + 1);

                if (isClienteRanking) {
                    var metaNum = parseInt(metas[e.label], 10) || 10;
                    if (metaNum < 1) metaNum = 10;
                    var barPct = Math.min((e.trips / metaNum) * 100, 100);
                    var overflow = e.trips > metaNum ? e.trips - metaNum : 0;
                    if (i === 0 && tortaFiltro === 'TODOS') {
                        var totalTripsRank = entries.reduce(function(s, x) { return s + x.trips; }, 0);
                        var totalMetasRank = entries.reduce(function(s, x) {
                            var m = parseInt(metas[x.label], 10) || 10;
                            return s + Math.max(m, 1);
                        }, 0);
                        var totalTonRank = entries.reduce(function(s, x) { return s + x.value; }, 0);
                        var totalPct = Math.min((totalTripsRank / totalMetasRank) * 100, 100);
                        var totalOver = totalTripsRank > totalMetasRank ? totalTripsRank - totalMetasRank : 0;
                        html +=
                            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:5px 8px;border-radius:8px;background:' + metaBg + ';">' +
                                '<span style="min-width:24px;text-align:center;font-size:12px;">📊</span>' +
                                '<span style="font-size:12px;font-weight:700;color:' + metaText + ';">Total</span>' +
                                '<span style="flex:1;height:14px;background:' + barBg + ';border-radius:7px;overflow:hidden;position:relative;">' +
                                    '<span style="display:block;height:100%;width:' + totalPct + '%;background:#2563eb;border-radius:7px;transition:width 0.6s ease;"></span>' +
                                    (totalOver ? '<span style="position:absolute;right:3px;top:-1px;font-size:9px;font-weight:800;color:#dc2626;">+' + totalOver + '</span>' : '') +
                                '</span>' +
                                '<span style="font-weight:800;font-size:12px;color:' + totalColor + ';min-width:55px;text-align:right;">' + totalTripsRank + '/' + totalMetasRank + 'V</span>' +
                                '<span style="font-size:11px;color:' + totalColor + ';min-width:60px;text-align:right;">' + totalTonRank.toFixed(0) + 't</span>' +
                            '</div>';
                    }
                    html +=
                        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;padding:5px 8px;border-radius:8px;background:' + itemBg + ';">' +
                            '<span style="min-width:24px;text-align:center;font-size:14px;">' + rank + '</span>' +
                            '<span style="flex:0 0 auto;font-weight:700;font-size:12px;color:' + labelColor + ';min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;" title="' + e.label + '">' + tortaNomeLimpo(e.label) + '</span>' +
                            '<span style="flex:0 0 auto;display:inline-flex;align-items:center;gap:2px;font-size:11px;color:' + metaText + ';">' +
                                '<input type="number" min="1" step="1" value="' + metaNum + '" ' +
                                'style="width:36px;padding:2px 3px;border:1px solid ' + barBg + ';border-radius:4px;font-size:11px;text-align:center;" ' +
                                'onchange="tortaSalvarMeta(\'' + e.label.replace(/'/g, "\\'") + '\',this.value);renderTorta();">' +
                            '</span>' +
                            '<span style="flex:1;height:14px;background:' + barBg + ';border-radius:7px;overflow:hidden;position:relative;">' +
                                '<span style="display:block;height:100%;width:' + barPct + '%;background:' + cor + ';border-radius:7px;transition:width 0.6s ease;"></span>' +
                                (overflow ? '<span style="position:absolute;right:3px;top:-1px;font-size:9px;font-weight:800;color:#dc2626;">+' + overflow + '</span>' : '') +
                            '</span>' +
                            '<span style="flex:0 0 auto;font-weight:800;font-size:12px;color:' + totalColor + ';min-width:50px;text-align:right;">' + e.trips + '/' + metaNum + 'V</span>' +
                            '<span style="flex:0 0 auto;font-size:11px;color:' + totalColor + ';min-width:50px;text-align:right;">' + e.value.toFixed(0) + 't</span>' +
                        '</div>';
                } else {
                    var pctTrips = (e.trips / max) * 100;
                    html +=
                        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px 8px;border-radius:8px;background:' + itemBg + ';">' +
                            '<span style="min-width:24px;text-align:center;font-size:14px;">' + rank + '</span>' +
                            '<span style="flex:0 0 auto;font-weight:700;font-size:12px;color:' + labelColor + ';min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;" title="' + e.label + '">' + tortaNomeLimpo(e.label) + '</span>' +
                            '<span style="flex:1;height:20px;background:' + barBg + ';border-radius:10px;overflow:hidden;position:relative;">' +
                                '<span style="display:block;height:100%;width:' + pctTrips + '%;background:' + cor + ';border-radius:10px;transition:width 0.6s ease;"></span>' +
                            '</span>' +
                            '<span style="flex:0 0 auto;font-weight:900;font-size:16px;color:' + cor + ';min-width:40px;text-align:right;">' + e.trips + 'V</span>' +
                            '<span style="flex:0 0 auto;font-size:11px;color:' + totalColor + ';min-width:56px;text-align:right;">' + e.value.toFixed(0) + 't</span>' +
                        '</div>';
                }
            }
            container.innerHTML = html;
        }
        function tortaSalvarMeta(fazenda, valor) {
            var metas = {};
            try { metas = JSON.parse(localStorage.getItem('tortaMetas') || '{}'); } catch(e) {}
            if (valor && parseFloat(valor) > 0) {
                metas[fazenda] = parseInt(valor, 10);
            } else {
                delete metas[fazenda];
            }
            localStorage.setItem('tortaMetas', JSON.stringify(metas));
        }

        // ── Bar chart for trips ──
        function tortaMakeBarChartViagens(canvasId, labels, values) {
            var canvas = document.getElementById(canvasId);
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            var isDark = document.body.classList.contains('dark-theme');
            var tc = isDark ? '#fff' : '#000';
            if (tortaCharts[canvasId]) { tortaCharts[canvasId].destroy(); }
            tortaCharts[canvasId] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Viagens',
                        data: values,
                        backgroundColor: labels.map(function(_, i) { return TORTA_CORES[i % TORTA_CORES.length]; }),
                        borderWidth: 0,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: function(tt) { return tt.parsed.y + ' viagens'; } } },
                        datalabels: { color: '#fff', font: { weight: '800', size: 11 }, anchor: 'center', align: 'center',
                            formatter: function(v) { return v > 0 ? v : null; } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: tc, maxRotation: 45 } },
                        y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 }, color: tc, precision: 0, maxTicksLimit: 8 } }
                    }
                }
            });
        }

        function tortaMakeBarChartToneladas(canvasId, labels, values) {
            var canvas = document.getElementById(canvasId);
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            var isDark = document.body.classList.contains('dark-theme');
            var tc = isDark ? '#fff' : '#000';
            var gridCol = isDark ? '#334155' : '#f1f5f9';
            var tooltipBg = isDark ? '#334155' : '#1e293b';
            if (tortaCharts[canvasId]) { tortaCharts[canvasId].destroy(); }
            tortaCharts[canvasId] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Toneladas',
                        data: values,
                        backgroundColor: labels.map(function(_, i) { return TORTA_CORES[i % TORTA_CORES.length]; }),
                        borderWidth: 0,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { backgroundColor: tooltipBg, callbacks: { label: function(tt) { return tt.parsed.y.toFixed(0) + ' ton'; } } },
                        datalabels: { color: '#fff', font: { weight: '800', size: 11 }, anchor: 'center', align: 'center',
                            formatter: function(v) { return v > 0 ? v.toFixed(0) : null; } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: tc, maxRotation: 45 } },
                        y: { grid: { color: gridCol }, ticks: { font: { size: 9 }, color: tc } }
                    }
                }
            });
        }

        // ── Race ranking bar (HTML/CSS) — legacy, kept for compatibility ──

        function tortaRenderRaceRanking(containerId, entries, maxValue, corLabel, tripMap) {
            var container = document.getElementById(containerId);
            if (!container) return;
            if (!entries || !entries.length) {
                container.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">Sem dados</div>';
                return;
            }
            var max = maxValue || entries[0].value;
            if (max <= 0) max = 1;
            var isDark = document.body.classList.contains('dark-theme');
            var labelColor = isDark ? '#f1f5f9' : '#1e293b';
            var itemBg = isDark ? '#1e293b' : '#f8fafc';
            var barBg = isDark ? '#334155' : '#e2e8f0';
            var html = '';
            var len = entries.length;
            var medalhas = ['🥇','🥈','🥉'];
            for (var i = 0; i < len; i++) {
                var e = entries[i];
                var pct = (e.value / max) * 100;
                var cor = TORTA_CORES[i % TORTA_CORES.length];
                var rank = i < 3 ? medalhas[i] : (i + 1);
                var trips = tripMap && tripMap[e.label] ? tripMap[e.label] : '';
                var tripBadge = trips ? ' <span style="font-weight:600;color:#2563eb;font-size:12px;">' + trips + 'V</span>' : '';
                html +=
                    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:4px 6px;border-radius:8px;background:' + itemBg + ';">' +
                        '<span style="min-width:24px;text-align:center;font-size:14px;">' + rank + '</span>' +
                        '<span style="flex:0 0 auto;font-weight:600;font-size:13px;color:' + labelColor + ';min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;" title="' + e.label + '">' + e.label + '</span>' +
                        '<span style="flex:1;height:22px;background:' + barBg + ';border-radius:11px;overflow:hidden;position:relative;">' +
                            '<span style="display:block;height:100%;width:' + pct + '%;background:' + cor + ';border-radius:11px;transition:width 0.6s ease;"></span>' +
                        '</span>' +
                        '<span style="flex:0 0 auto;font-weight:800;font-size:14px;color:' + cor + ';min-width:60px;text-align:right;">' + e.value.toFixed(1) + 't</span>' +
                        tripBadge +
                    '</div>';
            }
            container.innerHTML = html;
        }

        // ── Donut chart ──
        function tortaMakeDonut(canvasId, legendId, entries, label) {
            var canvas = document.getElementById(canvasId);
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            if (!entries || !entries.length) {
                tortaCharts[canvasId] = null;
                return;
            }
            var isDark = document.body.classList.contains('dark-theme');
            var textColor = isDark ? '#fff' : '#000';
            var labels = entries.map(function(e) { return tortaNomeLimpo(e.label); });
            var values = entries.map(function(e) { return e.value; });
            var total = values.reduce(function(a,b){return a+b}, 0) || 1;
            var bgColors = entries.map(function(_, i) { return TORTA_CORES[i % TORTA_CORES.length]; });
            tortaCharts[canvasId] = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: bgColors,
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '60%',
                    layout: { padding: { top: 28 } },
                    plugins: {
                        legend: { display: false },
                        datalabels: {
                            color: textColor,
                            font: { weight: '700', size: 11 },
                            anchor: 'end',
                            align: 'end',
                            offset: 4,
                            formatter: function(value) {
                                return (value / total * 100).toFixed(0) + '%';
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(tt) {
                                    return tt.label + ': ' + tt.parsed.toFixed(0) + 't (' + (tt.parsed / total * 100).toFixed(0) + '%)';
                                }
                            }
                        }
                    }
                },
                plugins: [{
                    id: 'centerText',
                    beforeDraw: function(chart) {
                        var w = chart.width, h = chart.height;
                        var c = chart.ctx;
                        c.save();
                        c.font = 'bold 26px sans-serif';
                        c.textAlign = 'center';
                        c.textBaseline = 'middle';
                        c.fillStyle = textColor;
                        c.fillText(total.toFixed(0) + 't', w / 2, h / 2);
                        c.restore();
                    }
                }]
            });
            // Legend
            var legDiv = document.getElementById(legendId);
            if (legDiv) {
                var html = '<div style="display:flex;flex-wrap:wrap;gap:4px 10px;justify-content:center;">';
                for (var i = 0; i < labels.length; i++) {
                    var pct = (values[i] / total * 100);
                    html += '<span style="display:inline-flex;align-items:center;gap:4px;color:' + textColor + ';"><span style="width:10px;height:10px;border-radius:2px;background:' + bgColors[i] + ';"></span>' + labels[i] + ' <strong>' + pct.toFixed(0) + '%</strong></span>';
                }
                html += '</div>';
                legDiv.innerHTML = html;
            }
        }

        // ── Horizontal bar chart (Chart.js) for trips ──
        function tortaMakeBarChart(canvasId, labels, values, cor) {
            var canvas = document.getElementById(canvasId);
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            tortaCharts[canvasId] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: cor || '#2563eb',
                        borderRadius: 4,
                        borderSkipped: false
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: function(tt) { return tt.parsed + ' viagens'; } } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { stepSize: 1, font: { size: 10 } } },
                        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
                    }
                }
            });
        }

        // ── Line chart for evolution ──
        function tortaMakeLineChart(canvasId, labels, values) {
            var canvas = document.getElementById(canvasId);
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            var isDark = document.body.classList.contains('dark-theme');
            var tc = isDark ? '#fff' : '#000';
            var gridCol = isDark ? '#334155' : '#f1f5f9';
            var tooltipBg = isDark ? '#334155' : '#1e293b';
            var grad = ctx.createLinearGradient(0,0,0,200);
            grad.addColorStop(0, 'rgba(64,128,12,0.3)');
            grad.addColorStop(1, 'rgba(64,128,12,0)');
            tortaCharts[canvasId] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        borderColor: '#40800c',
                        backgroundColor: grad,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 3,
                        pointBackgroundColor: '#40800c',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { backgroundColor: tooltipBg, callbacks: { label: function(tt) { return tt.parsed.toFixed(0) + ' ton'; } } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: tc } },
                        y: { grid: { color: gridCol }, ticks: { font: { size: 9 }, color: tc, callback: function(v) { return v >= 0 ? Math.round(v) + 't' : ''; } } }
                    }
                }
            });
        }

        // ── Main render ──
        function renderTorta() {
            if (tortaData.length === 0) {
                var container = document.getElementById('main-torta');
                if (container) container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#94a3b8;"><h2>🗻 Nenhum dado de Torta disponível</h2><p style="margin-top:8px;">Carregue o arquivo Torta.xls ou ative o modo Online.</p></div>';
                return;
            }

            tortaDestroyCharts();
            tortaRenderDayChips();
            var dados = tortaFiltrarDados();
            tortaRenderClientChips();

            if (dados.length === 0) {
                var kpisDiv2 = document.getElementById('torta-kpis');
                if (kpisDiv2) kpisDiv2.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:#94a3b8;font-weight:700;">Nenhum registro para o filtro selecionado.</div>';
                return;
            }

            // ── Aggregations ──
            var aggCliente = {};   // { nome: { ton: X, trips: Y } }
            var aggVeiculo = {};   // { placa: { ton: X, trips: Y } }
            var evolucao = {};

            for (var i = 0; i < dados.length; i++) {
                var d = dados[i];
                var cli = d.cliente && d.cliente.trim() ? d.cliente : 'SEM ORIGEM';
                var pla = d.placa && d.placa.trim() ? String(d.placa) : 'SEM VEÍCULO';
                var ton = tortaParseNum(d.liquido_ton);
                var data = d.data || 'SEM DATA';

                if (!aggCliente[cli]) aggCliente[cli] = { ton: 0, trips: 0 };
                aggCliente[cli].ton += ton;
                aggCliente[cli].trips += 1;

                if (!aggVeiculo[pla]) aggVeiculo[pla] = { ton: 0, trips: 0 };
                aggVeiculo[pla].ton += ton;
                aggVeiculo[pla].trips += 1;

                evolucao[data] = (evolucao[data] || 0) + ton;
            }

            // Sort entries by trips (viagens)
            function sortByTrips(obj) {
                return Object.keys(obj).map(function(k) { return { label: k, value: obj[k].ton, trips: obj[k].trips }; }).sort(function(a, b) { return b.trips - a.trips; });
            }
            function consolidateEntries(arr, max) {
                if (arr.length <= max) return arr;
                var top = arr.slice(0, max - 1);
                var rest = arr.slice(max - 1);
                var outVal = rest.reduce(function(s, x) { return s + x.value; }, 0);
                var outTrp = rest.reduce(function(s, x) { return s + x.trips; }, 0);
                top.push({ label: 'Outros', value: outVal, trips: outTrp });
                return top;
            }
            var clienteEntries = sortByTrips(aggCliente);
            var veiculoEntries = sortByTrips(aggVeiculo);

            // ── KPIs ──
            var metas = {};
            try { metas = JSON.parse(localStorage.getItem('tortaMetas') || '{}'); } catch(e) {}
            var totalTon = clienteEntries.reduce(function(s, e) { return s + e.value; }, 0);
            var totalTrips = dados.length;
            var qtdClientes = clienteEntries.length;
            var qtdVeiculos = veiculoEntries.length;
            var avgTon = totalTrips > 0 ? (totalTon / totalTrips) : 0;
            var diaLabel = tortaDia === 'TODOS' ? 'Período Completo' : (function(d){var p=d.split(/[\/-]/);return p.length===3?(p[0].length===4?p[2]+'/'+p[1]+'/'+p[0]:d):d;})(tortaDia);

            var kpisDiv = document.getElementById('torta-kpis');
            if (kpisDiv) {
                function kpiCard(val, label, sub, accent, tip) {
                    return '<div class="torta-kpi-card"><div class="kpi-accent" style="background:' + accent + ';"></div><div class="kpi-val">' + val + '</div><div class="kpi-lbl">' + label + '</div>' + (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '<span class="kpi-tooltip">' + tip + '</span></div>';
                }
                kpisDiv.innerHTML =
                    kpiCard(totalTrips, 'VIAGENS', diaLabel, '#2563eb', 'N\u00famero total de viagens realizadas no per\u00edodo') +
                    kpiCard(totalTon.toFixed(0), 'TONELADAS', null, '#40800c', 'Total de toneladas l\u00edquidas transportadas') +
                    kpiCard(qtdClientes, 'FAZENDAS', null, '#7c3aed', 'Quantidade de fazendas/clientes com registros') +
                    kpiCard(qtdVeiculos, 'VE\u00cdCULOS', null, '#d97706', 'Quantidade de ve\u00edculos utilizados') +
                    kpiCard(avgTon.toFixed(1), 'TON/VIAGEM', null, '#059669', 'M\u00e9dia de toneladas por viagem') +
                    (function(){ var m = Object.keys(metas).filter(function(k){return metas[k]}).length; return m ? kpiCard(m, 'FAZ. COM META', null, '#dc2626', 'Fazendas que atingiram a meta estabelecida') : ''; })();
            }

            // ── Race ranking: Cliente (por viagens) ──
            var maxClienteTrips = clienteEntries.length > 0 ? clienteEntries[0].trips : 1;
            var tripMapCliente = {};
            clienteEntries.forEach(function(e) { tripMapCliente[e.label] = e.trips; });
            tortaRenderRaceRankingViagens('torta-ranking-cliente', clienteEntries, maxClienteTrips);

            // ── Donut: Cliente ──
            var clienteDonut = tortaFiltro === 'TODOS' ? consolidateEntries(clienteEntries, 7) : clienteEntries;
            tortaMakeDonut('torta-donut-cliente', 'torta-donut-cliente-legend', clienteDonut, 'Toneladas');

            // ── Race ranking: Veículo ──
            var maxVeiculoTrips = veiculoEntries.length > 0 ? veiculoEntries[0].trips : 1;
            tortaRenderRaceRankingViagens('torta-ranking-veiculo', veiculoEntries, maxVeiculoTrips);

            // ── Donut: Veículo ──
            var veiculoDonut = tortaFiltro === 'TODOS' ? consolidateEntries(veiculoEntries, 7) : veiculoEntries;
            tortaMakeDonut('torta-donut-veiculo', 'torta-donut-veiculo-legend', veiculoDonut, 'Toneladas');

            // ── Evolution (tons per day) ──
            function tortaSortKey(d) {
                var p = d.split(/[\/-]/);
                return p.length === 3 ? (p[0].length === 4 ? p[0]+p[1]+p[2] : p[2]+p[1]+p[0]) : d;
            }
            var evoKeys = Object.keys(evolucao).sort(function(a,b){
                return tortaSortKey(a).localeCompare(tortaSortKey(b));
            });
            var evoValues = evoKeys.map(function(k) { return Math.round(evolucao[k]); });
            // Short labels dd/mm
            var evoLabels = evoKeys.map(function(k) {
                var p = k.split(/[\/-]/);
                return p.length === 3 ? (p[0].length === 4 ? p[2]+'/'+p[1] : p[0]+'/'+p[1]) : k.slice(0,5);
            });
            tortaMakeLineChart('torta-chart-evolucao', evoLabels, evoValues);

            // ── Trips by client bar chart ──
            var tripsEntries = clienteEntries.slice(0, 15);
            var tripsLabels = tripsEntries.map(function(e) { return tortaNomeLimpo(e.label); });
            var tripsValues = tripsEntries.map(function(e) { return e.trips; });
            tortaMakeBarChartViagens('torta-chart-viagens', tripsLabels, tripsValues);

            // ── Tons by client bar chart ──
            var tonEntries = clienteEntries.slice(0, 15).map(function(e) { return { label: e.label, value: e.value, trips: e.trips }; });
            var tonLabels = tonEntries.map(function(e) { return tortaNomeLimpo(e.label); });
            var tonValues = tonEntries.map(function(e) { return Math.round(e.value); });
            tortaMakeBarChartToneladas('torta-chart-toneladas', tonLabels, tonValues);

            // ── Detail table ──
            var tableContainer = document.getElementById('torta-tabela-container');
            if (tableContainer) {
                var desc = totalTrips + ' viagens · ' + qtdClientes + ' fazendas · ' + qtdVeiculos + ' veículos · ' + totalTon.toFixed(0) + ' toneladas';
                var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;"><div class="card-title" style="font-size:15px;">📋 Detalhamento <span style="font-size:12px;font-weight:400;color:var(--text-primary);">— ' + desc + '</span></div><div><input id="torta-search" placeholder="Buscar..." style="padding:8px 14px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:220px;background:var(--bg-card);color:var(--text-primary);" oninput="tortaFiltrarTabela()"></div></div>';
                html += '<div style="overflow-x:auto;"><table class="consumo-tabela" style="font-size:12px;"><thead><tr><th>Data</th><th>Produto</th><th>Fazenda/Cliente</th><th>Placa</th><th>Entrada (kg)</th><th>Saída (kg)</th><th>Líquido (kg)</th><th>Líquido (ton)</th><th>Documento</th></tr></thead><tbody id="torta-tbody">';
                for (var i = 0; i < dados.length; i++) {
                    var d = dados[i];
                    var liquidoTon = tortaParseNum(d.liquido_ton);
                    var dataFmt = (function(d){var p=(d||'').split(/[\/-]/);return p.length===3?(p[0].length===4?p[2]+'/'+p[1]+'/'+p[0]:d):d;})(d.data);
html += '<tr class="torta-row"><td>' + dataFmt + '</td><td style="font-size:10px;color:var(--text-primary);">' + (d.produto || '') + '</td><td style="font-weight:700;color:var(--text-primary);">' + (d.cliente || '') + '</td><td style="font-weight:700;color:var(--text-primary);">' + (d.placa || '') + '</td><td style="color:var(--text-primary);">' + tortaFmtKg(d.entrada_kg) + '</td><td style="color:var(--text-primary);">' + tortaFmtKg(d.saida_kg) + '</td><td style="color:var(--text-primary);">' + tortaFmtKg(d.liquido_kg) + '</td><td style="font-weight:700;color:var(--text-primary);">' + liquidoTon.toFixed(0) + '</td><td style="color:var(--text-primary);">' + (d.documento || '') + '</td></tr>';
                }
                html += '</tbody></table></div>';
                tableContainer.innerHTML = html;
            }

            tortaChartNeedsResize = true;
        }

        var tortaChartNeedsResize = false;

        function tortaFiltrarTabela() {
            var q = (document.getElementById('torta-search').value || '').toLowerCase();
            var rows = document.querySelectorAll('.torta-row');
            for (var i = 0; i < rows.length; i++) {
                rows[i].style.display = rows[i].textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
            }
        }

