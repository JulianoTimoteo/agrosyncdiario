        var biomassaData = [];
        var biomassaFiltro = 'TODOS';
        var biomassaDia = 'TODOS';
        var biomassaModoFiltro = 'DIA';
        var biomassaFiltroPeriodo = 'TODOS';
        try { localStorage.removeItem('biomassaMetaGeral'); } catch(e) {}
        var biomassaCharts = {};

        var BIOMASSA_CORES = ['#40800c','#2563eb','#7c3aed','#d97706','#059669','#dc2626','#0891b2','#ca8a04','#be185d','#1d4ed8','#15803d','#b45309','#6d28d9','#0d9488','#c2410c','#0284c7'];

        function biomassaParseNum(v) {
            if (v == null || v === '') return 0;
            if (typeof v === 'number') return isNaN(v) ? 0 : v;
            var s = String(v).trim().replace(/\./g, '').replace(',', '.');
            var n = parseFloat(s);
            return isNaN(n) ? 0 : n;
        }

        function biomassaLimparData(dia) {
            if (!dia) return '';
            dia = dia.trim();
            if (dia.indexOf('T') >= 0) return dia.split('T')[0];
            if (dia.indexOf(' ') >= 0) return dia.split(' ')[0];
            return dia;
        }

        function processBiomassaData(rows) {
            if (!Array.isArray(rows) || !rows.length) { biomassaData = []; return; }

            var data = [];
            var primeiraLinha = rows[0];
            var isMatrizBruta = Array.isArray(primeiraLinha);
            var isObjArray = !isMatrizBruta && typeof primeiraLinha === 'object' && primeiraLinha !== null;

            if (isObjArray) {
                // Array de objetos (Google Sheets)
                for (var i = 0; i < rows.length; i++) {
                    var obj = rows[i];
                    var mes = String(obj['Mês'] || obj.mes || obj.Mes || obj['MES'] || '').trim();
                    var dia = biomassaLimparData(String(obj['Dia Balança'] || obj['Dia Balanca'] || obj.dia_balanca || obj['Dia'] || obj.data || ''));
                    var fundo = String(obj['Fundo Agricola'] || obj['Fundo Agrícola'] || obj.fundo_agricola || obj.fundo || obj.Fundo || obj.fazenda || obj.Fazenda || '').trim();
                    var os = String(obj['Ordem de Serviço'] || obj.os || obj.OS || obj['O.S.'] || '').trim();
                    var forcaMotriz = String(obj['Força Motriz'] || obj['Forca Motriz'] || obj.forca_motriz || obj.placa || obj.veiculo || '').trim();
                    var dataEntrada = String(obj['Data/Hora Entrada'] || obj.data_entrada || obj['Data Entrada'] || '').trim();
                    var dataSaida = String(obj['Data/Hora Saida'] || obj['Data/Hora Saída'] || obj.data_saida || obj['Data Saida'] || '').trim();
                    var fardos = biomassaParseNum(obj['Fardos'] || obj.fardos);
                    var pesoLiq = biomassaParseNum(obj['Peso Liquido'] || obj['Peso Líquido'] || obj.peso_liquido || obj['Peso']);

                    if (!fundo || (!fardos && !pesoLiq)) continue;

                    data.push({
                        mes: mes,
                        dia_balanca: dia,
                        data: dia || mes,
                        data_entrada: dataEntrada,
                        data_saida: dataSaida,
                        fundo_agricola: fundo,
                        os: os,
                        forca_motriz: forcaMotriz,
                        fardos: fardos || 0,
                        peso_liquido: pesoLiq || 0,
                        peso_ton: pesoLiq || 0
                    });
                }
            } else if (isMatrizBruta && rows.length >= 2) {
                // Matriz com cabeçalho na primeira linha (XLS / processamento posicional)
                for (var i = 1; i < rows.length; i++) {
                    var row = rows[i];
                    if (!Array.isArray(row) || row.length < 3) continue;
                    var mes = String(row[0] || '').trim();
                    var dia = biomassaLimparData(String(row[1] || ''));
                    var fundo = String(row[2] || '').trim();
                    var os = String(row[3] || '').trim();
                    var forcaMotriz = String(row[4] || '').trim();
                    var dataEntrada = String(row[5] || '').trim();
                    var dataSaida = String(row[6] || '').trim();
                    var fardos = biomassaParseNum(row[7]);
                    var pesoLiq = biomassaParseNum(row[8]);

                    if (!fundo || (!fardos && !pesoLiq)) continue;

                    var mesFmt = mes ? biomassaLimparData(mes) : '';

                    data.push({
                        mes: mesFmt,
                        dia_balanca: dia,
                        data: dia || mesFmt,
                        data_entrada: dataEntrada,
                        data_saida: dataSaida,
                        fundo_agricola: fundo,
                        os: os,
                        forca_motriz: forcaMotriz,
                        fardos: fardos || 0,
                        peso_liquido: pesoLiq || 0,
                        peso_ton: pesoLiq || 0
                    });
                }
            } else if (!isMatrizBruta && !isObjArray && rows.length >= 2) {
                // Formato legado: primeira linha é array de cabeçalhos (transposto)
                var header = rows[0];
                for (var i = 1; i < rows.length; i++) {
                    var obj = {};
                    for (var j = 0; j < header.length; j++) { obj[header[j]] = rows[i][j]; }

                    var fundo = String(obj['Fundo Agricola'] || obj['Fundo Agrícola'] || obj.fundo_agricola || obj.fundo || obj.Fundo || obj.fazenda || obj.Fazenda || '').trim();
                    var forcaMotriz = String(obj['Força Motriz'] || obj['Forca Motriz'] || obj.forca_motriz || obj.placa || obj.veiculo || '').trim();
                    var fardos = biomassaParseNum(obj['Fardos'] || obj.fardos);
                    var pesoLiq = biomassaParseNum(obj['Peso Liquido'] || obj['Peso Líquido'] || obj.peso_liquido || obj['Peso']);
                    var dia = biomassaLimparData(String(obj['Dia Balança'] || obj['Dia Balanca'] || obj.dia_balanca || obj['Dia'] || obj.data || ''));
                    var mes = String(obj['Mês'] || obj.mes || obj.Mes || '').trim();
                    var os = String(obj['Ordem de Serviço'] || obj.os || obj.OS || obj['O.S.'] || '').trim();

                    if (!fundo || (!fardos && !pesoLiq)) continue;

                    data.push({
                        mes: mes,
                        dia_balanca: dia,
                        data: dia || mes,
                        data_entrada: String(obj['Data/Hora Entrada'] || obj.data_entrada || obj['Data Entrada'] || '').trim(),
                        data_saida: String(obj['Data/Hora Saida'] || obj['Data/Hora Saída'] || obj.data_saida || obj['Data Saida'] || '').trim(),
                        fundo_agricola: fundo,
                        os: os,
                        forca_motriz: forcaMotriz,
                        fardos: fardos || 0,
                        peso_liquido: pesoLiq || 0,
                        peso_ton: pesoLiq || 0
                    });
                }
            }
            biomassaData = data;
        }

        function biomassaDestroyCharts() {
            for (var k in biomassaCharts) { if (biomassaCharts[k]) { biomassaCharts[k].destroy(); } }
            biomassaCharts = {};
        }

        function setBiomassaModo(modo) {
            biomassaModoFiltro = modo;
            biomassaFiltroPeriodo = 'TODOS';
            document.querySelectorAll('#biomassa-filtro-modo .bm-periodo-chip').forEach(function(b) { b.classList.remove('active'); });
            var btn = document.querySelector('#biomassa-filtro-modo .bm-periodo-chip[data-modo="' + modo + '"]');
            if (btn) btn.classList.add('active');
            renderBiomassa();
        }

        function biomassaSetPeriodo(valor) {
            biomassaFiltroPeriodo = valor;
            renderBiomassa();
        }

        function setBiomassaFiltro(valor) {
            biomassaFiltro = valor;
            document.querySelectorAll('#biomassa-client-chips .consumo-chip, #biomassa-chip-todos').forEach(function(b) { b.classList.remove('active'); });
            if (valor === 'TODOS') {
                document.getElementById('biomassa-chip-todos').classList.add('active');
            } else {
                var btn = document.querySelector('#biomassa-client-chips .consumo-chip[data-cliente="' + valor.replace(/"/g, '') + '"]');
                if (btn) btn.classList.add('active');
            }
            renderBiomassa();
        }

        function biomassaFiltrarDados() {
            var d = biomassaFiltrarDadosPeriodo();
            if (biomassaFiltro !== 'TODOS') d = d.filter(function(r) { return (r.fundo_agricola || '') === biomassaFiltro; });
            return d;
        }

        function biomassaRenderSubfiltro() {
            var container = document.getElementById('biomassa-subfiltro');
            if (!container) return;
            if (biomassaModoFiltro === 'TODOS') { container.innerHTML = ''; return; }

            var periodos = {};
            for (var i = 0; i < biomassaData.length; i++) {
                var d = biomassaData[i].data;
                if (!d) continue;
                var key = d;
                if (biomassaModoFiltro === 'MES') {
                    var parts = d.split(/[\/-]/);
                    if (parts.length === 3) key = parts[0].length === 4 ? parts[0]+'-'+parts[1] : parts[2]+'-'+parts[1];
                } else if (biomassaModoFiltro === 'SEMANA') {
                    var dt = new Date(d + 'T12:00:00');
                    if (!isNaN(dt.getTime())) {
                        var day = dt.getDay() || 7;
                        var monday = new Date(dt);
                        monday.setDate(dt.getDate() - day + 1);
                        key = monday.toISOString().split('T')[0];
                    }
                }
                if (key) periodos[key] = (periodos[key] || 0) + 1;
            }

            var keys = Object.keys(periodos).sort().reverse();
            if (biomassaFiltroPeriodo === 'TODOS' && keys.length > 0) biomassaFiltroPeriodo = keys[0];

            var html = '';
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                var label = k;
                if (biomassaModoFiltro === 'MES') {
                    var p = k.split('-');
                    if (p.length === 2) { var meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']; label = meses[parseInt(p[1],10)-1] + '/' + p[0]; }
                } else if (biomassaModoFiltro === 'SEMANA') {
                    var dt = new Date(k + 'T12:00:00');
                    if (!isNaN(dt.getTime())) { var inicio = (dt.getDate()).toString().padStart(2,'0')+'/'+(dt.getMonth()+1).toString().padStart(2,'0'); label = 'Sem ' + inicio; }
                } else {
                    label = typeof formatarDataISO === 'function' ? formatarDataISO(k) : k;
                }
                var cnt = periodos[k];
                html += '<button class="consumo-chip' + (biomassaFiltroPeriodo === k ? ' active' : '') + '" onclick="biomassaSetPeriodo(\'' + k + '\')">' + label + ' <span style="font-weight:400;opacity:0.6;">(' + cnt + ')</span></button>';
            }
            container.innerHTML = html;
        }

        function biomassaFiltrarDadosPeriodo() {
            var d = biomassaData;
            if (biomassaModoFiltro !== 'TODOS' && biomassaFiltroPeriodo !== 'TODOS') {
                d = d.filter(function(r) {
                    var data = r.data || '';
                    if (biomassaModoFiltro === 'DIA') return data === biomassaFiltroPeriodo;
                    if (biomassaModoFiltro === 'SEMANA') {
                        var dt = new Date(data + 'T12:00:00');
                        if (isNaN(dt.getTime())) return false;
                        var day = dt.getDay() || 7;
                        var monday = new Date(dt);
                        monday.setDate(dt.getDate() - day + 1);
                        return monday.toISOString().split('T')[0] === biomassaFiltroPeriodo;
                    }
                    if (biomassaModoFiltro === 'MES') {
                        var parts = data.split(/[\/-]/);
                        if (parts.length === 3) {
                            var mk = parts[0].length === 4 ? parts[0]+'-'+parts[1] : parts[2]+'-'+parts[1];
                            return mk === biomassaFiltroPeriodo;
                        }
                        return false;
                    }
                    return true;
                });
            }
            return d;
        }

        function biomassaRenderClientChips() {
            var container = document.getElementById('biomassa-client-chips');
            if (!container) return;
            var dadosFiltrados = biomassaFiltrarDadosPeriodo();
            var clientes = {};
            for (var i = 0; i < dadosFiltrados.length; i++) {
                var c = dadosFiltrados[i].fundo_agricola;
                if (c && c.trim()) clientes[c] = (clientes[c] || 0) + 1;
            }
            var keys = Object.keys(clientes).sort();
            var html = '';
            for (var j = 0; j < keys.length; j++) {
                html += '<button class="consumo-chip' + (biomassaFiltro === keys[j] ? ' active' : '') + '" data-cliente="' + keys[j] + '" onclick="setBiomassaFiltro(\'' + keys[j].replace(/'/g, "\\'") + '\')">' + keys[j] + ' <span style="font-weight:400;opacity:0.6;">(' + clientes[keys[j]] + ' reg)</span></button>';
            }
            container.innerHTML = html;
        }

        function biomassaNomeLimpo(label) {
            var m = String(label).match(/^\d+\s*-\s*(.+)/);
            return m ? m[1].trim() : label;
        }

        // ── Race ranking (by fardos) ──
        function biomassaRenderRankingFardos(containerId, entries, maxFardos) {
            var container = document.getElementById(containerId);
            if (!container) return;
            if (!entries || !entries.length) {
                container.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;">Sem dados</div>';
                return;
            }
            var max = maxFardos || entries[0].fardos || 1;
            if (max <= 0) max = 1;
            var html = '';
            var medalhas = ['🥇','🥈','🥉'];
            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                var cor = BIOMASSA_CORES[i % BIOMASSA_CORES.length];
                var rank = i < 3 ? medalhas[i] : (i + 1);
                var pct = (e.fardos / max) * 100;
                html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px 8px;border-radius:8px;background:#f8fafc;">' +
                    '<span style="min-width:24px;text-align:center;font-size:14px;">' + rank + '</span>' +
                    '<span style="flex:0 0 auto;font-weight:700;font-size:12px;color:#1e293b;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;" title="' + e.label + '">' + biomassaNomeLimpo(e.label) + '</span>' +
                    '<span style="flex:1;height:20px;background:#e2e8f0;border-radius:10px;overflow:hidden;position:relative;">' +
                        '<span style="display:block;height:100%;width:' + pct + '%;background:' + cor + ';border-radius:10px;transition:width 0.6s ease;"></span>' +
                    '</span>' +
                    '<span style="flex:0 0 auto;font-weight:900;font-size:16px;color:' + cor + ';min-width:50px;text-align:right;">' + e.fardos.toFixed(0) + ' fardos</span>' +
                    '<span style="flex:0 0 auto;font-size:11px;color:#000;min-width:56px;text-align:right;">' + e.value.toFixed(0) + 't</span>' +
                '</div>';
            }
            container.innerHTML = html;
        }

        function biomassaMakeBarChart(canvasId, labels, values, cor) {
            var canvas = document.getElementById(canvasId);
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            biomassaCharts[canvasId] = new Chart(ctx, {
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
                        tooltip: { callbacks: { label: function(tt) { return tt.parsed + ' fardos'; } } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { stepSize: 1, font: { size: 10 } } },
                        y: { grid: { display: false }, ticks: { font: { size: 10 } } }
                    }
                }
            });
        }

        // ── Main render ──
        function renderBiomassa() {
            if (biomassaData.length === 0) {
                var container = document.getElementById('main-biomassa');
                if (container) container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#94a3b8;"><h2>🌿 Nenhum dado de Biomassa disponível</h2><p style="margin-top:8px;">Carregue o arquivo Biomassa.xlsx ou ative o modo Online.</p></div>';
                return;
            }

            biomassaDestroyCharts();
            biomassaRenderSubfiltro();
            var dados = biomassaFiltrarDados();
            biomassaRenderClientChips();

            if (dados.length === 0) {
                var kpisDiv2 = document.getElementById('biomassa-kpis');
                if (kpisDiv2) kpisDiv2.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:#94a3b8;font-weight:700;">Nenhum registro para o filtro selecionado.</div>';
                return;
            }

            var aggFundo = {};
            var aggVeiculo = {};
            var evolucao = {};
            var permanenciaDados = [];

            // Check unique days to decide aggregation level
            var diasUnicos = {};
            for (var i = 0; i < dados.length; i++) { diasUnicos[dados[i].data || 'SEM DATA'] = 1; }
            var usarAgregacaoMensal = (biomassaModoFiltro === 'TODOS' || Object.keys(diasUnicos).length > 60);

            for (var i = 0; i < dados.length; i++) {
                var d = dados[i];
                var fundo = d.fundo_agricola && d.fundo_agricola.trim() ? d.fundo_agricola : 'SEM FUNDO';
                var veic = d.forca_motriz && d.forca_motriz.trim() ? d.forca_motriz : 'SEM VEÍCULO';
                var fardos = biomassaParseNum(d.fardos);
                var ton = biomassaParseNum(d.peso_ton);
                var data = d.data || 'SEM DATA';

                if (!aggFundo[fundo]) aggFundo[fundo] = { fardos: 0, ton: 0 };
                aggFundo[fundo].fardos += fardos;
                aggFundo[fundo].ton += ton;

                if (!aggVeiculo[veic]) aggVeiculo[veic] = { fardos: 0, ton: 0 };
                aggVeiculo[veic].fardos += fardos;
                aggVeiculo[veic].ton += ton;

                // Aggregate by month when period is large
                var evoKey = data;
                if (usarAgregacaoMensal) {
                    var ep = data.split(/[\/-]/);
                    if (ep.length === 3) evoKey = ep[0].length === 4 ? ep[0]+'-'+ep[1] : ep[2]+'-'+ep[1];
                }
                evolucao[evoKey] = (evolucao[evoKey] || 0) + ton;

                // Coletar dados de permanência
                if (d.data_entrada && d.data_saida) {
                    var h = calcularPermanencia(d.data_entrada, d.data_saida);
                    if (h !== null) permanenciaDados.push(h);
                }
            }

            function sortByFardos(obj) {
                return Object.keys(obj).map(function(k) { return { label: k, fardos: obj[k].fardos, value: obj[k].ton }; }).sort(function(a, b) { return b.fardos - a.fardos; });
            }
            var fundoEntries = sortByFardos(aggFundo);
            var veiculoEntries = sortByFardos(aggVeiculo);

            var totalFardos = fundoEntries.reduce(function(s, e) { return s + e.fardos; }, 0);
            var totalTon = fundoEntries.reduce(function(s, e) { return s + e.value; }, 0);
            var totalReg = dados.length;
            var qtdFundos = fundoEntries.length;
            var qtdVeiculos = veiculoEntries.length;
            var avgFardos = totalReg > 0 ? (totalFardos / totalReg) : 0;
            var periodoLabel = 'Todo Período';
            if (biomassaModoFiltro === 'DIA' && biomassaFiltroPeriodo !== 'TODOS') {
                var p = biomassaFiltroPeriodo.split(/[\/-]/);
                periodoLabel = p.length === 3 ? (p[0].length === 4 ? p[2]+'/'+p[1]+'/'+p[0] : biomassaFiltroPeriodo) : biomassaFiltroPeriodo;
            } else if (biomassaModoFiltro === 'SEMANA') {
                periodoLabel = 'Semana';
            } else if (biomassaModoFiltro === 'MES') {
                periodoLabel = 'Mês';
            }

            var permMedia = permanenciaDados.length > 0 ? permanenciaDados.reduce(function(s,v){return s+v;},0) / permanenciaDados.length : 0;
            var permMax = permanenciaDados.length > 0 ? permanenciaDados.reduce(function(m,v){return Math.max(m,v);},0) : 0;

            var kpisDiv = document.getElementById('biomassa-kpis');
            if (kpisDiv) {
                function kpiCard(val, label, sub, accent, tip) {
                    return '<div class="biomassa-kpi-card"><div class="kpi-accent" style="background:' + accent + ';"></div><div class="kpi-val">' + val + '</div><div class="kpi-lbl">' + label + '</div>' + (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '<span class="kpi-tooltip">' + tip + '</span></div>';
                }
                kpisDiv.innerHTML =
                    kpiCard(totalReg, 'REGISTROS', periodoLabel, '#2563eb', 'Total de registros de biomassa') +
                    kpiCard(totalFardos.toFixed(0), 'FARDOS', null, '#40800c', 'Total de fardos processados') +
                    kpiCard(totalTon.toFixed(0), 'TONELADAS', null, '#7c3aed', 'Peso líquido total em toneladas') +
                    kpiCard(qtdFundos, 'FUNDOS AGRÍCOLAS', null, '#d97706', 'Quantidade de fundos agrícolas') +
                    kpiCard(qtdVeiculos, 'VEÍCULOS', null, '#059669', 'Quantidade de forças motrizes') +
                    kpiCard(avgFardos.toFixed(1), 'FARDOS/REGISTRO', null, '#dc2626', 'Média de fardos por registro') +
                    (permanenciaDados.length > 0 ? kpiCard(permMedia.toFixed(1)+'h', 'PERMANÊNCIA MÉDIA', 'Máx: '+permMax.toFixed(1)+'h', '#0891b2', 'Tempo médio entre Data/Hora Entrada e Saída') : '');
            }

            var maxFardoFundo = fundoEntries.length > 0 ? fundoEntries[0].fardos : 1;
            biomassaRenderRankingFardos('biomassa-ranking-fundo', fundoEntries, maxFardoFundo);

            var maxFardoVeic = veiculoEntries.length > 0 ? veiculoEntries[0].fardos : 1;
            biomassaRenderRankingFardos('biomassa-ranking-veiculo', veiculoEntries, maxFardoVeic);

            var fundoDonut = biomassaFiltro === 'TODOS' ? (fundoEntries.length > 10 ? fundoEntries.slice(0, 9).concat([{ label: 'Outros', fardos: fundoEntries.slice(9).reduce(function(s,x){return s+x.fardos;},0), value: fundoEntries.slice(9).reduce(function(s,x){return s+x.value;},0) }]) : fundoEntries) : fundoEntries;
            biomassaMakeDonut('biomassa-donut-fundo', 'biomassa-donut-fundo-legend', fundoDonut, 'Toneladas');

            var veiculoDonut = biomassaFiltro === 'TODOS' ? (veiculoEntries.length > 10 ? veiculoEntries.slice(0, 9).concat([{ label: 'Outros', fardos: veiculoEntries.slice(9).reduce(function(s,x){return s+x.fardos;},0), value: veiculoEntries.slice(9).reduce(function(s,x){return s+x.value;},0) }]) : veiculoEntries) : veiculoEntries;
            biomassaMakeDonut('biomassa-donut-veiculo', 'biomassa-donut-veiculo-legend', veiculoDonut, 'Toneladas');

            function biomassaSortKey(d) {
                var p = d.split(/[\/-]/);
                return p.length === 3 ? (p[0].length === 4 ? p[0]+p[1]+p[2] : p[2]+p[1]+p[0]) : d;
            }
            var evoKeys = Object.keys(evolucao).sort(function(a,b){
                return biomassaSortKey(a).localeCompare(biomassaSortKey(b));
            });
            var evoValues = evoKeys.map(function(k) { return Math.round(evolucao[k]); });
            var evoLabels = evoKeys.map(function(k) {
                var p = k.split(/[\/-]/);
                return p.length === 3 ? (p[0].length === 4 ? p[2]+'/'+p[1] : p[0]+'/'+p[1]) : k.slice(0,5);
            });
            biomassaMakeLineChart('biomassa-chart-evolucao', evoLabels, evoValues);

            var fardosEntries = fundoEntries.slice(0, 15).map(function(e) { return { label: e.label, fardos: e.fardos, value: e.value }; });
            var fardosLabels = fardosEntries.map(function(e) { return biomassaNomeLimpo(e.label); });
            var fardosValues = fardosEntries.map(function(e) { return e.fardos; });
            biomassaMakeBarChartFardos('biomassa-chart-fardos', fardosLabels, fardosValues);

            var tonEntries = fundoEntries.slice(0, 15).map(function(e) { return { label: e.label, value: e.value }; });
            var tonLabels = tonEntries.map(function(e) { return biomassaNomeLimpo(e.label); });
            var tonValues = tonEntries.map(function(e) { return Math.round(e.value); });
            biomassaMakeBarChartToneladas('biomassa-chart-toneladas', tonLabels, tonValues);

            var tableContainer = document.getElementById('biomassa-tabela-container');
            if (tableContainer) {
                var desc = totalReg + ' registros · ' + qtdFundos + ' fundos · ' + qtdVeiculos + ' veículos · ' + totalTon.toFixed(0) + ' toneladas · ' + totalFardos.toFixed(0) + ' fardos';
                var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;"><div class="card-title" style="font-size:15px;">📋 Detalhamento <span style="font-size:12px;font-weight:400;color:var(--text-primary);">— ' + desc + '</span></div><div><input id="biomassa-search" placeholder="Buscar..." style="padding:8px 14px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:220px;background:var(--bg-card);color:var(--text-primary);" oninput="biomassaFiltrarTabela()"></div></div>';
                html += '<div style="overflow-x:auto;"><table class="consumo-tabela" style="font-size:12px;"><thead><tr><th>Mês</th><th>Dia Balança</th><th>Fundo Agrícola</th><th>OS</th><th>Força Motriz</th><th>Data Entrada</th><th>Data Saída</th><th>Fardos</th><th>Peso Líquido (ton)</th></tr></thead><tbody id="biomassa-tbody">';
                for (var i = 0; i < dados.length; i++) {
                    var d = dados[i];
                    html += '<tr class="biomassa-row"><td>' + (d.mes || '') + '</td><td>' + (d.dia_balanca || '') + '</td><td style="font-weight:700;color:var(--text-primary);">' + (d.fundo_agricola || '') + '</td><td>' + (d.os || '') + '</td><td style="font-weight:700;color:var(--text-primary);">' + (d.forca_motriz || '') + '</td><td>' + (d.data_entrada || '') + '</td><td>' + (d.data_saida || '') + '</td><td style="font-weight:800;color:#40800c;">' + d.fardos.toFixed(0) + '</td><td style="font-weight:800;color:#7c3aed;">' + d.peso_liquido.toFixed(1) + '</td></tr>';
                }
                html += '</tbody></table></div>';
                tableContainer.innerHTML = html;
            }

            // Floating button + modal for bottleneck analysis
            var biomassaFloatingHTML =
                '<div id="biomassa-gargalo-fab" data-biomassa-only style="position:fixed;bottom:24px;right:24px;z-index:9999;cursor:pointer;" onclick="biomassaAbrirGargalo()">' +
                    '<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 8px 24px rgba(220,38,38,0.4);transition:transform 0.2s;border:none;" onmouseover="this.style.transform=\'scale(1.1)\'" onmouseout="this.style.transform=\'scale(1)\'">🔍</div>' +
                '</div>' +
                '<div id="biomassa-gargalo-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;" onclick="if(event.target===this)biomassaFecharGargalo()">' +
                    '<div style="background:var(--bg-card,#fff);border-radius:16px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);position:relative;">' +
                        '<button style="position:absolute;top:12px;right:16px;font-size:28px;border:none;background:none;cursor:pointer;color:var(--text-primary,#333);line-height:1;" onclick="biomassaFecharGargalo()">&times;</button>' +
                        '<h2 style="font-size:20px;margin:0 0 4px 0;color:var(--text-primary,#333);">🔍 Análise de Gargalo — Biomassa</h2>' +
                        '<p style="font-size:12px;color:#64748b;margin-bottom:16px;">Indicadores de permanência e produtividade</p>' +
                        '<div id="biomassa-gargalo-content" style="font-size:14px;color:var(--text-primary,#333);">Carregando...</div>' +
                    '</div>' +
                '</div>';
            var existingFab = document.getElementById('biomassa-gargalo-fab');
            if (!existingFab) {
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = biomassaFloatingHTML;
                document.body.appendChild(tempDiv.firstElementChild);
                document.body.appendChild(tempDiv.lastElementChild);
                var biomassaTab = document.getElementById('main-biomassa');
                if (!biomassaTab || !biomassaTab.classList.contains('active')) {
                    var fab = document.getElementById('biomassa-gargalo-fab');
                    if (fab) fab.style.display = 'none';
                }
            }
            biomassaAtualizarGargalo(dados, totalFardos, totalTon, permanenciaDados, permMedia, permMax);

            biomassaChartNeedsResize = true;
        }

        var biomassaChartNeedsResize = false;

        function biomassaFiltrarTabela() {
            var q = (document.getElementById('biomassa-search').value || '').toLowerCase();
            var rows = document.querySelectorAll('.biomassa-row');
            for (var i = 0; i < rows.length; i++) {
                rows[i].style.display = rows[i].textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
            }
        }

        function calcularPermanencia(entrada, saida) {
            if (!entrada || !saida) return null;
            var e = new Date(entrada);
            var s = new Date(saida);
            if (isNaN(e.getTime()) || isNaN(s.getTime())) return null;
            var diffMs = s.getTime() - e.getTime();
            if (diffMs <= 0) return 0;
            return diffMs / (1000 * 60 * 60);
        }

        function biomassaAbrirGargalo() {
            var modal = document.getElementById('biomassa-gargalo-modal');
            if (modal) modal.style.display = 'flex';
        }

        function biomassaFecharGargalo() {
            var modal = document.getElementById('biomassa-gargalo-modal');
            if (modal) modal.style.display = 'none';
        }

        function biomassaAtualizarGargalo(dados, totalFardos, totalTon, permanenciaDados, permMedia, permMax) {
            var container = document.getElementById('biomassa-gargalo-content');
            if (!container) return;

            // Top dias com mais fardos (gargalos)
            var diasAgg = {};
            for (var i = 0; i < dados.length; i++) {
                var d = dados[i];
                var dia = d.data || 'SEM DATA';
                if (!diasAgg[dia]) diasAgg[dia] = { fardos: 0, ton: 0, reg: 0 };
                diasAgg[dia].fardos += biomassaParseNum(d.fardos);
                diasAgg[dia].ton += biomassaParseNum(d.peso_ton);
                diasAgg[dia].reg++;
            }
            var topDias = Object.keys(diasAgg).map(function(k) {
                return { dia: k, fardos: diasAgg[k].fardos, ton: diasAgg[k].ton, reg: diasAgg[k].reg };
            }).sort(function(a,b){ return b.fardos - a.fardos; }).slice(0, 10);

            // Top veículos com maior permanência
            var veicPerm = {};
            for (var i = 0; i < dados.length; i++) {
                var d = dados[i];
                var veic = d.forca_motriz && d.forca_motriz.trim() ? d.forca_motriz : 'SEM VEÍCULO';
                var h = calcularPermanencia(d.data_entrada, d.data_saida);
                if (h !== null) {
                    if (!veicPerm[veic]) veicPerm[veic] = { total: 0, count: 0 };
                    veicPerm[veic].total += h;
                    veicPerm[veic].count++;
                }
            }
            var topPerm = Object.keys(veicPerm).map(function(k) {
                return { veiculo: k, media: veicPerm[k].total / veicPerm[k].count, count: veicPerm[k].count };
            }).sort(function(a,b){ return b.media - a.media; }).slice(0, 5);

            var permPct = permanenciaDados.length > 0 && dados.length > 0 ? (permanenciaDados.length / dados.length * 100).toFixed(0) : 0;

            var html = '';
            html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">';
            html += '<div style="background:#fef2f2;border-radius:12px;padding:16px;border:1px solid #fecaca;"><div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#dc2626;letter-spacing:0.5px;">Permanência Média</div><div style="font-size:28px;font-weight:900;color:#991b1b;margin:4px 0;">' + permMedia.toFixed(1) + 'h</div><div style="font-size:11px;color:#b91c1c;">Máxima: ' + permMax.toFixed(1) + 'h</div></div>';
            html += '<div style="background:#f0fdf4;border-radius:12px;padding:16px;border:1px solid #bbf7d0;"><div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#15803d;letter-spacing:0.5px;">Registros c/ Permanência</div><div style="font-size:28px;font-weight:900;color:#166534;margin:4px 0;">' + permanenciaDados.length + '</div><div style="font-size:11px;color:#166534;">de ' + dados.length + ' registros (' + permPct + '%)</div></div>';
            html += '</div>';

            // Top dias gargalo
            html += '<h3 style="font-size:14px;font-weight:800;margin:16px 0 8px 0;color:var(--text-primary,#333);">📅 Top 10 Dias com Maior Volume</h3>';
            html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
            html += '<thead><tr style="background:#f1f5f9;"><th style="padding:8px 10px;text-align:left;font-weight:700;">#</th><th style="padding:8px 10px;text-align:left;font-weight:700;">Dia</th><th style="padding:8px 10px;text-align:right;font-weight:700;">Fardos</th><th style="padding:8px 10px;text-align:right;font-weight:700;">Toneladas</th><th style="padding:8px 10px;text-align:right;font-weight:700;">Registros</th></tr></thead><tbody>';
            for (var i = 0; i < topDias.length; i++) {
                var td = topDias[i];
                html += '<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 10px;font-weight:700;">' + (i+1) + '</td><td style="padding:6px 10px;">' + (typeof formatarDataISO === 'function' ? formatarDataISO(td.dia) : td.dia) + '</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#40800c;">' + td.fardos.toFixed(0) + '</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#7c3aed;">' + td.ton.toFixed(0) + 't</td><td style="padding:6px 10px;text-align:right;">' + td.reg + '</td></tr>';
            }
            html += '</tbody></table></div>';

            // Top veículos com maior permanência
            if (topPerm.length > 0) {
                html += '<h3 style="font-size:14px;font-weight:800;margin:16px 0 8px 0;color:var(--text-primary,#333);">🚛 Top 5 Veículos — Maior Permanência Média</h3>';
                html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
                html += '<thead><tr style="background:#f1f5f9;"><th style="padding:8px 10px;text-align:left;font-weight:700;">#</th><th style="padding:8px 10px;text-align:left;font-weight:700;">Veículo</th><th style="padding:8px 10px;text-align:right;font-weight:700;">Média (h)</th><th style="padding:8px 10px;text-align:right;font-weight:700;">Registros</th></tr></thead><tbody>';
                for (var i = 0; i < topPerm.length; i++) {
                    var tp = topPerm[i];
                    html += '<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:6px 10px;font-weight:700;">' + (i+1) + '</td><td style="padding:6px 10px;">' + tp.veiculo + '</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#dc2626;">' + tp.media.toFixed(1) + 'h</td><td style="padding:6px 10px;text-align:right;">' + tp.count + '</td></tr>';
                }
                html += '</tbody></table></div>';
            }

            html += '<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;font-size:11px;color:#64748b;text-align:center;">📊 Total: ' + totalFardos.toFixed(0) + ' fardos · ' + totalTon.toFixed(0) + ' toneladas · ' + dados.length + ' registros</div>';

            container.innerHTML = html;
        }

        async function processBiomassaFiles(biomassaFile) {
            if (!biomassaFile) { biomassaData = []; renderBiomassa(); return; }
            try {
                const json = await readXlsxFile(biomassaFile, true);
                processBiomassaData(json);
            } catch (err) {
                console.warn('BIOMASSA: falha ao ler:', err);
                biomassaData = [];
            }
            const aba = document.getElementById('main-biomassa');
            if (aba && aba.classList.contains('active')) renderBiomassa();
        }

        function biomassaMakeDonut(canvasId, legendId, entries, label) {
            var canvas = document.getElementById(canvasId);
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            if (!entries || !entries.length) { biomassaCharts[canvasId] = null; return; }
            var isDark = document.body.classList.contains('dark-theme');
            var textColor = isDark ? '#fff' : '#000';
            var labels = entries.map(function(e) { return biomassaNomeLimpo(e.label); });
            var values = entries.map(function(e) { return e.value; });
            var total = values.reduce(function(a,b){return a+b}, 0) || 1;
            var bgColors = entries.map(function(_, i) { return BIOMASSA_CORES[i % BIOMASSA_CORES.length]; });
            biomassaCharts[canvasId] = new Chart(ctx, {
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

        function biomassaMakeLineChart(canvasId, labels, values) {
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
            biomassaCharts[canvasId] = new Chart(ctx, {
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
                        tooltip: { backgroundColor: tooltipBg, callbacks: { label: function(tt) { return tt.parsed.toFixed(0) + 't'; } } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: tc } },
                        y: { grid: { color: gridCol }, ticks: { font: { size: 9 }, color: tc, callback: function(v) { return v >= 0 ? Math.round(v) + 't' : ''; } } }
                    }
                }
            });
        }

        function biomassaMakeBarChartFardos(canvasId, labels, values) {
            var canvas = document.getElementById(canvasId);
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            biomassaCharts[canvasId] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Fardos',
                        data: values,
                        backgroundColor: labels.map(function(_, i) { return BIOMASSA_CORES[i % BIOMASSA_CORES.length]; }),
                        borderWidth: 0,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: function(tt) { return tt.parsed + ' fardos'; } } }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#000', maxRotation: 45 } },
                        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 }, color: '#000', stepSize: 1 } }
                    }
                }
            });
        }

        function biomassaMakeBarChartToneladas(canvasId, labels, values) {
            var canvas = document.getElementById(canvasId);
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            var isDark = document.body.classList.contains('dark-theme');
            var tc = isDark ? '#fff' : '#000';
            var gridCol = isDark ? '#334155' : '#f1f5f9';
            var tooltipBg = isDark ? '#334155' : '#1e293b';
            biomassaCharts[canvasId] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Toneladas',
                        data: values,
                        backgroundColor: labels.map(function(_, i) { return BIOMASSA_CORES[i % BIOMASSA_CORES.length]; }),
                        borderWidth: 0,
                        borderRadius: 6
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
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: tc, maxRotation: 45 } },
                        y: { grid: { color: gridCol }, ticks: { font: { size: 9 }, color: tc } }
                    }
                }
            });
        }
