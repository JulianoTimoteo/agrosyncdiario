        // ═══════════════════════════════════════════════════════════════════
        //  MÓDULO CONSUMO  (novo — isolado, prefixo "consumo")
        //  Subabas: Caminhão (grupos por equipe) e Colhedoras (grupos por frente)
        //  Fontes: ConsumoCanavieiros.xls / ConsumoColhedoras.xls (relatório GAtec
        //  "Índices Operacionais") + CAMINHÃO.xlsx / Colhedoras.xlsx (classificação)
        // ═══════════════════════════════════════════════════════════════════

        let consumoCaminhaoData = [];   // [{frota, grupo, metrics:{label:num}}]
        let consumoColhedorasData = [];
        let consumoClassificacaoCaminhao = {}; // frota -> grupo
        let consumoClassificacaoColhedoras = {}; // frota -> "Frente X"
        let consumoCharts = {};   // instâncias Chart.js do módulo
        let consumoMetasCaminhao = {};   // grupo -> meta
        let consumoMetasColhedoras = {};
        let consumoColunasCaminhao = [];   // métricas numéricas disponíveis
        let consumoColunasColhedoras = [];
        let consumoMetricaCaminhao = null; // métrica selecionada
        let consumoMetricaColhedoras = null;
        let consumoArquivos = { consCam: null, consCol: null, classCam: null, classCol: null };
        let consumoPeriodoCaminhao = '';      // Período extraído do cabeçalho do ConsumoCanavieiros
        let consumoPeriodoColhedoras = '';    // Período extraído do cabeçalho do ConsumoColhedoras
        let consumoDataRelatorioCaminhao = '';
        let consumoDataRelatorioColhedoras = '';
        let consumoAbaAtiva = 'caminhao';
        let consumoProcessado = false;
        let consumoFiltroGrupoCaminhao = 'TODOS'; // chip de grupo ativo na subaba Caminhão

        const CONSUMO_SEM_CLASSIF = 'SEM CLASSIFICAÇÃO';
        const CONSUMO_COR_VERDE = '#16a34a';
        const CONSUMO_COR_VERMELHO = '#dc2626';
        const CONSUMO_COR_NEUTRA = '#94a3b8';

        // ── Utilidades ──────────────────────────────────────────────────────
        function consumoNormalizarTexto(s) {
            return String(s == null ? '' : s)
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase().replace(/[\s_\-]+/g, '').trim();
        }

        function normalizarFrotaConsumo(v) {
            if (v == null || v === '') return null;
            const dig = String(v).trim().replace(/\.0+$/, '').replace(/\D/g, '');
            return dig.length ? dig : null;
        }

        function consumoFmt(n, dec = 2) {
            if (n == null || isNaN(n)) return '—';
            return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }

        function consumoSlug(s) {
            return consumoNormalizarTexto(s).replace(/[^a-z0-9]/g, '') || 'x';
        }

        function consumoEscHtml(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function consumoFormatarDataCabecalho(dataTxt) {
            const m = String(dataTxt || '').trim().match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
            if (!m) return '';
            let d = m[1].padStart(2, '0');
            let mo = m[2].padStart(2, '0');
            let y = m[3];
            if (y.length === 2) y = (parseInt(y, 10) >= 70 ? '19' : '20') + y;
            return d + '/' + mo + '/' + y;
        }

        function consumoExtrairPeriodoRelatorio(json) {
            const vazio = { periodo: '', data: '', hora: '' };
            if (!Array.isArray(json) || !json.length) return vazio;

            const linhas = json.slice(0, 60).map(row =>
                (row || []).map(c => String(c == null ? '' : c).trim()).filter(Boolean).join(' ')
            ).filter(Boolean);
            const texto = linhas.join('\n').replace(/\s+/g, ' ').trim();
            if (!texto) return vazio;

            const periodoMatch = texto.match(/per[ií]odo\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*(?:a|ate|até|\-)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
            const dataMatch = texto.match(/\bdata\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
            const horaMatch = texto.match(/\bhora\s*:?\s*(\d{1,2}:\d{2}(?::\d{2})?)/i);

            const ini = periodoMatch ? consumoFormatarDataCabecalho(periodoMatch[1]) : '';
            const fim = periodoMatch ? consumoFormatarDataCabecalho(periodoMatch[2]) : '';
            return {
                periodo: (ini && fim) ? (ini + ' a ' + fim) : '',
                data: dataMatch ? consumoFormatarDataCabecalho(dataMatch[1]) : '',
                hora: horaMatch ? horaMatch[1] : ''
            };
        }

        function consumoAtualizarPeriodoSafra() {
            const btn = document.getElementById('consumo-btn-safra');
            const badge = document.getElementById('consumo-periodo-badge');
            const info = document.getElementById('consumo-safra-info');
            if (!btn) return;

            const periodoAtual = consumoAbaAtiva === 'colhedoras'
                ? (consumoPeriodoColhedoras || consumoPeriodoCaminhao || solinftecPeriodo || '')
                : (consumoPeriodoCaminhao || consumoPeriodoColhedoras || solinftecPeriodo || '');
            const dataRel = consumoAbaAtiva === 'colhedoras'
                ? (consumoDataRelatorioColhedoras || consumoDataRelatorioCaminhao || '')
                : (consumoDataRelatorioCaminhao || consumoDataRelatorioColhedoras || '');

            btn.innerHTML = '📅 SAFRA COMPLETA';
            if (badge) {
                badge.style.display = periodoAtual ? 'inline-flex' : 'none';
                badge.innerHTML = periodoAtual ? ('Período: <strong>' + consumoEscHtml(periodoAtual) + '</strong>') : '';
            }
            if (info) {
                if (periodoAtual) {
                    info.innerHTML = '📅 Período do relatório: <strong>' + consumoEscHtml(periodoAtual) + '</strong>' +
                        (dataRel ? ' &nbsp;|&nbsp; Emitido em: <strong>' + consumoEscHtml(dataRel) + '</strong>' : '') +
                        ' — Dados consolidados da safra completa.';
                } else {
                    info.innerHTML = '📅 Safra completa — período do relatório não encontrado no cabeçalho dos arquivos de consumo.';
                }
            }
        }

        function consumoResetArquivos() {
            consumoArquivos = { consCam: null, consCol: null, classCam: null, classCol: null };
            consumoPeriodoCaminhao = '';
            consumoPeriodoColhedoras = '';
            consumoDataRelatorioCaminhao = '';
            consumoDataRelatorioColhedoras = '';
            consumoAtualizarPeriodoSafra();
        }

        // ── Identificação automática dos arquivos na pasta ─────────────────
        function consumoIdentificarArquivo(nome) {
            const m = String(nome).match(/^(.*)\.(xlsx?|xlsm)$/i);
            if (!m) return null;
            const n = consumoNormalizarTexto(m[1]);

            if (n.startsWith('consumo')) {
                if (n.includes('colhedora')) return 'consCol';
                if (n.includes('canavieiro') || n.includes('caminh') || n.includes('caminhao')) return 'consCam';
                return null;
            }
            if (n === 'caminhao' || n === 'caminhoes' || n.startsWith('tipocaminhao') || n.startsWith('classificacaocaminhao')) return 'classCam';
            if (n === 'colhedora' || n === 'colhedoras' || n.startsWith('tipocolhedora') || n.startsWith('classificacaocolhedora')) return 'classCol';
            return null;
        }

        // ── Leitura dos arquivos de classificação ───────────────────────────
        function consumoParseClassificacao(json, tipo) {
            const mapa = {};
            if (!json || !json.length) return mapa;

            const nomesFrota = ['frota', 'equipamento', 'caminhao', 'colhedora', 'equip'];
            const nomesGrupo = ['grupo', 'equipe', 'tipo', 'frente', 'grupofrente', 'tipocaminhao', 'classificacao'];

            let headerIdx = -1, frotaCol = -1, grupoCol = -1;
            for (let i = 0; i < Math.min(json.length, 25); i++) {
                const row = json[i] || [];
                let fc = -1, gc = -1;
                for (let c = 0; c < row.length; c++) {
                    const t = consumoNormalizarTexto(row[c]);
                    if (!t) continue;
                    if (fc < 0 && nomesFrota.some(x => t === x || t.startsWith(x))) fc = c;
                    else if (gc < 0 && nomesGrupo.some(x => t === x || t.startsWith(x))) gc = c;
                }
                if (fc >= 0 && gc >= 0) { headerIdx = i; frotaCol = fc; grupoCol = gc; break; }
            }
            // fallback: assume duas primeiras colunas
            if (headerIdx < 0) { headerIdx = 0; frotaCol = 0; grupoCol = 1; }

            for (let i = headerIdx + 1; i < json.length; i++) {
                const row = json[i] || [];
                const frota = normalizarFrotaConsumo(row[frotaCol]);
                if (!frota) continue;
                let grupo = String(row[grupoCol] == null ? '' : row[grupoCol]).trim();
                if (!grupo) grupo = CONSUMO_SEM_CLASSIF;
                if (tipo === 'colhedoras' && /^\d+([.,]\d+)?$/.test(grupo)) grupo = 'Frente ' + parseInt(grupo, 10);
                mapa[frota] = grupo;
            }
            return mapa;
        }

        // ── Parser do relatório GAtec "Índices Operacionais" ────────────────
        // Estrutura: linha-cabeçalho com "Equip." define a coluna da frota; a linha
        // seguinte traz os rótulos das métricas (Ton. Cana, Km/Horas, Combustível,
        // Km/Litros, Litros/ton, Litros/Hr...). Por causa de células mescladas, os
        // rótulos e os dados podem estar deslocados em ±1 coluna — o mapeamento é
        // feito pela ORDEM das colunas preenchidas nas linhas de dados.
        function consumoParseIndices(json) {
            if (!json || !json.length) return null;

            let frotaCol = -1, headerIdx = -1;
            for (let i = 0; i < json.length && frotaCol < 0; i++) {
                const row = json[i] || [];
                for (let c = 0; c < row.length; c++) {
                    const tCab = consumoNormalizarTexto(row[c]).replace(/\./g, '');
                    if (tCab === 'equip' || tCab === 'equipamento') { frotaCol = c; headerIdx = i; break; }
                }
            }
            if (frotaCol < 0) return null;

            // Rótulos das métricas (linha seguinte ao cabeçalho "Equip.")
            let labels = [];
            for (let i = headerIdx + 1; i <= headerIdx + 2 && i < json.length; i++) {
                const row = json[i] || [];
                const tmp = [];
                for (let c = frotaCol + 1; c < row.length; c++) {
                    const v = row[c];
                    if (v != null && String(v).trim() !== '') tmp.push({ col: c, label: String(v).trim() });
                }
                if (tmp.length >= 4) { labels = tmp; break; }
            }
            if (!labels.length) return null;

            // Linhas de dados: coluna 0 vazia (exclui "Média Modelo"/"Média Geral")
            // e valor numérico de frota na coluna "Equip."
            const dataRows = [];
            for (const row of json) {
                if (!row) continue;
                const c0 = String(row[0] == null ? '' : row[0]).trim();
                if (c0 !== '') continue;
                const bruto = row[frotaCol];
                if (bruto == null || bruto === '') continue;
                const frota = normalizarFrotaConsumo(bruto);
                if (!frota || !/^\d{2,7}$/.test(frota)) continue;
                if (typeof bruto !== 'number' && !/^\d+$/.test(String(bruto).trim())) continue;
                dataRows.push(row);
            }
            if (!dataRows.length) return null;

            // União das colunas preenchidas nas linhas de dados (após a frota)
            const colSet = new Set();
            dataRows.forEach(r => {
                for (let c = frotaCol + 1; c < r.length; c++) {
                    const v = r[c];
                    if (v != null && String(v).trim() !== '') colSet.add(c);
                }
            });
            const dataCols = Array.from(colSet).sort((a, b) => a - b);

            // Mapeia rótulo → coluna de dado
            let mapping = [];
            if (labels.length === dataCols.length) {
                mapping = dataCols.map((c, i) => ({ col: c, label: labels[i].label }));
            } else {
                // associa cada rótulo à coluna de dado mais próxima ainda livre
                const usadas = new Set();
                labels.forEach(l => {
                    let melhor = null, melhorDist = Infinity;
                    dataCols.forEach(c => {
                        if (usadas.has(c)) return;
                        const d = Math.abs(c - l.col);
                        if (d < melhorDist) { melhorDist = d; melhor = c; }
                    });
                    if (melhor != null && melhorDist <= 2) { usadas.add(melhor); mapping.push({ col: melhor, label: l.label }); }
                });
                mapping.sort((a, b) => a.col - b.col);
            }

            // Diferencia rótulos repetidos (ex.: "Lt/ton" de Óleo Hid. e Óleo Lub.)
            const vistos = {};
            mapping.forEach(mp => {
                if (vistos[mp.label]) { vistos[mp.label]++; mp.label = mp.label + ' (' + vistos[mp.label] + ')'; }
                else vistos[mp.label] = 1;
            });

            // Registros únicos por frota (primeira ocorrência)
            const regs = {};
            dataRows.forEach(r => {
                const frota = normalizarFrotaConsumo(r[frotaCol]);
                if (regs[frota]) return;
                const metrics = {};
                mapping.forEach(mp => {
                    const v = r[mp.col];
                    const num = (typeof v === 'number') ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
                    metrics[mp.label] = isNaN(num) ? null : num;
                });
                regs[frota] = { frota: frota, metrics: metrics };
            });

            return { registros: Object.values(regs), colunas: mapping.map(mp => mp.label) };
        }

        // ── Métricas: seleção padrão e direção de comparação ────────────────
        function consumoFiltrarColunasRelevantes(colunas) {
            const rel = colunas.filter(c =>
                /km\s*\/\s*litros|litros\s*\/\s*ton|litros\s*\/\s*hr|ton\s*\/\s*hr|ton\s*\/\s*viag|km\/l|l\/h\b|l\/km|l\/ha|ha\/h|consumo|m[ée]dia|valor|combust/i.test(c));
            return rel.length ? rel : colunas.slice();
        }

        function detectarColunaConsumo(colunas, tipo) {
            const prioridade = (tipo === 'caminhao')
                ? ['km/litros', 'litros/ton', 'km/l', 'l/km', 'consumo', 'media', 'valor', 'combustivel']
                : ['litros/hr', 'litroshr', 'l/h', 'litros/ton', 'l/ton', 'ton/hr', 'consumo', 'media', 'valor', 'combustivel'];
            for (const p of prioridade) {
                const achada = colunas.find(c => consumoNormalizarTexto(c).includes(consumoNormalizarTexto(p)));
                if (achada) return achada;
            }
            return colunas[0] || null;
        }

        // "Menor é melhor" para Litros/ton, Litros/Hr etc.; "Maior é melhor" para
        // Km/Litros, Ton/Hr, Ton/Viag, R. Energético e Disp %.
        function consumoMenorMelhor(metrica) {
            if (!metrica) return true;
            return !(/km\s*\/\s*l|ton\s*\/\s*(hr|h\b|viag)|r\.?\s*energ|disp/i.test(metrica));
        }

        function getConsumoStatus(valor, meta, menorMelhor) {
            if (valor == null || isNaN(valor)) return { ok: null, txt: '—' };
            if (meta == null || isNaN(meta)) return { ok: null, txt: 'Sem meta' };
            const dentro = menorMelhor ? (valor <= meta) : (valor >= meta);
            return { ok: dentro, txt: dentro ? 'Dentro da meta' : 'Fora da meta' };
        }

        // ── Classificação de grupos ─────────────────────────────────────────
        function classificarGrupoCaminhao(frota) { return consumoClassificacaoCaminhao[frota] || CONSUMO_SEM_CLASSIF; }
        function classificarGrupoColhedora(frota) { return consumoClassificacaoColhedoras[frota] || CONSUMO_SEM_CLASSIF; }

        // ── Persistência leve das metas/métricas (não falha se indisponível) ─
        function consumoSalvarPrefs() {
            try {
                localStorage.setItem('consumoPrefsV1', JSON.stringify({
                    metasCam: consumoMetasCaminhao, metasCol: consumoMetasColhedoras,
                    metCam: consumoMetricaCaminhao, metCol: consumoMetricaColhedoras
                }));
            } catch (_) { }
        }
        function consumoCarregarPrefs() {
            try {
                const p = JSON.parse(localStorage.getItem('consumoPrefsV1') || 'null');
                if (!p) return;
                if (p.metasCam) consumoMetasCaminhao = p.metasCam;
                if (p.metasCol) consumoMetasColhedoras = p.metasCol;
                if (p.metCam) consumoMetricaCaminhao = p.metCam;
                if (p.metCol) consumoMetricaColhedoras = p.metCol;
            } catch (_) { }
        }

        // ── Processamento principal (chamado após selecionar a pasta) ───────
        async function processConsumoFiles() {
            consumoCarregarPrefs();
            consumoClassificacaoCaminhao = {};
            consumoClassificacaoColhedoras = {};
            consumoCaminhaoData = [];
            consumoColhedorasData = [];
            consumoColunasCaminhao = [];
            consumoColunasColhedoras = [];
            consumoPeriodoCaminhao = '';
            consumoPeriodoColhedoras = '';
            consumoDataRelatorioCaminhao = '';
            consumoDataRelatorioColhedoras = '';
            consumoProcessado = true;

            try {
                if (consumoArquivos.classCam) {
                    const json = await readXlsxFile(consumoArquivos.classCam, true);
                    consumoClassificacaoCaminhao = consumoParseClassificacao(json, 'caminhao');
                }
                if (consumoArquivos.classCol) {
                    const json = await readXlsxFile(consumoArquivos.classCol, true);
                    consumoClassificacaoColhedoras = consumoParseClassificacao(json, 'colhedoras');
                }
                if (consumoArquivos.consCam) {
                    const json = await readXlsxFile(consumoArquivos.consCam, true);
                    const cab = consumoExtrairPeriodoRelatorio(json);
                    consumoPeriodoCaminhao = cab.periodo || '';
                    consumoDataRelatorioCaminhao = cab.data || '';
                    const res = consumoParseIndices(json);
                    if (res) {
                        consumoColunasCaminhao = consumoFiltrarColunasRelevantes(res.colunas);
                        consumoCaminhaoData = res.registros.map(r => ({ frota: r.frota, grupo: classificarGrupoCaminhao(r.frota), metrics: r.metrics }));
                    }
                }
                if (consumoArquivos.consCol) {
                    const json = await readXlsxFile(consumoArquivos.consCol, true);
                    const cab = consumoExtrairPeriodoRelatorio(json);
                    consumoPeriodoColhedoras = cab.periodo || '';
                    consumoDataRelatorioColhedoras = cab.data || '';
                    const res = consumoParseIndices(json);
                    if (res) {
                        consumoColunasColhedoras = consumoFiltrarColunasRelevantes(res.colunas);
                        consumoColhedorasData = res.registros.map(r => ({ frota: r.frota, grupo: classificarGrupoColhedora(r.frota), metrics: r.metrics }));
                    }
                }
            } catch (err) {
                console.warn('CONSUMO: falha ao processar arquivos:', err);
            }

            // métricas padrão (mantém escolha anterior se ainda existir)
            if (!consumoMetricaCaminhao || consumoColunasCaminhao.indexOf(consumoMetricaCaminhao) < 0)
                consumoMetricaCaminhao = detectarColunaConsumo(consumoColunasCaminhao, 'caminhao');
            if (!consumoMetricaColhedoras || consumoColunasColhedoras.indexOf(consumoMetricaColhedoras) < 0)
                consumoMetricaColhedoras = detectarColunaConsumo(consumoColunasColhedoras, 'colhedoras');

            consumoAtualizarPeriodoSafra();

            const abaConsumo = document.getElementById('main-consumo');
            if (abaConsumo && abaConsumo.classList.contains('active')) renderConsumo();
        }

        // ── Estado derivado por subaba ──────────────────────────────────────
        function consumoGetCtx(tipo) {
            const cam = (tipo === 'caminhao');
            return {
                tipo: tipo,
                dados: cam ? consumoCaminhaoData : consumoColhedorasData,
                colunas: cam ? consumoColunasCaminhao : consumoColunasColhedoras,
                metrica: cam ? consumoMetricaCaminhao : consumoMetricaColhedoras,
                metas: cam ? consumoMetasCaminhao : consumoMetasColhedoras,
                rotuloGrupo: cam ? 'Equipe/Grupo' : 'Grupo de Frente',
                rotuloItem: cam ? 'caminhão' : 'colhedora',
                rotuloItens: cam ? 'caminhões' : 'colhedoras'
            };
        }

        function consumoAgruparDados(ctx) {
            const grupos = {};
            ctx.dados.forEach(d => {
                const v = d.metrics[ctx.metrica];
                if (v == null || isNaN(v)) return;
                (grupos[d.grupo] = grupos[d.grupo] || []).push({ frota: d.frota, grupo: d.grupo, valor: v });
            });
            Object.values(grupos).forEach(arr => arr.sort((a, b) => b.valor - a.valor)); // maior → menor
            const nomes = Object.keys(grupos).sort((a, b) => {
                if (a === CONSUMO_SEM_CLASSIF) return 1;
                if (b === CONSUMO_SEM_CLASSIF) return -1;
                return a.localeCompare(b, 'pt-BR', { numeric: true });
            });
            return { grupos: grupos, nomes: nomes };
        }

        function consumoMetaDoGrupo(ctx, grupo, itens) {
            const chave = ctx.metrica + '|' + grupo;
            if (ctx.metas[chave] != null && !isNaN(ctx.metas[chave])) return ctx.metas[chave];
            // padrão inicial: média do grupo
            const media = itens.reduce((s, x) => s + x.valor, 0) / itens.length;
            const def = Math.round(media * 100) / 100;
            ctx.metas[chave] = def;
            return def;
        }

        // ── Renderização ────────────────────────────────────────────────────
        function destroyConsumoCharts(prefixo) {
            Object.keys(consumoCharts).forEach(id => {
                if (!prefixo || id.indexOf(prefixo) === 0) {
                    try { consumoCharts[id].destroy(); } catch (_) { }
                    delete consumoCharts[id];
                }
            });
        }

        function switchConsumoTab(tab) {
            consumoAbaAtiva = tab;
            document.querySelectorAll('.consumo-tab').forEach(t => t.classList.remove('active'));
            const btn = document.getElementById('consumo-tab-' + tab);
            if (btn) btn.classList.add('active');
            document.getElementById('consumo-caminhao').classList.toggle('active', tab === 'caminhao');
            document.getElementById('consumo-colhedoras').classList.toggle('active', tab === 'colhedoras');
            consumoAtualizarPeriodoSafra();
            renderConsumoSubaba(tab);
        }

        function renderConsumo() {
            renderConsumoStatusArquivos();
            renderConsumoSubaba(consumoAbaAtiva);
        }

        function renderConsumoStatusArquivos() {
            const box = document.getElementById('consumo-files-status');
            if (!box) return;
            if (!consumoProcessado) {
                box.innerHTML = '<div class="consumo-msg-info">📁 Selecione a pasta de dados para carregar os arquivos de consumo (ConsumoCanavieiros / ConsumoColhedoras) e de classificação (CAMINHÃO / Colhedoras).</div>';
                return;
            }
            let html = '';
            if (!consumoArquivos.consCam) html += '<div class="consumo-msg-erro">⚠️ Arquivo de consumo de caminhões não encontrado.</div>';
            if (!consumoArquivos.consCol) html += '<div class="consumo-msg-erro">⚠️ Arquivo de consumo de colhedoras não encontrado.</div>';
            if (consumoArquivos.consCam && !consumoArquivos.classCam)
                html += '<div class="consumo-msg-warn">ℹ️ Arquivo de classificação de caminhões não encontrado. Os dados serão exibidos como SEM CLASSIFICAÇÃO.</div>';
            if (consumoArquivos.consCol && !consumoArquivos.classCol)
                html += '<div class="consumo-msg-warn">ℹ️ Arquivo de classificação de colhedoras não encontrado. Os dados serão exibidos como SEM CLASSIFICAÇÃO.</div>';
            box.innerHTML = html;
        }

        function renderConsumoSubaba(tipo) {
            if (tipo === 'caminhao') renderConsumoCaminhao(); else renderConsumoColhedoras();
        }
        function renderConsumoCaminhao() { renderConsumoTipo(consumoGetCtx('caminhao')); }
        function renderConsumoColhedoras() { renderConsumoColhedorasUnico(consumoGetCtx('colhedoras')); }

        // ── Chips de grupo (aparecem ao lado das subabas Caminhão/Colhedoras) ──
        function renderConsumoChips(ctx, nomes, grupos) {
            const box = document.getElementById('consumo-grupo-chips');
            if (!box) return;
            if (!ctx || ctx.tipo !== 'caminhao' || !nomes || !nomes.length) { box.innerHTML = ''; return; }
            if (consumoFiltroGrupoCaminhao !== 'TODOS' && nomes.indexOf(consumoFiltroGrupoCaminhao) < 0) consumoFiltroGrupoCaminhao = 'TODOS';
            const total = nomes.reduce((s, g) => s + grupos[g].length, 0);
            let html = '<button class="consumo-chip' + (consumoFiltroGrupoCaminhao === 'TODOS' ? ' active' : '') + '" ' +
                'onclick="consumoFiltrarGrupoCaminhao(\'TODOS\')">Todos<span class="chip-qtd">' + total + '</span></button>';
            nomes.forEach(g => {
                html += '<button class="consumo-chip' + (consumoFiltroGrupoCaminhao === g ? ' active' : '') + '" ' +
                    'onclick="consumoFiltrarGrupoCaminhao(\'' + consumoEscHtml(g).replace(/'/g, "\\'") + '\')">' +
                    consumoEscHtml(g) + '<span class="chip-qtd">' + grupos[g].length + '</span></button>';
            });
            box.innerHTML = html;
        }

        function consumoFiltrarGrupoCaminhao(grupo) {
            consumoFiltroGrupoCaminhao = grupo;
            renderConsumoCaminhao();
        }

        // ── Preparação comum das subabas (limpa, valida, toolbar, agrupa) ──
        function consumoPrepararSubaba(ctx) {
            const base = 'consumo-' + ctx.tipo;
            const els = {
                msg: document.getElementById(base + '-msg'),
                tool: document.getElementById(base + '-toolbar'),
                cards: document.getElementById(base + '-cards'),
                grupos: document.getElementById(base + '-grupos'),
                tab: document.getElementById(base + '-tabela')
            };
            if (!els.grupos) return null;

            destroyConsumoCharts(base);
            els.msg.innerHTML = ''; els.tool.innerHTML = ''; els.cards.innerHTML = ''; els.grupos.innerHTML = ''; els.tab.innerHTML = '';
            renderDisponibilidadeChips(null);

            if (!consumoProcessado) { renderConsumoChips(null); return null; }

            const temArquivo = (ctx.tipo === 'caminhao') ? !!consumoArquivos.consCam : !!consumoArquivos.consCol;
            if (!temArquivo) {
                renderConsumoChips(null);
                els.msg.innerHTML = '<div class="consumo-msg-info">Sem dados de consumo de ' + ctx.rotuloItens + ' para exibir. Verifique se o arquivo está na pasta selecionada.</div>';
                return null;
            }
            if (!ctx.dados.length || !ctx.metrica) {
                renderConsumoChips(null);
                els.msg.innerHTML = '<div class="consumo-msg-erro">Não foi encontrada coluna numérica de consumo para montar o gráfico.</div>';
                return null;
            }

            // ── Toolbar: métrica + direção + exportação + legenda ──
            const menorMelhor = consumoMenorMelhor(ctx.metrica);
            const opcoes = ctx.colunas.map(c =>
                '<option value="' + consumoEscHtml(c) + '"' + (c === ctx.metrica ? ' selected' : '') + '>' + consumoEscHtml(c) + '</option>').join('');
            els.tool.innerHTML =
                '<div class="consumo-toolbar">' +
                '<label>Indicador:</label>' +
                '<select onchange="consumoTrocarMetrica(\'' + ctx.tipo + '\', this.value)">' + opcoes + '</select>' +
                '<span style="font-size:11px;font-weight:700;color:' + (menorMelhor ? '#16a34a' : '#0891b2') + ';">' +
                (menorMelhor ? '▼ Menor é melhor' : '▲ Maior é melhor') + '</span>' +
                '<div class="consumo-legenda">' +
                '<span class="leg-verde">Dentro da meta</span>' +
                '<span class="leg-vermelho">Fora da meta</span>' +
                '<span class="leg-meta">Linha de meta</span>' +
                '</div>' +
                '</div>';

            // ── Agrupamento ──
            const { grupos, nomes } = consumoAgruparDados(ctx);
            if (!nomes.length) {
                renderConsumoChips(null);
                els.msg.innerHTML = '<div class="consumo-msg-erro">Não foi encontrada coluna numérica de consumo para montar o gráfico.</div>';
                return null;
            }

            // ── Alerta: frotas cadastradas sem consumo ──
            const classif = (ctx.tipo === 'caminhao') ? consumoClassificacaoCaminhao : consumoClassificacaoColhedoras;
            const comConsumo = new Set(ctx.dados.map(d => d.frota));
            const semConsumo = Object.keys(classif).filter(f => !comConsumo.has(f));
            if (semConsumo.length) {
                const warnHtml = '<div class="consumo-msg-warn consumo-msg-auto" id="consumo-warn-' + ctx.tipo + '">⚠️ ' + semConsumo.length + ' frota(s) na classificação sem dado de consumo: ' +
                    consumoEscHtml(semConsumo.slice(0, 15).join(', ')) + (semConsumo.length > 15 ? '…' : '') + '</div>';
                els.msg.innerHTML = warnHtml;
                setTimeout(function () {
                    const el = document.getElementById('consumo-warn-' + ctx.tipo);
                    if (el) { el.style.transition = 'opacity 0.5s'; el.style.opacity = '0'; setTimeout(function () { if (el) el.remove(); }, 500); }
                }, 5000);
            }

            return { base: base, els: els, menorMelhor: menorMelhor, grupos: grupos, nomes: nomes };
        }

        // ── Subaba CAMINHÃO: blocos por grupo, filtráveis pelos chips ──────
        function renderConsumoTipo(ctx) {
            const prep = consumoPrepararSubaba(ctx);
            if (!prep) return;
            const base = prep.base, grupos = prep.grupos, menorMelhor = prep.menorMelhor;

            // Chips de grupo ao lado das subabas + filtro ativo
            renderConsumoChips(ctx, prep.nomes, grupos);
            const nomes = (ctx.tipo === 'caminhao' && consumoFiltroGrupoCaminhao !== 'TODOS')
                ? prep.nomes.filter(g => g === consumoFiltroGrupoCaminhao)
                : prep.nomes;

            // ── Cards gerais (refletem o filtro ativo) ──
            prep.els.cards.innerHTML = consumoHtmlCardsGerais(ctx, grupos, nomes, menorMelhor);

            // ── Blocos por grupo ──
            let htmlGrupos = '';
            nomes.forEach(g => {
                const slug = consumoSlug(g);
                const meta = consumoMetaDoGrupo(ctx, g, grupos[g]);
                htmlGrupos +=
                    '<div class="consumo-grupo-bloco">' +
                    '<div class="consumo-grupo-header">' +
                    '<div class="consumo-grupo-titulo">' + consumoEscHtml(g) + ' <span style="color:#94a3b8;font-weight:700;">(' + grupos[g].length + ')</span></div>' +
                    '<div class="consumo-meta-box"><label>Meta ' + consumoEscHtml(g) + ':</label>' +
                    '<input type="number" step="0.01" value="' + meta + '" ' +
                    'oninput="' + (ctx.tipo === 'caminhao' ? 'updateConsumoMetaCaminhao' : 'updateConsumoMetaColhedoras') + '(\'' + consumoEscHtml(g).replace(/'/g, "\\'") + '\', this.value)">' +
                    '</div>' +
                    '</div>' +
                    '<div class="consumo-chart-wrap"><canvas id="' + base + '-chart-' + slug + '"></canvas></div>' +
                    '<div class="consumo-mini-grid" id="' + base + '-minis-' + slug + '"></div>' +
                    '</div>';
            });
            prep.els.grupos.innerHTML = htmlGrupos;

            // gráficos + mini-cards
            nomes.forEach(g => {
                renderConsumoGrafico(ctx, g, grupos[g]);
                renderConsumoMinis(ctx, g, grupos[g]);
            });

            // ── Tabela detalhada ──
            prep.els.tab.innerHTML = consumoHtmlTabela(ctx, grupos, nomes, menorMelhor);
        }

        // ── Subaba COLHEDORAS: gráfico ÚNICO com todas as máquinas, ────────
        //    separadas visualmente por Frente (meta ÚNICA para todas as frentes)
        function renderConsumoColhedorasUnico(ctx) {
            const prep = consumoPrepararSubaba(ctx);
            if (!prep) return;
            const grupos = prep.grupos, nomes = prep.nomes, menorMelhor = prep.menorMelhor;

            renderConsumoChips(null); // chips de grupo são exclusivos da subaba Caminhão

            // ── Meta global única para todas as frentes ──
            // Usa a primeira frente como referência da meta global
            const chaveGlobal = ctx.metrica + '|__global__';
            if (ctx.metas[chaveGlobal] == null) {
                // padrão inicial: média geral de todas as colhedoras
                const todos = nomes.flatMap(g => grupos[g]);
                const mediaGeral = todos.reduce((s, x) => s + x.valor, 0) / (todos.length || 1);
                ctx.metas[chaveGlobal] = Math.round(mediaGeral * 100) / 100;
            }
            // Sincroniza a meta global para todas as frentes
            const metaGlobal = ctx.metas[chaveGlobal];
            nomes.forEach(g => ctx.metas[ctx.metrica + '|' + g] = metaGlobal);

            // ── Cards gerais ──
            prep.els.cards.innerHTML = consumoHtmlCardsGerais(ctx, grupos, nomes, menorMelhor);

            // ── Bloco do gráfico único com input de meta única ──
            prep.els.grupos.innerHTML =
                '<div class="consumo-grupo-bloco">' +
                '<div class="consumo-grupo-header">' +
                '<div class="consumo-grupo-titulo">Colhedoras por Frente <span style="color:#94a3b8;font-weight:700;">(' +
                nomes.reduce((s, g) => s + grupos[g].length, 0) + ' máquinas · ' + nomes.length + ' frentes)</span></div>' +
                '<div class="consumo-meta-box"><label>Meta Frente:</label>' +
                '<input type="number" step="0.01" value="' + metaGlobal + '" ' +
                'oninput="updateConsumoMetaColhedorasGlobal(this.value)">' +
                '</div>' +
                '</div>' +
                '<div class="consumo-chart-wrap" style="height:380px;"><canvas id="consumo-colhedoras-chart-unico"></canvas></div>' +
                '<div id="consumo-colhedoras-frente-labels" class="consumo-frente-labels"></div>' +
                '<div class="consumo-mini-grid" id="consumo-colhedoras-minis-frentes"></div>' +
                '</div>';

            renderConsumoGraficoUnicoColhedoras(ctx, grupos, nomes);
            renderConsumoFrenteLabels(grupos, nomes, menorMelhor, metaGlobal);
            renderConsumoMinisFrentes(ctx, grupos, nomes);

            // ── Tabela detalhada ──
            prep.els.tab.innerHTML = consumoHtmlTabelaColhedoras(ctx, grupos, nomes, menorMelhor);
        }

        // Gráfico único: X = frotas agrupadas por frente; divisórias verticais,
        // rótulo da frente e segmento de meta desenhados por plugin inline.
        function renderConsumoGraficoUnicoColhedoras(ctx, grupos, nomes) {
            const canvas = document.getElementById('consumo-colhedoras-chart-unico');
            if (!canvas) return;
            const chartId = 'consumo-colhedoras-chart-unico';
            if (consumoCharts[chartId]) { consumoCharts[chartId].destroy(); delete consumoCharts[chartId]; }

            const menorMelhor = consumoMenorMelhor(ctx.metrica);

            // Itens em sequência: frentes na ordem, máquinas maior→menor dentro de cada frente
            const itens = [], regioes = [];
            const chaveMeta = ctx.metrica + '|__global__';
            const metaGlobal = ctx.metas[chaveMeta];
            nomes.forEach(g => {
                const ini = itens.length;
                const meta = ctx.metas[ctx.metrica + '|' + g];
                grupos[g].forEach(x => itens.push({ frota: x.frota, grupo: g, valor: x.valor, meta: meta }));
                regioes.push({ nome: g, meta: meta, ini: ini, fim: itens.length - 1 });
            });

            const labels = itens.map(x => x.frota);
            const vals = itens.map(x => x.valor);
            const cores = itens.map(x => {
                const st = getConsumoStatus(x.valor, x.meta, menorMelhor);
                return st.ok === null ? CONSUMO_COR_NEUTRA : (st.ok ? CONSUMO_COR_VERDE : CONSUMO_COR_VERMELHO);
            });

            // Plugin inline: divisórias entre frentes e linha de meta por região (sem rótulo no topo)
            var isDarkCons = document.body.classList.contains('dark-theme');
            var metaLineColor = isDarkCons ? '#94a3b8' : '#1e293b';
            var divColor = isDarkCons ? '#475569' : '#94a3b8';
            var consumoFrentePlugin = {
                id: 'consumoFrentePlugin',
                afterDatasetsDraw: function (chart) {
                    const xs = chart.scales.x, ys = chart.scales.y, c = chart.ctx;
                    if (!xs || !ys || !labels.length) return;
                    const meio = labels.length > 1 ? (xs.getPixelForValue(1) - xs.getPixelForValue(0)) / 2
                        : (xs.right - xs.left) / 2;
                    c.save();
                    regioes.forEach(function (r, idx) {
                        const x0 = xs.getPixelForValue(r.ini) - meio;
                        const x1 = xs.getPixelForValue(r.fim) + meio;
                        // linha de meta por frente
                        if (r.meta != null && !isNaN(r.meta)) {
                            const ym = ys.getPixelForValue(r.meta);
                            if (ym >= ys.top && ym <= ys.bottom) {
                                c.beginPath();
                                c.setLineDash([7, 5]);
                                c.lineWidth = 2;
                                c.strokeStyle = metaLineColor;
                                c.moveTo(x0, ym); c.lineTo(x1, ym);
                                c.stroke();
                                c.setLineDash([]);
                            }
                        }
                        // divisória vertical entre frentes
                        if (idx < regioes.length - 1) {
                            c.beginPath();
                            c.setLineDash([4, 4]);
                            c.lineWidth = 1;
                            c.strokeStyle = divColor;
                            c.moveTo(x1, ys.top); c.lineTo(x1, ys.bottom + 4);
                            c.stroke();
                            c.setLineDash([]);
                        }
                    });
                    c.restore();
                }
            };

            consumoCharts[chartId] = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        type: 'bar',
                        label: ctx.metrica,
                        data: vals,
                        backgroundColor: cores,
                        borderRadius: 6,
                        maxBarThickness: 46,
                        datalabels: {
                            anchor: 'end', align: 'top', clamp: true,
                            color: isDarkCons ? '#f1f5f9' : '#334155', font: { weight: '800', size: 10 },
                            formatter: function (v) { return consumoFmt(v); }
                        }
                    }]
                },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 40 } },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: isDarkCons ? '#334155' : '#1e293b',
                            callbacks: {
                                title: function (items) { return 'Frota ' + items[0].label; },
                                label: function (tt) {
                                    const it = itens[tt.dataIndex];
                                    const st = getConsumoStatus(it.valor, it.meta, menorMelhor);
                                    const dif = (it.meta != null && !isNaN(it.meta)) ? (it.valor - it.meta) : null;
                                    return [
                                        ctx.rotuloGrupo + ': ' + it.grupo,
                                        'Consumo (' + ctx.metrica + '): ' + consumoFmt(it.valor),
                                        'Meta: ' + consumoFmt(it.meta),
                                        'Diferença p/ meta: ' + (dif == null ? '—' : (dif > 0 ? '+' : '') + consumoFmt(dif)),
                                        'Status: ' + st.txt
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { font: { size: 10, weight: '700' }, color: isDarkCons ? '#f1f5f9' : '#64748b', autoSkip: false, maxRotation: 60, minRotation: 0 }, grid: { display: false } },
                        y: { beginAtZero: true, ticks: { font: { size: 10 }, color: isDarkCons ? '#94a3b8' : '#94a3b8' }, grid: { color: isDarkCons ? '#334155' : '#f1f5f9' } }
                    }
                },
                plugins: [consumoFrentePlugin]
            });
        }

        // Labels interativos de frente — abaixo do gráfico, hover destaca o grupo
        function renderConsumoFrenteLabels(grupos, nomes, menorMelhor, metaGlobal) {
            const el = document.getElementById('consumo-colhedoras-frente-labels');
            if (!el) return;
            let html = '';
            nomes.forEach(function (g) {
                const frotas = grupos[g].map(function (x) { return x.frota; }).join(',');
                const slug = consumoSlug(g);
                const total = grupos[g].length;
                const dentro = grupos[g].filter(function (x) {
                    return getConsumoStatus(x.valor, metaGlobal, menorMelhor).ok === true;
                }).length;
                html += '<span class="consumo-frente-label" data-frotas="' + frotas + '" data-slug="' + slug + '" ' +
                    'onmouseenter="consumoFrenteHover(this,true)" onmouseleave="consumoFrenteHover(this,false)">' +
                    consumoEscHtml(g) +
                    '<span class="frente-lbl-info">(' + total + ' · <span style="color:#16a34a;">' + dentro + '</span>/<span style="color:#dc2626;">' + (total - dentro) + '</span>)</span>' +
                    '</span>';
            });
            el.innerHTML = html;
        }

        function consumoFrenteHover(el, ativo) {
            const chart = consumoCharts['consumo-colhedoras-chart-unico'];
            if (!chart) return;
            const frotas = el.getAttribute('data-frotas').split(',');
            const labels = chart.data.labels;
            const ds = chart.data.datasets[0];
            if (!ds || !ds._backup) {
                if (ativo) {
                    ds._backup = ds.backgroundColor.slice();
                    ds.backgroundColor = labels.map(function (l, i) {
                        return frotas.indexOf(l) >= 0 ? ds._backup[i] : 'rgba(203,213,225,0.3)';
                    });
                    chart.update('none');
                }
            } else if (!ativo) {
                ds.backgroundColor = ds._backup;
                delete ds._backup;
                chart.update('none');
            }
            document.querySelectorAll('.consumo-frente-label').forEach(function (b) {
                b.classList.toggle('hover-ativo', ativo && b === el);
            });
        }

        // Atualiza meta global (única para todas as frentes) e re-renderiza
        function updateConsumoMetaColhedorasGlobal(valor) {
            const ctx = consumoGetCtx('colhedoras');
            const num = parseFloat(String(valor).replace(',', '.'));
            const chaveGlobal = ctx.metrica + '|__global__';
            ctx.metas[chaveGlobal] = isNaN(num) ? null : num;
            const metaGlobal = ctx.metas[chaveGlobal];
            consumoSalvarPrefs();
            const { grupos, nomes } = consumoAgruparDados(ctx);
            const menorMelhor = consumoMenorMelhor(ctx.metrica);
            // Sincroniza meta em todas as frentes
            nomes.forEach(function (g) { ctx.metas[ctx.metrica + '|' + g] = metaGlobal; });
            renderConsumoGraficoUnicoColhedoras(ctx, grupos, nomes);
            renderConsumoFrenteLabels(grupos, nomes, menorMelhor, metaGlobal);
            renderConsumoMinisFrentes(ctx, grupos, nomes);
            const elCards = document.getElementById('consumo-colhedoras-cards');
            if (elCards) elCards.innerHTML = consumoHtmlCardsGerais(ctx, grupos, nomes, menorMelhor);
            const elTab = document.getElementById('consumo-colhedoras-tabela');
            if (elTab) elTab.innerHTML = consumoHtmlTabelaColhedoras(ctx, grupos, nomes, menorMelhor);
        }

        // Mini-cards compactos por frente (abaixo do gráfico único)
        function renderConsumoMinisFrentes(ctx, grupos, nomes) {
            const el = document.getElementById('consumo-colhedoras-minis-frentes');
            if (!el) return;
            const menorMelhor = consumoMenorMelhor(ctx.metrica);
            let html = '';
            nomes.forEach(g => {
                const meta = ctx.metas[ctx.metrica + '|' + g];
                const itens = grupos[g];
                const media = itens.reduce((s, x) => s + x.valor, 0) / itens.length;
                const dentro = itens.filter(x => getConsumoStatus(x.valor, meta, menorMelhor).ok === true).length;
                const pct = itens.length ? (dentro / itens.length * 100) : 0;
                html += '<div class="consumo-mini">' +
                    '<div class="consumo-mini-val">' + consumoFmt(media) + '</div>' +
                    '<div class="consumo-mini-lbl">' + consumoEscHtml(g) + ' · ' + itens.length + ' máq.</div>' +
                    '<div style="font-size:10px;font-weight:700;margin-top:4px;">' +
                    '<span style="color:#16a34a;">' + dentro + ' dentro</span> · ' +
                    '<span style="color:#dc2626;">' + (itens.length - dentro) + ' fora</span> · ' +
                    consumoFmt(pct, 0) + '%</div>' +
                    '</div>';
            });
            el.innerHTML = html;
        }

        // ── Cards gerais da subaba ──────────────────────────────────────────
        function consumoHtmlCardsGerais(ctx, grupos, nomes, menorMelhor) {
            const todos = [];
            nomes.forEach(g => {
                const meta = consumoMetaDoGrupo(ctx, g, grupos[g]);
                grupos[g].forEach(x => todos.push({ frota: x.frota, grupo: g, valor: x.valor, meta: meta }));
            });
            if (!todos.length) return '';
            const total = todos.length;
            const media = todos.reduce((s, x) => s + x.valor, 0) / total;
            const dentro = todos.filter(x => getConsumoStatus(x.valor, x.meta, menorMelhor).ok === true).length;
            const fora = total - dentro;
            const pct = total ? (dentro / total * 100) : 0;
            const ord = todos.slice().sort((a, b) => menorMelhor ? a.valor - b.valor : b.valor - a.valor);
            const melhor = ord[0], pior = ord[ord.length - 1];

            return '<div class="consumo-cards-grid">' +
                consumoKpi(total, 'Total de ' + ctx.rotuloItens) +
                consumoKpi(consumoFmt(media), 'Média geral (' + consumoEscHtml(ctx.metrica) + ')') +
                consumoKpi('<span style="color:#16a34a;">' + dentro + '</span>', 'Dentro da meta') +
                consumoKpi('<span style="color:#dc2626;">' + fora + '</span>', 'Fora da meta') +
                consumoKpi(consumoFmt(pct, 1) + '%', 'Aderência à meta') +
                consumoKpi(consumoEscHtml(melhor.frota) + '<div style="font-size:11px;color:#16a34a;">' + consumoFmt(melhor.valor) + '</div>', 'Melhor ' + ctx.rotuloItem) +
                consumoKpi(consumoEscHtml(pior.frota) + '<div style="font-size:11px;color:#dc2626;">' + consumoFmt(pior.valor) + '</div>', 'Pior ' + ctx.rotuloItem) +
                '</div>';
        }
        function consumoKpi(val, lbl) {
            return '<div class="consumo-kpi"><div class="consumo-kpi-val">' + val + '</div><div class="consumo-kpi-lbl">' + lbl + '</div></div>';
        }

        // ── Gráfico de barras por grupo (X = frota, Y = consumo) ────────────
        function renderConsumoGrafico(ctx, grupo, itens) {
            const base = 'consumo-' + ctx.tipo;
            const slug = consumoSlug(grupo);
            const canvas = document.getElementById(base + '-chart-' + slug);
            if (!canvas) return;

            const chartId = base + '-chart-' + slug;
            if (consumoCharts[chartId]) { consumoCharts[chartId].destroy(); delete consumoCharts[chartId]; }

            const menorMelhor = consumoMenorMelhor(ctx.metrica);
            const chave = ctx.metrica + '|' + grupo;
            const meta = ctx.metas[chave];
            const labels = itens.map(x => x.frota);
            const vals = itens.map(x => x.valor);
            const cores = itens.map(x => {
                const st = getConsumoStatus(x.valor, meta, menorMelhor);
                return st.ok === null ? CONSUMO_COR_NEUTRA : (st.ok ? CONSUMO_COR_VERDE : CONSUMO_COR_VERMELHO);
            });

            var isDarkCons2 = document.body.classList.contains('dark-theme');
            var metaLineColor2 = isDarkCons2 ? '#94a3b8' : '#1e293b';
            var dlColor2 = isDarkCons2 ? '#f1f5f9' : '#334155';
            var gridColor2 = isDarkCons2 ? '#334155' : '#f1f5f9';

            const datasets = [{
                type: 'bar',
                label: ctx.metrica,
                data: vals,
                backgroundColor: cores,
                borderRadius: 6,
                maxBarThickness: 46,
                order: 2,
                datalabels: {
                    anchor: 'end', align: 'top', clamp: true,
                    color: dlColor2, font: { weight: '800', size: 10 },
                    formatter: v => consumoFmt(v)
                }
            }];
            if (meta != null && !isNaN(meta)) {
                datasets.unshift({
                    type: 'line',
                    label: 'Meta',
                    data: labels.map(() => meta),
                    borderColor: metaLineColor2,
                    borderDash: [7, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHitRadius: 0,
                    fill: false,
                    order: 1,
                    datalabels: { display: false }
                });
            }

            consumoCharts[chartId] = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: { labels: labels, datasets: datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 18 } },
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: ctxDL => ctxDL.dataset.type === 'bar' },
                        tooltip: {
                            backgroundColor: isDarkCons2 ? '#334155' : '#1e293b',
                            filter: item => item.dataset.type === 'bar',
                            callbacks: {
                                title: items => 'Frota ' + items[0].label,
                                label: tt => {
                                    const v = tt.raw;
                                    const st = getConsumoStatus(v, meta, menorMelhor);
                                    const dif = (meta != null && !isNaN(meta)) ? (v - meta) : null;
                                    return [
                                        ctx.rotuloGrupo + ': ' + grupo,
                                        'Consumo (' + ctx.metrica + '): ' + consumoFmt(v),
                                        'Meta: ' + consumoFmt(meta),
                                        'Diferença p/ meta: ' + (dif == null ? '—' : (dif > 0 ? '+' : '') + consumoFmt(dif)),
                                        'Status: ' + st.txt
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { font: { size: 10, weight: '700' }, color: isDarkCons2 ? '#f1f5f9' : '#64748b', autoSkip: false, maxRotation: 60, minRotation: 0 }, grid: { display: false } },
                        y: { beginAtZero: true, ticks: { font: { size: 10 }, color: isDarkCons2 ? '#94a3b8' : '#94a3b8' }, grid: { color: gridColor2 } }
                    }
                }
            });
        }

        // ── Mini-cards do grupo ─────────────────────────────────────────────
        function renderConsumoMinis(ctx, grupo, itens) {
            const base = 'consumo-' + ctx.tipo;
            const el = document.getElementById(base + '-minis-' + consumoSlug(grupo));
            if (!el) return;
            const menorMelhor = consumoMenorMelhor(ctx.metrica);
            const meta = ctx.metas[ctx.metrica + '|' + grupo];
            const total = itens.length;
            const media = itens.reduce((s, x) => s + x.valor, 0) / total;
            const dentro = itens.filter(x => getConsumoStatus(x.valor, meta, menorMelhor).ok === true).length;
            const fora = total - dentro;
            const pct = total ? (dentro / total * 100) : 0;
            const ord = itens.slice().sort((a, b) => menorMelhor ? a.valor - b.valor : b.valor - a.valor);

            el.innerHTML =
                consumoMini(total, 'Frotas no grupo') +
                consumoMini(consumoFmt(media), 'Média do grupo') +
                consumoMini(consumoEscHtml(ord[0].frota) + ' <span style="color:#16a34a;font-size:11px;">' + consumoFmt(ord[0].valor) + '</span>', 'Melhor frota') +
                consumoMini(consumoEscHtml(ord[ord.length - 1].frota) + ' <span style="color:#dc2626;font-size:11px;">' + consumoFmt(ord[ord.length - 1].valor) + '</span>', 'Pior frota') +
                consumoMini('<span style="color:#16a34a;">' + dentro + '</span>', 'Dentro da meta') +
                consumoMini('<span style="color:#dc2626;">' + fora + '</span>', 'Fora da meta') +
                consumoMini(consumoFmt(pct, 1) + '%', 'Aderência');
        }
        function consumoMini(val, lbl) {
            return '<div class="consumo-mini"><div class="consumo-mini-val">' + val + '</div><div class="consumo-mini-lbl">' + lbl + '</div></div>';
        }

        // ── Tabela detalhada ────────────────────────────────────────────────
        function consumoHtmlTabelaColhedoras(ctx, grupos, nomes, menorMelhor) {
            let linhas = '';
            nomes.forEach(g => {
                const meta = ctx.metas[ctx.metrica + '|' + g];
                grupos[g].forEach(x => {
                    const st = getConsumoStatus(x.valor, meta, menorMelhor);
                    const dif = (meta != null && !isNaN(meta)) ? (x.valor - meta) : null;
                    const badge = st.ok === null
                        ? '<span class="status-badge" style="background:#f1f5f9;color:#64748b;">' + st.txt + '</span>'
                        : '<span class="status-badge ' + (st.ok ? 'consumo-badge-dentro' : 'consumo-badge-fora') + '">' + st.txt + '</span>';
                    const difCls = st.ok === null ? '' : (st.ok ? 'consumo-dif-neg' : 'consumo-dif-pos');
                    linhas += '<tr>' +
                        '<td style="font-weight:700;">' + consumoEscHtml(x.frota) + '</td>' +
                        '<td>' + consumoEscHtml(g) + '</td>' +
                        '<td style="font-weight:700;">' + consumoFmt(x.valor) + '</td>' +
                        '<td class="' + difCls + '">' + (dif == null ? '—' : (dif > 0 ? '+' : '') + consumoFmt(dif)) + '</td>' +
                        '<td>' + badge + '</td>' +
                        '</tr>';
                });
            });
            return '<div class="card">' +
                '<div class="section-title">📋 Detalhamento — Colhedoras (' + consumoEscHtml(ctx.metrica) + ')</div>' +
                '<div class="table-container"><table>' +
                '<thead><tr><th>Frota</th><th>Grupo de Frente</th><th>Consumo</th><th>Diferença p/ meta</th><th>Status</th></tr></thead>' +
                '<tbody>' + linhas + '</tbody>' +
                '</table></div></div>';
        }

        function consumoHtmlTabela(ctx, grupos, nomes, menorMelhor) {
            let linhas = '';
            nomes.forEach(g => {
                const meta = ctx.metas[ctx.metrica + '|' + g];
                grupos[g].forEach(x => {
                    const st = getConsumoStatus(x.valor, meta, menorMelhor);
                    const dif = (meta != null && !isNaN(meta)) ? (x.valor - meta) : null;
                    const badge = st.ok === null
                        ? '<span class="status-badge" style="background:#f1f5f9;color:#64748b;">' + st.txt + '</span>'
                        : '<span class="status-badge ' + (st.ok ? 'consumo-badge-dentro' : 'consumo-badge-fora') + '">' + st.txt + '</span>';
                    const difCls = st.ok === null ? '' : (st.ok ? 'consumo-dif-neg' : 'consumo-dif-pos');
                    linhas += '<tr>' +
                        '<td style="font-weight:700;">' + consumoEscHtml(x.frota) + '</td>' +
                        '<td>' + consumoEscHtml(g) + '</td>' +
                        '<td style="font-weight:700;">' + consumoFmt(x.valor) + '</td>' +
                        '<td>' + consumoFmt(meta) + '</td>' +
                        '<td class="' + difCls + '">' + (dif == null ? '—' : (dif > 0 ? '+' : '') + consumoFmt(dif)) + '</td>' +
                        '<td>' + badge + '</td>' +
                        '</tr>';
                });
            });
            return '<div class="card">' +
                '<div class="section-title">📋 Detalhamento — ' + (ctx.tipo === 'caminhao' ? 'Caminhões' : 'Colhedoras') + ' (' + consumoEscHtml(ctx.metrica) + ')</div>' +
                '<div class="table-container"><table>' +
                '<thead><tr><th>Frota</th><th>' + ctx.rotuloGrupo + '</th><th>Consumo</th><th>Meta</th><th>Diferença p/ meta</th><th>Status</th></tr></thead>' +
                '<tbody>' + linhas + '</tbody>' +
                '</table></div></div>';
        }

        // ── Atualização de meta (re-render parcial, sem perder o foco) ──────
        function updateConsumoMetaCaminhao(grupo, valor) { consumoAtualizarMeta('caminhao', grupo, valor); }
        function updateConsumoMetaColhedoras(grupo, valor) { consumoAtualizarMeta('colhedoras', grupo, valor); }

        function consumoAtualizarMeta(tipo, grupo, valor) {
            const ctx = consumoGetCtx(tipo);
            const num = parseFloat(String(valor).replace(',', '.'));
            ctx.metas[ctx.metrica + '|' + grupo] = isNaN(num) ? null : num;
            consumoSalvarPrefs();

            const { grupos, nomes } = consumoAgruparDados(ctx);
            if (!grupos[grupo]) return;
            const menorMelhor = consumoMenorMelhor(ctx.metrica);

            if (tipo === 'colhedoras') {
                // Usa a meta global única (sincroniza para todas as frentes antes de re-renderizar)
                const chaveGlobal = ctx.metrica + '|__global__';
                ctx.metas[chaveGlobal] = isNaN(num) ? null : num;
                nomes.forEach(g => ctx.metas[ctx.metrica + '|' + g] = ctx.metas[chaveGlobal]);
                // gráfico único + resumo por frente
                renderConsumoGraficoUnicoColhedoras(ctx, grupos, nomes);
                renderConsumoFrenteLabels(grupos, nomes, menorMelhor, ctx.metas[chaveGlobal]);
                renderConsumoMinisFrentes(ctx, grupos, nomes);
                const elCards = document.getElementById('consumo-colhedoras-cards');
                if (elCards) elCards.innerHTML = consumoHtmlCardsGerais(ctx, grupos, nomes, menorMelhor);
                const elTab = document.getElementById('consumo-colhedoras-tabela');
                if (elTab) elTab.innerHTML = consumoHtmlTabelaColhedoras(ctx, grupos, nomes, menorMelhor);
                return;
            }

            // caminhão: re-renderiza só o bloco do grupo + cards/tabela (respeitando o chip ativo)
            renderConsumoGrafico(ctx, grupo, grupos[grupo]);
            renderConsumoMinis(ctx, grupo, grupos[grupo]);
            const nomesVis = (consumoFiltroGrupoCaminhao !== 'TODOS')
                ? nomes.filter(g => g === consumoFiltroGrupoCaminhao)
                : nomes;
            const elCards = document.getElementById('consumo-' + tipo + '-cards');
            if (elCards) elCards.innerHTML = consumoHtmlCardsGerais(ctx, grupos, nomesVis, menorMelhor);
            const elTab = document.getElementById('consumo-' + tipo + '-tabela');
            if (elTab) elTab.innerHTML = consumoHtmlTabela(ctx, grupos, nomesVis, menorMelhor);
        }

        function consumoTrocarMetrica(tipo, metrica) {
            if (tipo === 'caminhao') consumoMetricaCaminhao = metrica; else consumoMetricaColhedoras = metrica;
            consumoSalvarPrefs();
            renderConsumoSubaba(tipo);
        }

        let consumoSafraAtivo = false;
        function consumoToggleSafra() {
            consumoSafraAtivo = !consumoSafraAtivo;
            const btn = document.getElementById('consumo-btn-safra');
            const info = document.getElementById('consumo-safra-info');
            if (btn) btn.classList.toggle('active', consumoSafraAtivo);
            if (info) info.style.display = consumoSafraAtivo ? 'block' : 'none';
        }

        // ── Exportação CSV ──────────────────────────────────────────────────
        function exportConsumoCaminhaoCSV() { consumoExportCSV('caminhao', 'consumo_caminhao.csv'); }
        function exportConsumoColhedorasCSV() { consumoExportCSV('colhedoras', 'consumo_colhedoras.csv'); }

        function consumoExportCSV(tipo, nomeArquivo) {
            const ctx = consumoGetCtx(tipo);
            if (!ctx.dados.length || !ctx.metrica) { if (typeof showToast === 'function') showToast('⚠️ Sem dados de consumo para exportar', '#dc2626'); return; }
            const menorMelhor = consumoMenorMelhor(ctx.metrica);
            const agr = consumoAgruparDados(ctx);
            const grupos = agr.grupos;
            const nomes = (tipo === 'caminhao' && consumoFiltroGrupoCaminhao !== 'TODOS')
                ? agr.nomes.filter(g => g === consumoFiltroGrupoCaminhao)
                : agr.nomes;
            const sep = ';';
            const num = n => (n == null || isNaN(n)) ? '' : String(Math.round(n * 10000) / 10000).replace('.', ',');
            let csv = ['Frota', ctx.rotuloGrupo, 'Consumo (' + ctx.metrica + ')', 'Meta', 'Diferença p/ meta', 'Status'].join(sep) + '\r\n';
            nomes.forEach(g => {
                const meta = ctx.metas[ctx.metrica + '|' + g];
                grupos[g].forEach(x => {
                    const st = getConsumoStatus(x.valor, meta, menorMelhor);
                    const dif = (meta != null && !isNaN(meta)) ? (x.valor - meta) : null;
                    csv += [x.frota, '"' + g.replace(/"/g, '""') + '"', num(x.valor), num(meta), num(dif), st.txt].join(sep) + '\r\n';
                });
            });
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = nomeArquivo;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            if (typeof showToast === 'function') showToast('✅ ' + nomeArquivo + ' exportado!', '#16a34a');
        }


