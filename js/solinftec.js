        function processSolinftecData(rows) {
            solinftecData = { frentes: {}, totais: { PRODUTIVO: 0, IMPRODUTIVO: 0, MANUTENCAO: 0 } };
            solinftecPeriodo = '';
            solinftecFrotaAtividades = [];

            let isMatriz = Array.isArray(rows) && rows.length && Array.isArray(rows[0]);
            console.log('[Solinftec] Iniciando | modo:', isMatriz ? 'matriz' : 'objeto', '| linhas:', Array.isArray(rows) ? rows.length : 0);

            if (!isMatriz && Array.isArray(rows) && rows.length && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
                const keys = Object.keys(rows[0]);
                if (keys.length && keys.every(k => /^\d+$/.test(k))) {
                    rows = rows.map(r => {
                        if (!r || typeof r !== 'object' || Array.isArray(r)) return [];
                        return keys.sort((a, b) => a - b).map(k => r[k] ?? '');
                    });
                    isMatriz = Array.isArray(rows) && rows.length && Array.isArray(rows[0]);
                    console.log('[Solinftec] Corrigido chaves numericas -> modo:', isMatriz ? 'matriz' : 'objeto');
                }
            }

            if (Array.isArray(rows) && rows.length) {
                const txt = JSON.stringify(rows.slice(0, 15));
                const m = txt.match(/Periodo:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})\s+[0-9]{1,2}:[0-9]{2}\s+a\s+([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/);
                if (m) solinftecPeriodo = m[1] + ' a ' + m[2];
            }

            // Detectar se é array de arrays (sheet_to_json header:1) ou array de objetos
            let dadosObj = [];

            if (isMatriz) {
                // Primeira linha = cabeçalhos
                const header = rows[0].map(h => String(h || '').trim());
                // Mapear colunas por nome (insensível a acento/caso)
                function findCol(keywords) {
                    const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').trim();
                    for (let i = 0; i < header.length; i++) {
                        const h = norm(header[i]);
                        if (keywords.some(k => h.includes(norm(k)))) return i;
                    }
                    return -1;
                }
                const iCorp    = findCol(['corporativo']);
                const iRegion  = findCol(['regional']);
                const iUnidade = findCol(['unidade']);
                const iFrota   = findCol(['frota', 'equipamento', 'cod. equipamento', 'cod equipamento', 'cod.maquina', 'cod maquina']);
                const iDescFrota = findCol(['descricao da frota','descrição da frota','desc frota','desc. frota', 'desc.equipamento', 'desc equipamento', 'desc.maquina', 'desc maquina']);
                const iData    = findCol(['data', 'data/hora local', 'data/hora', 'datahora']);
                const iCodOp   = findCol(['codigo de operacao','código de operação','cod operacao','cod op', 'cod.operacao', 'cod operacao']);
                const iDescOp  = findCol(['descricao da operacao','descrição da operação','desc operacao','desc op', 'desc.operacao', 'desc operacao']);
                const iSeg     = findCol(['segundos', 'hrs operacionais(sec)', 'hrs operacionais sec', 'hrs_operacionais_sec']);
                const iGrupo   = findCol(['grupo equipamento', 'grupo_equipamento', 'grupoequipamento', 'grp equipamento']);

                for (let i = 1; i < rows.length; i++) {
                    const r = rows[i];
                    if (!r || !r.length) continue;
                    const parseTempo = (val) => {
                        if (typeof val === 'number') return val;
                        const s = String(val).trim();
                        if (!s) return 0;
                        if (/^\d+$/.test(s)) return parseInt(s, 10);
                        const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
                        if (!m) return 0;
                        const h = parseInt(m[1], 10), min = parseInt(m[2], 10), sec = parseInt(m[3] || '0', 10);
                        return h * 3600 + min * 60 + sec;
                    };
                    dadosObj.push({
                        Frota:       String(r[iFrota]  ?? '').trim(),
                        DescFrota:   String(r[iDescFrota] ?? '').trim(),
                        Data:        String(r[iData]   ?? '').trim(),
                        Operação:    String(r[iCodOp]  ?? '').trim(),
                        'Descrição da Operação': String(r[iDescOp] ?? '').trim(),
                        Segundos:    parseTempo(r[iSeg] ?? 0),
                        Unidade:     String(r[iUnidade] ?? '').trim(),
                        _grupoEquip: String(r[iGrupo]  ?? '').trim(),
                    });
                }
            } else {
                // Já são objetos — normalizar chaves
                const normKey = k => String(k||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'').trim();
                dadosObj = rows.map(r => {
                    const keyMap = {};
                    if (r && typeof r === 'object') {
                        Object.keys(r).forEach(k => { keyMap[normKey(k)] = r[k]; });
                    }
                    const get = (...keys) => {
                        for (const k of keys) {
                            const nk = normKey(k);
                            if (keyMap[nk] !== undefined && keyMap[nk] !== null) return keyMap[nk];
                        }
                        return '';
                    };
                    const parseTempo = (val) => {
                        if (typeof val === 'number') return val;
                        const s = String(val).trim();
                        if (!s) return 0;
                        if (/^\d+$/.test(s)) return parseInt(s, 10);
                        const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
                        if (!m) return 0;
                        const h = parseInt(m[1], 10), min = parseInt(m[2], 10), sec = parseInt(m[3] || '0', 10);
                        return h * 3600 + min * 60 + sec;
                    };
                    const segundos = get('Segundos','segundos','HRS OPERACIONAIS(SEC)','HRS_OPERACIONAIS_SEC','hrs_operacionais_sec','HRS OPERACIONAIS(SEC)','hrs_operacionais_sec');
                    return {
                        Frota:       String(get('Frota','frota','COD. EQUIPAMENTO','Cod. Equipamento','COD EQUIPAMENTO','Equipamento','equipamento','COD_EQUIPAMENTO') || '').trim(),
                        DescFrota:   String(get('Descrição da Frota','Descricao da Frota','desc_frota','DESC.EQUIPAMENTO','Desc. Equipamento','Desc Equipamento','DESC. MAQUINA','Desc. Maquina','DESC_EQUIPAMENTO') || '').trim(),
                        Data:        String(get('Data','data','DATA/HORA LOCAL','Data/Hora Local','datahora','DATA/HORA','DATA_HORA_LOCAL') || '').trim(),
                        Operação:    String(get('Código de Operação','Codigo de Operacao','Operação','Operacao','COD. OPERACAO','Cod. Operacao','op_code','COD_OPERACAO','COD.OPERACAO') || '').trim(),
                        'Descrição da Operação': String(get('Descrição da Operação','Descricao da Operacao','Operação Desc','DESC.OPERAÇÃO','Desc. Operacao','DESC. OPERACAO','DESC.OPERACAO','DESC_OPERACAO') || '').trim(),
                        Segundos:    parseTempo(segundos),
                        Unidade:     String(get('Unidade','unidade') || '').trim(),
                        _frenteDireta: String(get('Frente','frente') || '').trim(),
                        _grupoEquip:  String(get('GRUPO EQUIPAMENTO','Grupo Equipamento','grupo equipamento','grupo_equipamento','GRUPO_EQUIPAMENTO') || '').trim(),
                    };
                });
            }

            // Derivar "Frente" a partir do código de Frota
            // Padrão Pitangueiras:
            //   80Xnn → Colhedora Frente X
            //   93Xnn → Colhedora Frente X (terceiro)
            //   92Xnn → Transbordo Frente X
            //   11Xnn → Trator de suporte Frente X
            function getFrenteFromFrota(frota) {
                const f = String(frota).replace(/\s/g,'');
                if (!f) return null;
                if (/^80\d/.test(f)) return 'FRENTE ' + f[2];
                if (/^93\d/.test(f)) return 'FRENTE ' + f[2] + ' (TERC)';
                if (/^920/.test(f)) return 'FRENTE 0';
                if (/^92\d/.test(f)) return 'FRENTE ' + f[2];
                if (/^11\d/.test(f)) return 'FRENTE ' + f[2];
                if (/^31[1-9]\d/.test(f)) return 'TRANSP. PRÓPRIO';
                if (/^312\d/.test(f)) return 'TRANSP. PRÓPRIO';
                if (/^91\d/.test(f)) return 'TRANSP. TERCEIRO';
                return null;
            }

            function getTipoFromGrupo(grupo) {
                const g = String(grupo).toUpperCase().trim();
                if (/COLHEDORA|COLHEDOR/.test(g)) return 'COLHEDORA';
                if (/TRANSBORDO|TRANSBORDOS/.test(g)) return 'TRANSBORDO';
                return null;
            }

            // Extrair período da coluna Data se não veio do cabeçalho
            const datasVistas = new Set();

            dadosObj.forEach(row => {
                // Prioridade: GRUPO EQUIPAMENTO > _frenteDireta > derivação da frota
                let frente = row._grupoEquip || row._frenteDireta || getFrenteFromFrota(row.Frota);
                if (!frente) return;
                if (frente === 'TRANSBORDOS - TERCEIROS') return;
                if (frente.includes('RESERVA')) return;

                const opCode = row.Operação;
                const descOp = row['Descrição da Operação'];
                const seg = parseInt(row.Segundos) || 0;
                const hrs = seg / 3600;
                const frotaNome = row.Frota;
                const descFrota = row.DescFrota || frotaNome;

                if (row.Data) datasVistas.add(String(row.Data));
                if (hrs <= 0) return;

                // Alimenta array para fallback da permanência
                if (opCode && frotaNome) {
                    solinftecFrotaAtividades.push({ frota: frotaNome, data: String(row.Data || '').trim(), operacao: String(opCode).trim(), segundos: seg });
                }

                let cat = null;
                if (OP_PRODUTIVO.includes(opCode))   cat = 'PRODUTIVO';
                else if (OP_IMPRODUTIVO.includes(opCode)) cat = 'IMPRODUTIVO';
                else if (OP_MANUTENCAO.includes(opCode))  cat = 'MANUTENCAO';
                if (!cat) cat = 'OUTROS';

                solinftecData.totais[cat] = (solinftecData.totais[cat] || 0) + hrs;

                if (!solinftecData.frentes[frente]) {
                    solinftecData.frentes[frente] = {
                        PRODUTIVO: 0, IMPRODUTIVO: 0, MANUTENCAO: 0, OUTROS: 0, total: 0,
                        gargalos: {}, operacoesDetalhadas: {}, frotas: {},
                        machines: {
                            COLHEDORA: { PRODUTIVO: 0, IMPRODUTIVO: 0, MANUTENCAO: 0, OUTROS: 0, total: 0, ops: {}, operacoesDetalhadas: {}, frotas: {} },
                            TRANSBORDO: { PRODUTIVO: 0, IMPRODUTIVO: 0, MANUTENCAO: 0, OUTROS: 0, total: 0, ops: {}, operacoesDetalhadas: {}, frotas: {} }
                        }
                    };
                }

                let f = solinftecData.frentes[frente];
                f[cat] += hrs; f.total += hrs;

                const opName = OP_NAMES[opCode] || descOp || ('Op.' + opCode);
                f.operacoesDetalhadas[opName] = (f.operacoesDetalhadas[opName] || 0) + hrs;
                if (cat !== 'PRODUTIVO') f.gargalos[opName] = (f.gargalos[opName] || 0) + hrs;

                if (!f.frotas[frotaNome]) {
                    f.frotas[frotaNome] = { nome: frotaNome, desc: descFrota, PRODUTIVO: 0, IMPRODUTIVO: 0, MANUTENCAO: 0, OUTROS: 0, operacoes: {} };
                }
                f.frotas[frotaNome][cat] += hrs;
                f.frotas[frotaNome].operacoes[opName] = (f.frotas[frotaNome].operacoes[opName] || 0) + hrs;

                // Classificar em COLHEDORA vs TRANSBORDO
                // Prioridade: GRUPO EQUIPAMENTO > derivação da frota
                const tipoGrupo = row._grupoEquip ? getTipoFromGrupo(row._grupoEquip) : null;
                const fStr = String(frotaNome);
                let tipo = tipoGrupo;
                if (!tipo) {
                    if (/^80\d|^93\d/.test(fStr)) tipo = 'COLHEDORA';
                    else if (/^92\d/.test(fStr))   tipo = 'TRANSBORDO';
                }

                if (tipo === 'COLHEDORA' || tipo === 'TRANSBORDO') {
                    let m = f.machines[tipo];
                    m[cat] += hrs; m.total += hrs;
                    m.operacoesDetalhadas[opName] = (m.operacoesDetalhadas[opName] || 0) + hrs;
                    if (cat !== 'PRODUTIVO') m.ops[opName] = (m.ops[opName] || 0) + hrs;
                    if (!m.frotas[frotaNome]) {
                        m.frotas[frotaNome] = { nome: frotaNome, desc: descFrota, PRODUTIVO: 0, IMPRODUTIVO: 0, MANUTENCAO: 0, operacoes: {} };
                    }
                    m.frotas[frotaNome][cat] += hrs;
                    m.frotas[frotaNome].operacoes[opName] = (m.frotas[frotaNome].operacoes[opName] || 0) + hrs;
                }
            });

            // Montar período a partir das datas vistas se não detectado no cabeçalho
            if (!solinftecPeriodo && datasVistas.size) {
                const datas = Array.from(datasVistas).sort();
                solinftecPeriodo = datas[0] + (datas.length > 1 ? ' a ' + datas[datas.length - 1] : '');
            }

            console.log('[Solinftec] frentes encontradas:', Object.keys(solinftecData.frentes).length, '| periodo:', solinftecPeriodo);

            solinftecLoaded = true;
            const btnSafra = document.getElementById('consumo-btn-safra');
            const infoSafra = document.getElementById('consumo-safra-info');
            if (btnSafra && solinftecPeriodo && typeof consumoAtualizarPeriodoSafra !== 'function') {
                btnSafra.innerHTML = `📅 <strong>${solinftecPeriodo}</strong> · SAFRA COMPLETA`;
                if (infoSafra) infoSafra.innerHTML = '📅 Período do Relatório: <strong>' + solinftecPeriodo + '</strong> — Dados consolidados de toda a safra.';
            }
            if (typeof consumoAtualizarPeriodoSafra === 'function') consumoAtualizarPeriodoSafra();
            renderSolinftec();
            updateStatus();
        }

        function openModal(frente, tipo, data) {
            const modal = document.getElementById('detail-modal');
            const title = document.getElementById('modal-title');
            const body = document.getElementById('modal-body');
            title.innerHTML = `${tipo} - FRENTE ${frente}`;
            const total = data.PRODUTIVO + data.IMPRODUTIVO + data.MANUTENCAO + (data.OUTROS || 0);
            let html = `<div class="detail-section-title">📊 Resumo</div>
            <div class="detail-item"><span class="detail-name">Produtivo</span><span class="detail-value">${data.PRODUTIVO.toFixed(1)}h (${((data.PRODUTIVO / total) * 100).toFixed(1)}%)</span></div>
            <div class="detail-item"><span class="detail-name">Improdutivo</span><span class="detail-value">${data.IMPRODUTIVO.toFixed(1)}h (${((data.IMPRODUTIVO / total) * 100).toFixed(1)}%)</span></div>
            <div class="detail-item"><span class="detail-name">Manutenção</span><span class="detail-value">${data.MANUTENCAO.toFixed(1)}h (${((data.MANUTENCAO / total) * 100).toFixed(1)}%)</span></div>\n            ${(data.OUTROS || 0) > 0 ? `<div class="detail-item"><span class="detail-name" style="color:#94a3b8">Outros</span><span class="detail-value" style="color:#94a3b8">${(data.OUTROS || 0).toFixed(1)}h (${((data.OUTROS || 0) / total * 100).toFixed(1)}%)</span></div>` : ""}`;

            const frotas = data.frotas || [];
            if (frotas.length > 0) {
                html += `<div class="detail-section-title">🚜 Detalhamento por Frota</div>`;
                frotas.forEach(frota => {
                    html += `<div class="frota-card">
                    <div class="frota-header">🏷️ ${frota.nome}</div>
                    <div class="frota-stats">
                        <div class="frota-stat"><div class="frota-stat-value" style="color:#22c55e">${frota.PRODUTIVO.toFixed(1)}h</div><div class="frota-stat-label">Produtivo</div></div>
                        <div class="frota-stat"><div class="frota-stat-value" style="color:#f59e0b">${frota.IMPRODUTIVO.toFixed(1)}h</div><div class="frota-stat-label">Improdutivo</div></div>
                        <div class="frota-stat"><div class="frota-stat-value" style="color:#ef4444">${frota.MANUTENCAO.toFixed(1)}h</div><div class="frota-stat-label">Manutenção</div></div>
                        ${(frota.OUTROS || 0) > 0 ? `<div class="frota-stat"><div class="frota-stat-value" style="color:#94a3b8">${(frota.OUTROS || 0).toFixed(1)}h</div><div class="frota-stat-label">Outros</div></div>` : ""}
                    </div>
                    <div style="margin-top:10px;"><div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">📋 Distribuição das 24h</div>${Object.entries(frota.operacoes).sort((a, b) => b[1] - a[1]).map(([op, h]) => { const pct = (h / 24 * 100).toFixed(0); const clr = frota.PRODUTIVO > 0 && ["Colhendo Cana", "Deslocamento Carregado", "Deslocamento Vazio", "Transbordo Carregando", "Transbordando Carga"].includes(op) ? "#22c55e" : ["Aguardo Descarregar", "Aguardando Colhedora", "Fila de Transbordo", "Aguardando Transbordo", "Aguardando Mecânico", "Aguardando Abastec.", "Chuva", "Intervalo Refeição", "Fila p/ Descarga", "Aguard. Manuten."].includes(op) ? "#f59e0b" : ["Manutenção Mecânica", "Manutenção Elétrica", "Manutenção Hidráulica", "Manutenção Pneus"].includes(op) ? "#ef4444" : "#94a3b8"; return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><div style="width:100px;font-size:10px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${op}">${op}</div><div style="flex:1;background:#f1f5f9;border-radius:4px;height:10px;overflow:hidden;"><div style="width:${pct}%;height:10px;background:${clr};border-radius:4px;transition:width .4s;"></div></div><div style="width:36px;font-size:10px;font-weight:700;color:${clr};text-align:right;">${h.toFixed(1)}h</div></div>`; }).join("")}</div>
                </div>`;
                });
            }
            body.innerHTML = html;
            modal.classList.add('active');
        }

        function renderSolinftec() {
            const frentesArray = Object.entries(solinftecData.frentes).map(([nome, data]) => ({ nome, ...data }));
            const piores = [...frentesArray].sort((a, b) => b.IMPRODUTIVO - a.IMPRODUTIVO).slice(0, 5);
            const maxImprod = piores[0]?.IMPRODUTIVO || 1;
            document.getElementById('piores-frentes').innerHTML = piores.map((f, i) => `<div class="rank-item"><div class="rank-pos">${i + 1}</div><div class="rank-name">${f.nome}</div><div class="rank-bar"><div class="rank-bar-fill" style="width: ${(f.IMPRODUTIVO / maxImprod) * 100}%;"></div></div><div class="rank-value">${f.IMPRODUTIVO.toFixed(1)}h</div></div>`).join('') || '<div>Nenhum dado</div>';

            let tableHtml = '';
            frentesArray.forEach(f => {
                let topGargalo = { nome: '-', horas: 0 };
                Object.entries(f.gargalos).forEach(([nome, horas]) => { if (horas > topGargalo.horas) topGargalo = { nome, horas }; });
                const eficiencia = f.total > 0 ? (f.PRODUTIVO / f.total * 100).toFixed(0) : 0;
                let badgeStyle = '', badgeText = '';
                if (f.IMPRODUTIVO > f.PRODUTIVO) { badgeStyle = 'background:#fee2e2; color:#991b1b'; badgeText = '🔴 CRÍTICA'; }
                else if (f.MANUTENCAO / f.total > 0.25) { badgeStyle = 'background:#ffedd5; color:#9a3412'; badgeText = '🔧 RISCO MECÂNICO'; }
                else if (eficiencia > 70) { badgeStyle = 'background:#dcfce7; color:#166534'; badgeText = '⭐ ALTA PERFORMANCE'; }
                else { badgeStyle = 'background:#e2e8f0; color:#475569'; badgeText = '⚡ NORMAL'; }
                tableHtml += `<tr><td style="font-weight:800">${f.nome}</td><td style="color:#22c55e">${f.PRODUTIVO.toFixed(1)}h</td><td style="color:#f59e0b">${f.IMPRODUTIVO.toFixed(1)}h</td><td style="color:#ef4444">${f.MANUTENCAO.toFixed(1)}h</td><td style="font-size:12px">${topGargalo.horas > 0 ? `${topGargalo.nome} (${topGargalo.horas.toFixed(1)}h)` : '-'}</td><td><span class="status-badge" style="${badgeStyle}">${badgeText}</span></td></tr>`;
            });
            document.getElementById('table-frentes').innerHTML = tableHtml;

            document.getElementById('total-produtivo').innerText = solinftecData.totais.PRODUTIVO.toFixed(1) + 'h';
            document.getElementById('total-improdutivo').innerText = solinftecData.totais.IMPRODUTIVO.toFixed(1) + 'h';
            document.getElementById('total-manutencao').innerText = solinftecData.totais.MANUTENCAO.toFixed(1) + 'h';

            renderGrid('COLHEDORA', 'solinftec-colhedoras');
            renderGrid('TRANSBORDO', 'solinftec-transbordos');
        }

        function renderGrid(tipo, containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            const frentes = Object.entries(solinftecData.frentes).sort();
            frentes.forEach(([nome, data]) => {
                const m = data.machines[tipo];
                if (m.total <= 0) return;
                let topGargalo = { nome: 'Nenhum', horas: 0 };
                Object.entries(m.ops).forEach(([n, v]) => { if (v > topGargalo.horas) topGargalo = { nome: n, horas: v }; });
                const isError = m.IMPRODUTIVO === 24 || m.MANUTENCAO === 24 || m.PRODUTIVO === 24;
                const canvasId = `chart-${tipo}-${nome.replace(/\s/g, '')}`;
                const tipoLabel = tipo === 'COLHEDORA' ? '🚜 Colhedora' : '🚛 Transbordo';
                let alertBox = '';
                if (isError) alertBox = `<div class="error-box">⚠️ ALERTA: 24h consecutivas da mesma operação - ERRO DE APONTAMENTO</div>`;
                else if (topGargalo.horas > 0) alertBox = `<div class="bottleneck-box">🔥 Gargalo: ${topGargalo.nome} (${topGargalo.horas.toFixed(1)}h)</div>`;
                else alertBox = `<div class="healthy-box">✅ Operação Saudável</div>`;

                const frotasList = Object.values(m.frotas || {}).map(f => ({
                    nome: f.nome,
                    PRODUTIVO: f.PRODUTIVO,
                    IMPRODUTIVO: f.IMPRODUTIVO,
                    MANUTENCAO: f.MANUTENCAO,
                    operacoes: f.operacoes
                }));

                const html = `<div class="card"><div class="section-title">${tipoLabel} - ${nome}</div>
                <div class="kpi-mini-row">
                    <div class="kpi-mini"><div class="kpi-mini-val" style="color:#22c55e">${m.PRODUTIVO.toFixed(1)}h</div><div class="kpi-mini-lbl">Produtivo</div></div>
                    <div class="kpi-mini"><div class="kpi-mini-val" style="color:#f59e0b">${m.IMPRODUTIVO.toFixed(1)}h</div><div class="kpi-mini-lbl">Improdutivo</div></div>
                    <div class="kpi-mini"><div class="kpi-mini-val" style="color:#ef4444">${m.MANUTENCAO.toFixed(1)}h</div><div class="kpi-mini-lbl">Manutenção</div></div>
                    ${(m.OUTROS || 0) > 0 ? `<div class="kpi-mini"><div class="kpi-mini-val" style="color:#94a3b8">${(m.OUTROS || 0).toFixed(1)}h</div><div class="kpi-mini-lbl">Outros</div></div>` : ''}
                </div>
                <div class="chart-container" onclick='openModal("${nome}", "${tipoLabel}", { PRODUTIVO: ${m.PRODUTIVO}, IMPRODUTIVO: ${m.IMPRODUTIVO}, MANUTENCAO: ${m.MANUTENCAO}, frotas: ${JSON.stringify(frotasList).replace(/"/g, '&quot;')} })'>
                    <div class="chart-center-text"><div class="center-value">24h</div><div class="center-label">${Object.keys(m.frotas || {}).length} equip.</div></div>
                    <canvas id="${canvasId}"></canvas>
                </div>${alertBox}</div>`;
                container.insertAdjacentHTML('beforeend', html);
                if (charts[canvasId]) charts[canvasId].destroy();
                var isDark = document.body.classList.contains('dark-theme');
                var ctx = document.getElementById(canvasId).getContext('2d');
                charts[canvasId] = new Chart(ctx, {
                    type: 'doughnut',
                    data: { labels: ['Produtivo', 'Improdutivo', 'Manutenção'], datasets: [{ data: [m.PRODUTIVO, m.IMPRODUTIVO, m.MANUTENCAO, m.OUTROS || 0], backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#94a3b8'], borderWidth: 0, hoverOffset: 15 }] },
                    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', animation: { animateRotate: true, animateScale: false, duration: 900, easing: 'easeInOutCubic' }, plugins: { legend: { display: false }, tooltip: { backgroundColor: isDark ? '#334155' : '#1e293b', callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw.toFixed(1)}h` } }, datalabels: { color: '#fff', font: { weight: '800', size: 11 }, formatter: (val, ctx) => { const total = ctx.dataset.data.reduce((a, b) => a + b, 0); const pct = (val / total) * 100; return val > 0 && pct >= 5 ? pct.toFixed(0) + '%' : null; }, anchor: 'center', align: 'center', offset: 0 } }, layout: { padding: 10 } }
                });
            });
        }

        function closeModal() { document.getElementById('detail-modal').classList.remove('active'); }

