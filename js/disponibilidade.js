        //  MÓDULO DISPONIBILIDADE (novo — isolado, prefixo "disponibilidade" / "disp")
        //  Fonte: PDF "OS OFICINA GERAL" + classificações CAMINHÃO.xlsx / Colhedoras.xlsx
        // ═══════════════════════════════════════════════════════════════════

        let disponibilidadeArquivoPdf = null;
        let disponibilidadeArquivos = { pdf: null, classCam: null, classCol: null };
        let disponibilidadeData = []; // [{frota,equipamento,os,diasParados,ic,disp,atend,perm,trabalho,custoMo,totalPecas}]
        let disponibilidadePeriodo = '';
        let disponibilidadeDataRelatorio = '';
        let disponibilidadeHoraRelatorio = '';
        let disponibilidadeCharts = {};
        let disponibilidadeMetasCaminhao = {};
        let disponibilidadeMetasColhedoras = {};
        let disponibilidadeAbaAtiva = 'caminhao';
        let disponibilidadeFiltroGrupoCaminhao = 'TODOS';
        let disponibilidadeFiltroGrupoColhedoras = 'TODOS';
        let disponibilidadeProcessado = false;

        const DISP_SEM_CLASSIF = 'SEM CLASSIFICAÇÃO';
        const DISP_COR_VERDE = '#16a34a';
        const DISP_COR_VERMELHO = '#dc2626';

        function disponibilidadeIdentificarArquivo(nome) {
            const s = String(nome || '').toLowerCase();
            const n = consumoNormalizarTexto(s.replace(/\.(pdf|xlsx?|xlsm)$/i, ''));
            if (/\.pdf$/i.test(s)) {
                if (n.includes('osoficinageral') || n.includes('oficinageral') || n.includes('analiseeficiencia') || n.includes('controleoficinas')) return 'pdf';
                return null;
            }
            // A aba DISPONIBILIDADE usa as mesmas planilhas de classificação do módulo CONSUMO.
            // Aqui ela também reconhece diretamente, para não depender de outro módulo ter renderizado antes.
            if (/\.(xlsx?|xlsm)$/i.test(s)) {
                const tipoCons = consumoIdentificarArquivo(nome);
                if (tipoCons === 'classCam') return 'classCam';
                if (tipoCons === 'classCol') return 'classCol';
            }
            return null;
        }

        function disponibilidadeResetArquivos() {
            disponibilidadeArquivos = { pdf: null, classCam: null, classCol: null };
            disponibilidadeArquivoPdf = null;
            disponibilidadeData = [];
            disponibilidadePeriodo = '';
            disponibilidadeDataRelatorio = '';
            disponibilidadeHoraRelatorio = '';
            disponibilidadeProcessado = false;
        }

        function disponibilidadeParsePtNumber(v) {
            if (v == null || v === '') return null;
            const s = String(v).trim().replace(/\./g, '').replace(',', '.');
            const n = parseFloat(s);
            return isNaN(n) ? null : n;
        }

        function disponibilidadeFmt(n, dec = 1) {
            if (n == null || isNaN(n)) return '—';
            return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        }

        function disponibilidadeStatus(valor, meta) {
            if (valor == null || isNaN(valor)) return { ok: null, txt: '—' };
            if (meta == null || isNaN(meta)) return { ok: null, txt: 'Sem meta' };
            const ok = valor >= meta; // Disponibilidade: maior é melhor
            return { ok, txt: ok ? 'Dentro da meta' : 'Fora da meta' };
        }

        function disponibilidadeMeta(ctx, grupo) {
            const key = grupo;
            if (ctx.metas[key] == null || isNaN(ctx.metas[key])) ctx.metas[key] = 90;
            return ctx.metas[key];
        }

        // ── Persistência das metas da aba DISPONIBILIDADE ───────────────────
        // Salva por tipo + grupo no navegador. Assim a meta continua igual após
        // trocar de aba, recarregar o HTML ou selecionar a pasta novamente.
        function disponibilidadeSalvarPrefs() {
            try {
                localStorage.setItem('disponibilidadePrefsV1', JSON.stringify({
                    metasCam: disponibilidadeMetasCaminhao,
                    metasCol: disponibilidadeMetasColhedoras
                }));
            } catch (_) { }
        }

        function disponibilidadeCarregarPrefs() {
            try {
                const p = JSON.parse(localStorage.getItem('disponibilidadePrefsV1') || 'null');
                if (!p) return;
                if (p.metasCam && typeof p.metasCam === 'object') disponibilidadeMetasCaminhao = p.metasCam;
                if (p.metasCol && typeof p.metasCol === 'object') disponibilidadeMetasColhedoras = p.metasCol;
            } catch (_) { }
        }

        function disponibilidadeClassificarFrota(tipo, frota) {
            const mapa = tipo === 'caminhao' ? consumoClassificacaoCaminhao : consumoClassificacaoColhedoras;
            return mapa[frota] || DISP_SEM_CLASSIF;
        }

        async function disponibilidadeExtrairTextoPdf(file) {
            if (!file) return '';
            if (!window.pdfjsLib) throw new Error('Biblioteca PDF.js não carregada.');
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            const data = new Uint8Array(await file.arrayBuffer());
            const pdf = await pdfjsLib.getDocument({ data }).promise;
            let texto = '';
            for (let p = 1; p <= pdf.numPages; p++) {
                const page = await pdf.getPage(p);
                const tc = await page.getTextContent();
                const items = tc.items.map(it => ({ str: String(it.str || '').trim(), x: it.transform[4], y: it.transform[5] })).filter(it => it.str);
                items.sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);
                const linhas = [];
                for (const it of items) {
                    let linha = linhas.find(l => Math.abs(l.y - it.y) <= 2);
                    if (!linha) { linha = { y: it.y, itens: [] }; linhas.push(linha); }
                    linha.itens.push(it);
                }
                linhas.sort((a, b) => b.y - a.y);
                texto += '\n' + linhas.map(l => l.itens.sort((a, b) => a.x - b.x).map(i => i.str).join(' ')).join('\n');
            }
            return texto;
        }

        function disponibilidadeExtrairCabecalho(texto) {
            const clean = String(texto || '').replace(/\s+/g, ' ');
            const periodo = clean.match(/Per[ií]odo\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*\d{1,2}:\d{2}:\d{2}\s*[àa]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*\d{1,2}:\d{2}:\d{2}/i);
            const data = clean.match(/Data\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
            const hora = clean.match(/Hora\s*:\s*(\d{1,2}:\d{2}:\d{2})/i);
            const fmt = (d) => consumoFormatarDataCabecalho(d);
            disponibilidadePeriodo = periodo ? (fmt(periodo[1]) + ' a ' + fmt(periodo[2])) : '';
            disponibilidadeDataRelatorio = data ? fmt(data[1]) : '';
            disponibilidadeHoraRelatorio = hora ? hora[1] : '';
        }

        function disponibilidadeParsePdf(texto) {
            disponibilidadeExtrairCabecalho(texto);
            const linhas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const regs = [];
            const rowRe = /^(\d{1,9})\s+(.+?)\s+(\d+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+(\d{1,5}:\d{2})\s+(\d{1,5}:\d{2})\s+([\d.,]+)\s+([\d.,]+)$/;
            for (const linha of linhas) {
                if (/^(USINA|Controle|An[aá]lise|Data:|Hora:|Per[ií]odo:|Quantidade|Eqp\b|rptAnalise)/i.test(linha)) continue;
                const m = linha.match(rowRe);
                if (!m) continue;
                regs.push({
                    frota: normalizarFrotaConsumo(m[1]),
                    equipamento: m[2].trim(),
                    qtdEqp: parseInt(m[3], 10) || 0,
                    os: parseInt(m[4], 10) || 0,
                    diasParados: disponibilidadeParsePtNumber(m[5]),
                    ic: disponibilidadeParsePtNumber(m[6]),
                    disp: disponibilidadeParsePtNumber(m[7]),
                    atend: disponibilidadeParsePtNumber(m[8]),
                    perm: m[9],
                    trabalho: m[10],
                    custoMo: disponibilidadeParsePtNumber(m[11]),
                    totalPecas: disponibilidadeParsePtNumber(m[12])
                });
            }
            return regs.filter(r => r.frota && r.disp != null && !isNaN(r.disp));
        }

        async function processDisponibilidadeFiles() {
            disponibilidadeCarregarPrefs();
            disponibilidadeProcessado = true;
            disponibilidadeData = [];
            disponibilidadePeriodo = '';
            disponibilidadeDataRelatorio = '';
            disponibilidadeHoraRelatorio = '';
            disponibilidadeArquivoPdf = disponibilidadeArquivos.pdf;
            try {
                // Garante classificação mesmo quando a pasta não tem arquivos de consumo.
                // Sem isso, a aba mostrava "classificação não encontrada" mesmo com CAMINHÃO.xlsx / Colhedoras.xlsx na pasta.
                if ((!consumoClassificacaoCaminhao || !Object.keys(consumoClassificacaoCaminhao).length) && disponibilidadeArquivos.classCam) {
                    const json = await readXlsxFile(disponibilidadeArquivos.classCam, true);
                    consumoClassificacaoCaminhao = consumoParseClassificacao(json, 'caminhao');
                    if (!consumoArquivos.classCam) consumoArquivos.classCam = disponibilidadeArquivos.classCam;
                }
                if ((!consumoClassificacaoColhedoras || !Object.keys(consumoClassificacaoColhedoras).length) && disponibilidadeArquivos.classCol) {
                    const json = await readXlsxFile(disponibilidadeArquivos.classCol, true);
                    consumoClassificacaoColhedoras = consumoParseClassificacao(json, 'colhedoras');
                    if (!consumoArquivos.classCol) consumoArquivos.classCol = disponibilidadeArquivos.classCol;
                }

                if (disponibilidadeArquivoPdf) {
                    const texto = await disponibilidadeExtrairTextoPdf(disponibilidadeArquivoPdf);
                    disponibilidadeData = disponibilidadeParsePdf(texto);
                }
            } catch (err) {
                console.warn('DISPONIBILIDADE: falha ao ler PDF/classificações:', err);
                disponibilidadeData = [];
            }
            const aba = document.getElementById('main-disponibilidade');
            if (aba && aba.classList.contains('active')) renderDisponibilidade();
        }

        async function processTortaFiles(tortaFile) {
            if (!tortaFile) { tortaData = []; renderTorta(); return; }
            try {
                const json = await readXlsxFile(tortaFile, true);
                processTortaData(json);
            } catch (err) {
                console.warn('TORTA: falha ao ler:', err);
                tortaData = [];
            }
            const aba = document.getElementById('main-torta');
            if (aba && aba.classList.contains('active')) renderTorta();
        }

        function disponibilidadeGetCtx(tipo) {
            const cam = tipo === 'caminhao';
            const classif = cam ? consumoClassificacaoCaminhao : consumoClassificacaoColhedoras;
            const dados = disponibilidadeData
                .filter(r => classif[r.frota])
                .map(r => ({ ...r, grupo: disponibilidadeClassificarFrota(tipo, r.frota) }));
            return {
                tipo,
                dados,
                metas: cam ? disponibilidadeMetasCaminhao : disponibilidadeMetasColhedoras,
                classif,
                rotuloGrupo: cam ? 'Equipe/Grupo' : 'Grupo de Frente',
                rotuloItem: cam ? 'caminhão' : 'colhedora',
                rotuloItens: cam ? 'caminhões' : 'colhedoras'
            };
        }

        function disponibilidadeAgrupar(ctx) {
            const grupos = {};
            ctx.dados.forEach(d => (grupos[d.grupo] = grupos[d.grupo] || []).push(d));
            Object.values(grupos).forEach(arr => arr.sort((a, b) => a.disp - b.disp)); // pior → melhor
            const nomes = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
            return { grupos, nomes };
        }

        // Chips de grupo/equipe — mesmo comportamento visual da aba CONSUMO.
        function renderDisponibilidadeChips(ctx, nomes, grupos) {
            const box = document.getElementById('disp-grupo-chips');
            if (!box) return;
            if (!ctx || !nomes || !nomes.length) { box.innerHTML = ''; return; }

            const filtroAtual = ctx.tipo === 'caminhao' ? disponibilidadeFiltroGrupoCaminhao : disponibilidadeFiltroGrupoColhedoras;
            if (filtroAtual !== 'TODOS' && nomes.indexOf(filtroAtual) < 0) {
                if (ctx.tipo === 'caminhao') disponibilidadeFiltroGrupoCaminhao = 'TODOS';
                else disponibilidadeFiltroGrupoColhedoras = 'TODOS';
            }

            const filtro = ctx.tipo === 'caminhao' ? disponibilidadeFiltroGrupoCaminhao : disponibilidadeFiltroGrupoColhedoras;
            const total = nomes.reduce((s, g) => s + grupos[g].length, 0);
            let html = '<button class="consumo-chip' + (filtro === 'TODOS' ? ' active' : '') + '" onclick="disponibilidadeFiltrarGrupo(\'' + ctx.tipo + '\', \'TODOS\')">Todos<span class="chip-qtd">' + total + '</span></button>';
            nomes.forEach(g => {
                const gJs = String(g).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                html += '<button class="consumo-chip' + (filtro === g ? ' active' : '') + '" onclick="disponibilidadeFiltrarGrupo(\'' + ctx.tipo + '\', \'' + gJs + '\')">' + consumoEscHtml(g) + '<span class="chip-qtd">' + grupos[g].length + '</span></button>';
            });
            box.innerHTML = html;
        }


        function disponibilidadeFiltrarGrupo(tipo, grupo) {
            if (tipo === 'caminhao') disponibilidadeFiltroGrupoCaminhao = grupo;
            else disponibilidadeFiltroGrupoColhedoras = grupo;
            renderDisponibilidadeTipo(disponibilidadeGetCtx(tipo));
        }

        function switchDisponibilidadeTab(tipo) {
            disponibilidadeAbaAtiva = tipo;
            document.querySelectorAll('#main-disponibilidade .consumo-tab').forEach(t => t.classList.remove('active'));
            const btn = document.getElementById('disp-tab-' + tipo); if (btn) btn.classList.add('active');
            document.querySelectorAll('.disp-content').forEach(c => c.classList.remove('active'));
            const cont = document.getElementById('disp-' + tipo); if (cont) cont.classList.add('active');
            renderDisponibilidade();
        }

        function destroyDisponibilidadeCharts(prefix) {
            Object.keys(disponibilidadeCharts).forEach(k => {
                if (!prefix || k.startsWith(prefix)) {
                    try { disponibilidadeCharts[k].destroy(); } catch (_) { }
                    delete disponibilidadeCharts[k];
                }
            });
        }

        function renderDisponibilidade() {
            disponibilidadeCarregarPrefs();
            const badge = document.getElementById('disp-periodo-badge');
            if (badge) {
                const partes = [];
                if (disponibilidadePeriodo) partes.push('Período: <strong>' + consumoEscHtml(disponibilidadePeriodo) + '</strong>');
                if (disponibilidadeDataRelatorio) partes.push('Emitido: <strong>' + consumoEscHtml(disponibilidadeDataRelatorio) + (disponibilidadeHoraRelatorio ? ' ' + consumoEscHtml(disponibilidadeHoraRelatorio) : '') + '</strong>');
                badge.style.display = partes.length ? 'inline-flex' : 'none';
                badge.innerHTML = partes.join(' &nbsp;|&nbsp; ');
            }
            const status = document.getElementById('disp-files-status');
            if (status) {
                status.innerHTML = disponibilidadeArquivoPdf
                    ? '<div class="consumo-msg-info">✅ PDF de oficina carregado: <strong>' + consumoEscHtml(disponibilidadeArquivoPdf.name) + '</strong>' + (disponibilidadePeriodo ? ' | ' + consumoEscHtml(disponibilidadePeriodo) : '') + '</div>'
                    : '<div class="consumo-msg-warn">⚠️ Arquivo PDF de disponibilidade não encontrado. Coloque na pasta um PDF como <strong>OS OFICINA GERAL.pdf</strong>.</div>';
            }
            renderDisponibilidadeTipo(disponibilidadeGetCtx(disponibilidadeAbaAtiva));
        }

        function renderDisponibilidadeTipo(ctx) {
            const base = 'disp-' + ctx.tipo;
            const els = {
                msg: document.getElementById(base + '-msg'),
                tool: document.getElementById(base + '-toolbar'),
                cards: document.getElementById(base + '-cards'),
                grupos: document.getElementById(base + '-grupos'),
                tab: document.getElementById(base + '-tabela')
            };
            if (!els.grupos) return;
            destroyDisponibilidadeCharts(base);
            els.msg.innerHTML = ''; els.tool.innerHTML = ''; els.cards.innerHTML = ''; els.grupos.innerHTML = ''; els.tab.innerHTML = '';
            renderDisponibilidadeChips(null);

            if (!disponibilidadeArquivoPdf) {
                els.msg.innerHTML = '<div class="consumo-msg-info">Selecione a pasta com o PDF <strong>OS OFICINA GERAL.pdf</strong> para montar a disponibilidade.</div>';
                return;
            }
            if (!Object.keys(ctx.classif || {}).length) {
                els.msg.innerHTML = '<div class="consumo-msg-warn">⚠️ Classificação de ' + ctx.rotuloItens + ' não encontrada. A aba usa a mesma planilha de classificação do módulo CONSUMO.</div>';
                return;
            }
            if (!ctx.dados.length) {
                els.msg.innerHTML = '<div class="consumo-msg-warn">⚠️ Nenhuma frota do PDF cruzou com a classificação de ' + ctx.rotuloItens + '.</div>';
                return;
            }

            const { grupos, nomes: todosNomes } = disponibilidadeAgrupar(ctx);
            renderDisponibilidadeChips(ctx, todosNomes, grupos);
            const filtroGrupo = ctx.tipo === 'caminhao' ? disponibilidadeFiltroGrupoCaminhao : disponibilidadeFiltroGrupoColhedoras;
            const nomes = filtroGrupo && filtroGrupo !== 'TODOS' ? todosNomes.filter(g => g === filtroGrupo) : todosNomes;
            els.tool.innerHTML = '<div class="consumo-toolbar">' +
                '<strong style="font-size:12px;color:#334155;">Indicador: Disponibilidade (%)</strong>' +
                '<span style="font-size:11px;font-weight:800;color:#0891b2;">▲ Maior é melhor</span>' +
                '<div class="consumo-legenda"><span class="leg-verde">Dentro da meta</span><span class="leg-vermelho">Fora da meta</span><span class="leg-meta">Linha de meta</span></div>' +
                '<button class="consumo-btn-csv" onclick="exportDisponibilidadeCSV(\'' + ctx.tipo + '\')">⬇️ Exportar CSV</button>' +
                '</div>';
            els.cards.innerHTML = disponibilidadeHtmlCards(ctx, grupos, nomes);

            let htmlGrupos = '';
            nomes.forEach(g => {
                const slug = consumoSlug(g);
                const meta = disponibilidadeMeta(ctx, g);
                const gJs = String(g).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                htmlGrupos += '<div class="consumo-grupo-bloco">' +
                    '<div class="consumo-grupo-header">' +
                    '<div class="consumo-grupo-titulo">' + consumoEscHtml(g) + ' <span style="color:#94a3b8;font-weight:700;">(' + grupos[g].length + ')</span></div>' +
                    '<div class="consumo-meta-box"><label>Meta ' + consumoEscHtml(g) + ':</label>' +
                    '<input type="number" step="0.1" min="0" max="100" value="' + meta + '" ' +
                    'oninput="disponibilidadeSalvarMeta(\'' + ctx.tipo + '\', \'' + gJs + '\', this.value)" ' +
                    'onchange="updateDisponibilidadeMeta(\'' + ctx.tipo + '\', \'' + gJs + '\', this.value)" ' +
                    'onkeydown="if(event.key===\'Enter\'){this.blur();}">' +
                    '</div></div>' +
                    '<div class="consumo-chart-wrap"><canvas id="' + base + '-chart-' + slug + '"></canvas></div>' +
                    '<div class="consumo-mini-grid" id="' + base + '-minis-' + slug + '"></div>' +
                    '</div>';
            });
            els.grupos.innerHTML = htmlGrupos;
            nomes.forEach(g => {
                renderDisponibilidadeGrafico(ctx, g, grupos[g]);
                renderDisponibilidadeMinis(ctx, g, grupos[g]);
            });
            els.tab.innerHTML = disponibilidadeHtmlTabela(ctx, grupos, nomes);
        }


        function disponibilidadeHtmlCards(ctx, grupos, nomes) {
            const todos = nomes.flatMap(g => grupos[g]);
            const media = todos.reduce((s, x) => s + x.disp, 0) / (todos.length || 1);
            const melhor = todos.reduce((a, b) => !a || b.disp > a.disp ? b : a, null);
            const pior = todos.reduce((a, b) => !a || b.disp < a.disp ? b : a, null);
            let dentro = 0, fora = 0, osTotal = 0, custoTotal = 0;
            todos.forEach(x => {
                const meta = disponibilidadeMeta(ctx, x.grupo);
                const st = disponibilidadeStatus(x.disp, meta);
                if (st.ok === true) dentro++; else if (st.ok === false) fora++;
                osTotal += x.os || 0;
                custoTotal += (x.custoMo || 0) + (x.totalPecas || 0);
            });
            const ader = todos.length ? (dentro / todos.length * 100) : 0;
            return '<div class="consumo-cards-grid">' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val">' + todos.length + '</div><div class="consumo-kpi-lbl">Frotas analisadas</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val">' + disponibilidadeFmt(media, 1) + '%</div><div class="consumo-kpi-lbl">Disponibilidade média</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="color:#16a34a;">' + dentro + '</div><div class="consumo-kpi-lbl">Dentro da meta</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="color:#dc2626;">' + fora + '</div><div class="consumo-kpi-lbl">Fora da meta</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val">' + disponibilidadeFmt(ader, 1) + '%</div><div class="consumo-kpi-lbl">Aderência</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val">' + osTotal + '</div><div class="consumo-kpi-lbl">O.S. total</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="font-size:18px;">' + (melhor ? melhor.frota + ' - ' + disponibilidadeFmt(melhor.disp, 1) + '%' : '—') + '</div><div class="consumo-kpi-lbl">Melhor frota</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="font-size:18px;color:#dc2626;">' + (pior ? pior.frota + ' - ' + disponibilidadeFmt(pior.disp, 1) + '%' : '—') + '</div><div class="consumo-kpi-lbl">Pior frota</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="font-size:18px;">R$ ' + disponibilidadeFmt(custoTotal, 2) + '</div><div class="consumo-kpi-lbl">M.O. + peças</div></div>' +
                '</div>';
        }

        function renderDisponibilidadeGrafico(ctx, grupo, arr) {
            var isDark = document.body.classList.contains('dark-theme');
            var dispTc = isDark ? '#f1f5f9' : '#64748b';
            var dispTc2 = isDark ? '#94a3b8' : '#94a3b8';
            var dispGrid = isDark ? '#334155' : '#f1f5f9';
            var dispMetaLine = isDark ? '#94a3b8' : '#1e293b';
            var dispTooltip = isDark ? '#334155' : '#1e293b';
            const base = 'disp-' + ctx.tipo;
            const id = base + '-chart-' + consumoSlug(grupo);
            const canvas = document.getElementById(id);
            if (!canvas) return;
            const meta = disponibilidadeMeta(ctx, grupo);
            if (disponibilidadeCharts[id]) { disponibilidadeCharts[id].destroy(); delete disponibilidadeCharts[id]; }
            disponibilidadeCharts[id] = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: arr.map(x => x.frota),
                    datasets: [
                        { type: 'bar', label: 'Disponibilidade (%)', data: arr.map(x => x.disp), backgroundColor: arr.map(x => x.disp >= meta ? DISP_COR_VERDE : DISP_COR_VERMELHO), borderRadius: 6 },
                        { type: 'line', label: 'Meta', data: arr.map(() => meta), borderColor: dispMetaLine, borderWidth: 2, borderDash: [6, 5], pointRadius: 0, fill: false }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, labels: { color: dispTc } },
                        datalabels: { display: false },
                        tooltip: {
                            backgroundColor: dispTooltip,
                            callbacks: { afterBody: (items) => {
                            const idx = items[0].dataIndex;
                            const x = arr[idx];
                            const st = disponibilidadeStatus(x.disp, meta);
                            return ['Grupo: ' + x.grupo, 'Meta: ' + disponibilidadeFmt(meta, 1) + '%', 'Dif.: ' + disponibilidadeFmt(x.disp - meta, 1) + ' p.p.', 'Status: ' + st.txt, 'O.S.: ' + x.os, 'Dias parados: ' + disponibilidadeFmt(x.diasParados, 2)];
                        } } }
                    },
                    scales: { y: { beginAtZero: true, max: 100, ticks: { color: dispTc2, callback: v => v + '%' }, grid: { color: dispGrid } }, x: { ticks: { color: dispTc, maxRotation: 45, minRotation: 0 } } }
                }
            });
        }

        function renderDisponibilidadeMinis(ctx, grupo, arr) {
            const el = document.getElementById('disp-' + ctx.tipo + '-minis-' + consumoSlug(grupo));
            if (!el) return;
            const meta = disponibilidadeMeta(ctx, grupo);
            const media = arr.reduce((s, x) => s + x.disp, 0) / (arr.length || 1);
            const melhor = arr.reduce((a, b) => !a || b.disp > a.disp ? b : a, null);
            const pior = arr.reduce((a, b) => !a || b.disp < a.disp ? b : a, null);
            const dentro = arr.filter(x => x.disp >= meta).length;
            const osTotal = arr.reduce((s, x) => s + (x.os || 0), 0);
            el.innerHTML = '<div class="consumo-mini"><div class="consumo-mini-val">' + arr.length + '</div><div class="consumo-mini-lbl">Frotas</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val">' + disponibilidadeFmt(media, 1) + '%</div><div class="consumo-mini-lbl">Média</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val" style="color:#16a34a;">' + dentro + '</div><div class="consumo-mini-lbl">Dentro</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val" style="color:#dc2626;">' + (arr.length - dentro) + '</div><div class="consumo-mini-lbl">Fora</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val">' + osTotal + '</div><div class="consumo-mini-lbl">O.S.</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val">' + (melhor ? melhor.frota + ' - ' + disponibilidadeFmt(melhor.disp, 1) + '%' : '—') + '</div><div class="consumo-mini-lbl">Melhor</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val" style="color:#dc2626;">' + (pior ? pior.frota + ' - ' + disponibilidadeFmt(pior.disp, 1) + '%' : '—') + '</div><div class="consumo-mini-lbl">Pior</div></div>';
        }

        function disponibilidadeHtmlTabela(ctx, grupos, nomes) {
            let rows = '';
            nomes.forEach(g => grupos[g].forEach(x => {
                const meta = disponibilidadeMeta(ctx, g);
                const st = disponibilidadeStatus(x.disp, meta);
                rows += '<tr>' +
                    '<td>' + consumoEscHtml(x.frota) + '</td>' +
                    '<td>' + consumoEscHtml(x.equipamento) + '</td>' +
                    '<td>' + consumoEscHtml(g) + '</td>' +
                    '<td>' + disponibilidadeFmt(x.disp, 1) + '%</td>' +
                    '<td>' + disponibilidadeFmt(meta, 1) + '%</td>' +
                    '<td class="' + ((x.disp - meta) >= 0 ? 'consumo-dif-neg' : 'consumo-dif-pos') + '">' + disponibilidadeFmt(x.disp - meta, 1) + ' p.p.</td>' +
                    '<td>' + (x.os || 0) + '</td>' +
                    '<td>' + disponibilidadeFmt(x.diasParados, 2) + '</td>' +
                    '<td>R$ ' + disponibilidadeFmt((x.custoMo || 0) + (x.totalPecas || 0), 2) + '</td>' +
                    '<td><span class="status-badge ' + (st.ok ? 'consumo-badge-dentro' : 'consumo-badge-fora') + '">' + st.txt + '</span></td>' +
                    '</tr>';
            }));
            return '<div class="card"><div class="section-title">📋 Detalhamento de Disponibilidade</div><div class="table-container"><table>' +
                '<thead><tr><th>Frota</th><th>Equipamento</th><th>' + ctx.rotuloGrupo + '</th><th>Disp.</th><th>Meta</th><th>Dif.</th><th>O.S.</th><th>Dias Parados</th><th>Custo Total</th><th>Status</th></tr></thead>' +
                '<tbody>' + rows + '</tbody></table></div></div>';
        }

        function disponibilidadeSalvarMeta(tipo, grupo, valor) {
            const ctx = disponibilidadeGetCtx(tipo);
            const raw = String(valor == null ? '' : valor).replace(',', '.');
            const v = parseFloat(raw);
            if (!isNaN(v)) {
                ctx.metas[grupo] = v;
                disponibilidadeSalvarPrefs();
            }
        }

        function updateDisponibilidadeMeta(tipo, grupo, valor) {
            disponibilidadeSalvarMeta(tipo, grupo, valor);
            const ctx = disponibilidadeGetCtx(tipo);
            renderDisponibilidadeTipo(ctx);
        }


        function exportDisponibilidadeCSV(tipo) {
            const ctx = disponibilidadeGetCtx(tipo);
            const { grupos, nomes } = disponibilidadeAgrupar(ctx);
            const sep = ';';
            const num = n => (n == null || isNaN(n)) ? '' : String(Math.round(n * 10000) / 10000).replace('.', ',');
            let csv = ['Frota', 'Equipamento', ctx.rotuloGrupo, 'Disponibilidade %', 'Meta %', 'Diferença p.p.', 'O.S.', 'Dias Parados', 'I.C.', 'Atendimento %', 'Horas Permanência', 'Horas Trabalho', 'Custo M.O.', 'Total Peças', 'Status'].join(sep) + '\r\n';
            nomes.forEach(g => grupos[g].forEach(x => {
                const meta = disponibilidadeMeta(ctx, g);
                const st = disponibilidadeStatus(x.disp, meta);
                csv += [x.frota, '"' + x.equipamento.replace(/"/g, '""') + '"', '"' + g.replace(/"/g, '""') + '"', num(x.disp), num(meta), num(x.disp - meta), x.os || 0, num(x.diasParados), num(x.ic), num(x.atend), x.perm, x.trabalho, num(x.custoMo), num(x.totalPecas), st.txt].join(sep) + '\r\n';
            }));
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = tipo === 'caminhao' ? 'disponibilidade_caminhao.csv' : 'disponibilidade_colhedoras.csv';
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
            if (typeof showToast === 'function') showToast('✅ CSV de disponibilidade exportado!', '#16a34a');
        }

        // ═══════════════════════════════════════════════════════════════
        //  PATCH ONLINE — DISPONIBILIDADE COLHEDORAS EM GRÁFICO ÚNICO
        //  + correção de datas vindas do Google Sheets
        // ═══════════════════════════════════════════════════════════════

        function agrosyncFormatarDataSheets(v) {
            if (v == null || v === '') return '';
            if (v instanceof Date && !isNaN(v)) return v.toLocaleDateString('pt-BR');

            let s = String(v).trim();
            if (!s) return '';

            // ISO vindo do Apps Script: 2026-04-01T03:00:00.000Z
            const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
            if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];

            // ISO curto: 2026-04-01
            const iso2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (iso2) return iso2[3] + '/' + iso2[2] + '/' + iso2[1];

            // Já está em BR
            const br = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
            if (br) {
                const ano = br[3].length === 2 ? '20' + br[3] : br[3];
                return br[1] + '/' + br[2] + '/' + ano;
            }

            // Serial/Date bizarro do Sheets para hora: 1899-12-30T10:31:56.000Z
            const horaIso = s.match(/^1899-12-30T(\d{2}:\d{2}:\d{2})/);
            if (horaIso) return horaIso[1];

            return s;
        }

        function agrosyncFormatarHoraSheets(v) {
            if (v == null || v === '') return '';
            let s = String(v).trim();
            if (!s) return '';

            const horaIso = s.match(/^1899-12-30T(\d{2}:\d{2}:\d{2})/);
            if (horaIso) return horaIso[1];

            const iso = s.match(/T(\d{2}:\d{2}:\d{2})/);
            if (iso) return iso[1];

            const h = s.match(/^(\d{2}:\d{2}:\d{2})$/);
            if (h) return h[1];

            return s;
        }

        // Override: processa disponibilidade online sem depender de File/PDF local.
        function agrosyncProcessarDisponibilidadeOnline(rows, metaRows) {
            disponibilidadeCarregarPrefs();
            disponibilidadeProcessado = true;
            disponibilidadeData = [];
            disponibilidadePeriodo = '';
            disponibilidadeDataRelatorio = '';
            disponibilidadeHoraRelatorio = '';

            // Marca fonte online para não aparecer "PDF não encontrado"
            if (Array.isArray(rows) && rows.length) {
                disponibilidadeArquivoPdf = { name: 'Google Sheets / OS OFICINA GERAL.pdf' };
            }

            if (Array.isArray(metaRows)) {
                const meta = {};
                metaRows.forEach(r => {
                    const campo = String(r.campo || '').trim();
                    if (campo) meta[campo] = r.valor || '';
                });

                const ini = agrosyncFormatarDataSheets(meta.periodo_inicio);
                const fim = agrosyncFormatarDataSheets(meta.periodo_fim);
                if (ini && fim) disponibilidadePeriodo = ini + ' a ' + fim;

                disponibilidadeDataRelatorio = agrosyncFormatarDataSheets(meta.data_emissao);
                disponibilidadeHoraRelatorio = agrosyncFormatarHoraSheets(meta.hora_emissao);
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

        function disponibilidadeMetaColhedorasGeral() {
            if (disponibilidadeMetasColhedoras.__GERAL__ == null || isNaN(disponibilidadeMetasColhedoras.__GERAL__)) {
                disponibilidadeMetasColhedoras.__GERAL__ = 85;
            }
            return Number(disponibilidadeMetasColhedoras.__GERAL__);
        }

        function disponibilidadeSalvarMetaColhedorasGeral(valor) {
            const v = parseFloat(String(valor == null ? '' : valor).replace(',', '.'));
            if (!isNaN(v)) {
                disponibilidadeMetasColhedoras.__GERAL__ = v;
                disponibilidadeSalvarPrefs();
            }
        }

        function updateDisponibilidadeMetaColhedorasGeral(valor) {
            disponibilidadeSalvarMetaColhedorasGeral(valor);
            renderDisponibilidadeTipo(disponibilidadeGetCtx('colhedoras'));
        }

        // Override: status online correto, sem falso "PDF não encontrado".
        function renderDisponibilidade() {
            disponibilidadeCarregarPrefs();

            const badge = document.getElementById('disp-periodo-badge');
            if (badge) {
                const partes = [];
                if (disponibilidadePeriodo) partes.push('Período: <strong>' + consumoEscHtml(disponibilidadePeriodo) + '</strong>');
                if (disponibilidadeDataRelatorio) partes.push('Emitido: <strong>' + consumoEscHtml(disponibilidadeDataRelatorio) + (disponibilidadeHoraRelatorio ? ' ' + consumoEscHtml(disponibilidadeHoraRelatorio) : '') + '</strong>');
                badge.style.display = partes.length ? 'inline-flex' : 'none';
                badge.innerHTML = partes.join(' &nbsp;|&nbsp; ');
            }

            const status = document.getElementById('disp-files-status');
            if (status) {
                const temDadosOnline = Array.isArray(disponibilidadeData) && disponibilidadeData.length > 0;
                const nomeFonte = disponibilidadeArquivoPdf && disponibilidadeArquivoPdf.name
                    ? disponibilidadeArquivoPdf.name
                    : (temDadosOnline ? 'Google Sheets / OS OFICINA GERAL.pdf' : '');

                status.innerHTML = temDadosOnline
                    ? '<div class="consumo-msg-info">✅ Disponibilidade carregada: <strong>' + consumoEscHtml(nomeFonte) + '</strong>' + (disponibilidadePeriodo ? ' | ' + consumoEscHtml(disponibilidadePeriodo) : '') + '</div>'
                    : '<div class="consumo-msg-warn">⚠️ Nenhum dado de disponibilidade encontrado no Google Sheets. Rode o bot local para atualizar a aba <strong>disponibilidade</strong>.</div>';
            }

            renderDisponibilidadeTipo(disponibilidadeGetCtx(disponibilidadeAbaAtiva));
        }

        // Override: Caminhão segue por grupos; Colhedoras vira gráfico único com meta única.
        function renderDisponibilidadeTipo(ctx) {
            if (ctx.tipo === 'colhedoras') {
                renderDisponibilidadeColhedorasUnico(ctx);
                return;
            }

            const base = 'disp-' + ctx.tipo;
            const els = {
                msg: document.getElementById(base + '-msg'),
                tool: document.getElementById(base + '-toolbar'),
                cards: document.getElementById(base + '-cards'),
                grupos: document.getElementById(base + '-grupos'),
                tab: document.getElementById(base + '-tabela')
            };
            if (!els.grupos) return;
            destroyDisponibilidadeCharts(base);
            els.msg.innerHTML = ''; els.tool.innerHTML = ''; els.cards.innerHTML = ''; els.grupos.innerHTML = ''; els.tab.innerHTML = '';
            renderDisponibilidadeChips(null);

            const temDados = Array.isArray(disponibilidadeData) && disponibilidadeData.length > 0;
            if (!temDados) {
                els.msg.innerHTML = '<div class="consumo-msg-info">Nenhum dado de disponibilidade carregado ainda.</div>';
                return;
            }
            if (!Object.keys(ctx.classif || {}).length) {
                els.msg.innerHTML = '<div class="consumo-msg-warn">⚠️ Classificação de ' + ctx.rotuloItens + ' não encontrada. A aba usa a mesma planilha de classificação do módulo CONSUMO.</div>';
                return;
            }
            if (!ctx.dados.length) {
                els.msg.innerHTML = '<div class="consumo-msg-warn">⚠️ Nenhuma frota cruzou com a classificação de ' + ctx.rotuloItens + '.</div>';
                return;
            }

            const { grupos, nomes: todosNomes } = disponibilidadeAgrupar(ctx);
            renderDisponibilidadeChips(ctx, todosNomes, grupos);
            const filtroGrupo = disponibilidadeFiltroGrupoCaminhao;
            const nomes = filtroGrupo && filtroGrupo !== 'TODOS' ? todosNomes.filter(g => g === filtroGrupo) : todosNomes;

            els.tool.innerHTML = '<div class="consumo-toolbar">' +
                '<strong style="font-size:12px;color:#334155;">Indicador: Disponibilidade (%)</strong>' +
                '<span style="font-size:11px;font-weight:800;color:#0891b2;">▲ Maior é melhor</span>' +
                '<div class="consumo-legenda"><span class="leg-verde">Dentro da meta</span><span class="leg-vermelho">Fora da meta</span><span class="leg-meta">Linha de meta</span></div>' +
                '<button class="consumo-btn-csv" onclick="exportDisponibilidadeCSV(\'' + ctx.tipo + '\')">⬇️ Exportar CSV</button>' +
                '</div>';
            els.cards.innerHTML = disponibilidadeHtmlCards(ctx, grupos, nomes);

            let htmlGrupos = '';
            nomes.forEach(g => {
                const slug = consumoSlug(g);
                const meta = disponibilidadeMeta(ctx, g);
                const gJs = String(g).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                htmlGrupos += '<div class="consumo-grupo-bloco">' +
                    '<div class="consumo-grupo-header">' +
                    '<div class="consumo-grupo-titulo">' + consumoEscHtml(g) + ' <span style="color:#94a3b8;font-weight:700;">(' + grupos[g].length + ')</span></div>' +
                    '<div class="consumo-meta-box"><label>Meta ' + consumoEscHtml(g) + ':</label>' +
                    '<input type="number" step="0.1" min="0" max="100" value="' + meta + '" ' +
                    'oninput="disponibilidadeSalvarMeta(\'' + ctx.tipo + '\', \'' + gJs + '\', this.value)" ' +
                    'onchange="updateDisponibilidadeMeta(\'' + ctx.tipo + '\', \'' + gJs + '\', this.value)" ' +
                    'onkeydown="if(event.key===\'Enter\'){this.blur();}">' +
                    '</div></div>' +
                    '<div class="consumo-chart-wrap"><canvas id="' + base + '-chart-' + slug + '"></canvas></div>' +
                    '<div class="consumo-mini-grid" id="' + base + '-minis-' + slug + '"></div>' +
                    '</div>';
            });
            els.grupos.innerHTML = htmlGrupos;
            nomes.forEach(g => {
                renderDisponibilidadeGrafico(ctx, g, grupos[g]);
                renderDisponibilidadeMinis(ctx, g, grupos[g]);
            });
            els.tab.innerHTML = disponibilidadeHtmlTabela(ctx, grupos, nomes);
        }

        function renderDisponibilidadeColhedorasUnico(ctx) {
            const base = 'disp-colhedoras';
            const els = {
                msg: document.getElementById(base + '-msg'),
                tool: document.getElementById(base + '-toolbar'),
                cards: document.getElementById(base + '-cards'),
                grupos: document.getElementById(base + '-grupos'),
                tab: document.getElementById(base + '-tabela')
            };
            if (!els.grupos) return;

            destroyDisponibilidadeCharts(base);
            els.msg.innerHTML = ''; els.tool.innerHTML = ''; els.cards.innerHTML = ''; els.grupos.innerHTML = ''; els.tab.innerHTML = '';

            const temDados = Array.isArray(disponibilidadeData) && disponibilidadeData.length > 0;
            if (!temDados) {
                els.msg.innerHTML = '<div class="consumo-msg-info">Nenhum dado de disponibilidade carregado ainda.</div>';
                renderDisponibilidadeChips(null);
                return;
            }

            if (!Object.keys(ctx.classif || {}).length) {
                els.msg.innerHTML = '<div class="consumo-msg-warn">⚠️ Classificação de colhedoras não encontrada. A aba usa a planilha <strong>Colhedoras.xlsx</strong>.</div>';
                renderDisponibilidadeChips(null);
                return;
            }

            if (!ctx.dados.length) {
                els.msg.innerHTML = '<div class="consumo-msg-warn">⚠️ Nenhuma colhedora do PDF cruzou com a classificação de colhedoras.</div>';
                renderDisponibilidadeChips(null);
                return;
            }

            // Para colhedoras: todos os grupos entram no mesmo gráfico.
            const { grupos, nomes } = disponibilidadeAgrupar(ctx);
            renderDisponibilidadeChips(ctx, nomes, grupos);

            let filtroGrupo = disponibilidadeFiltroGrupoColhedoras;
            let dados = ctx.dados.slice();
            if (filtroGrupo && filtroGrupo !== 'TODOS') {
                dados = dados.filter(x => x.grupo === filtroGrupo);
            }
            dados.sort((a, b) => a.disp - b.disp); // piores primeiro, igual visão operacional

            const meta = disponibilidadeMetaColhedorasGeral();
            const dentro = dados.filter(x => x.disp >= meta).length;
            const fora = dados.length - dentro;
            const media = dados.reduce((s, x) => s + x.disp, 0) / (dados.length || 1);
            const melhor = dados.reduce((a, b) => !a || b.disp > a.disp ? b : a, null);
            const pior = dados.reduce((a, b) => !a || b.disp < a.disp ? b : a, null);
            const ader = dados.length ? dentro / dados.length * 100 : 0;
            const osTotal = dados.reduce((s, x) => s + (x.os || 0), 0);
            const custoTotal = dados.reduce((s, x) => s + (x.custoMo || 0) + (x.totalPecas || 0), 0);

            els.tool.innerHTML = '<div class="consumo-toolbar">' +
                '<strong style="font-size:12px;color:#334155;">Indicador: Disponibilidade das Colhedoras (%)</strong>' +
                '<span style="font-size:11px;font-weight:800;color:#0891b2;">▲ Maior é melhor</span>' +
                '<div class="consumo-legenda"><span class="leg-verde">Dentro da meta</span><span class="leg-vermelho">Fora da meta</span><span class="leg-meta">Linha de meta</span></div>' +
                '<button class="consumo-btn-csv" onclick="exportDisponibilidadeCSV(\'colhedoras\')">⬇️ Exportar CSV</button>' +
                '</div>';

            els.cards.innerHTML = '<div class="consumo-cards-grid">' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val">' + dados.length + '</div><div class="consumo-kpi-lbl">Colhedoras analisadas</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val">' + disponibilidadeFmt(media, 1) + '%</div><div class="consumo-kpi-lbl">Disponibilidade média</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="color:#16a34a;">' + dentro + '</div><div class="consumo-kpi-lbl">Dentro da meta</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="color:#dc2626;">' + fora + '</div><div class="consumo-kpi-lbl">Fora da meta</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val">' + disponibilidadeFmt(ader, 1) + '%</div><div class="consumo-kpi-lbl">Aderência</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val">' + osTotal + '</div><div class="consumo-kpi-lbl">O.S. total</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="font-size:18px;">' + (melhor ? melhor.frota + ' - ' + disponibilidadeFmt(melhor.disp, 1) + '%' : '—') + '</div><div class="consumo-kpi-lbl">Melhor colhedora</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="font-size:18px;color:#dc2626;">' + (pior ? pior.frota + ' - ' + disponibilidadeFmt(pior.disp, 1) + '%' : '—') + '</div><div class="consumo-kpi-lbl">Pior colhedora</div></div>' +
                '<div class="consumo-kpi"><div class="consumo-kpi-val" style="font-size:18px;">R$ ' + disponibilidadeFmt(custoTotal, 2) + '</div><div class="consumo-kpi-lbl">M.O. + peças</div></div>' +
                '</div>';

            els.grupos.innerHTML = '<div class="consumo-grupo-bloco">' +
                '<div class="consumo-grupo-header">' +
                '<div class="consumo-grupo-titulo">🌾 Colhedoras ' + (filtroGrupo && filtroGrupo !== 'TODOS' ? '— ' + consumoEscHtml(filtroGrupo) : '— Todas as equipes') + ' <span style="color:#94a3b8;font-weight:700;">(' + dados.length + ')</span></div>' +
                '<div class="consumo-meta-box"><label>Meta geral:</label>' +
                '<input type="number" step="0.1" min="0" max="100" value="' + meta + '" ' +
                'oninput="disponibilidadeSalvarMetaColhedorasGeral(this.value)" ' +
                'onchange="updateDisponibilidadeMetaColhedorasGeral(this.value)" ' +
                'onkeydown="if(event.key===\'Enter\'){this.blur();}">' +
                '</div></div>' +
                '<div class="consumo-chart-wrap" style="height:420px;"><canvas id="disp-colhedoras-chart-geral"></canvas></div>' +
                '<div class="consumo-mini-grid" id="disp-colhedoras-minis-geral"></div>' +
                '</div>';

            renderDisponibilidadeColhedorasGraficoUnico(dados, meta);
            renderDisponibilidadeColhedorasMinisUnico(dados, meta);
            els.tab.innerHTML = disponibilidadeHtmlTabelaColhedorasUnico(dados, meta);
        }

        function renderDisponibilidadeColhedorasGraficoUnico(arr, meta) {
            const id = 'disp-colhedoras-chart-geral';
            const canvas = document.getElementById(id);
            if (!canvas) return;

            if (disponibilidadeCharts[id]) {
                disponibilidadeCharts[id].destroy();
                delete disponibilidadeCharts[id];
            }

            var isDark2 = document.body.classList.contains('dark-theme');
            var dispTcU = isDark2 ? '#f1f5f9' : '#64748b';
            var dispTc2U = isDark2 ? '#94a3b8' : '#94a3b8';
            var dispGridU = isDark2 ? '#334155' : '#f1f5f9';
            var dispMetaLineU = isDark2 ? '#94a3b8' : '#1e293b';
            var dispTooltipU = isDark2 ? '#334155' : '#1e293b';
            disponibilidadeCharts[id] = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: arr.map(x => x.frota),
                    datasets: [
                        {
                            type: 'bar',
                            label: 'Disponibilidade (%)',
                            data: arr.map(x => x.disp),
                            backgroundColor: arr.map(x => x.disp >= meta ? DISP_COR_VERDE : DISP_COR_VERMELHO),
                            borderRadius: 6
                        },
                        {
                            type: 'line',
                            label: 'Meta geral',
                            data: arr.map(() => meta),
                            borderColor: dispMetaLineU,
                            borderWidth: 2,
                            borderDash: [6, 5],
                            pointRadius: 0,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: true, labels: { color: dispTcU } },
                        datalabels: { display: false },
                        tooltip: {
                            backgroundColor: dispTooltipU,
                            callbacks: {
                                afterBody: (items) => {
                                    const idx = items[0].dataIndex;
                                    const x = arr[idx];
                                    const st = disponibilidadeStatus(x.disp, meta);
                                    return [
                                        'Grupo/Frente: ' + x.grupo,
                                        'Meta geral: ' + disponibilidadeFmt(meta, 1) + '%',
                                        'Dif.: ' + disponibilidadeFmt(x.disp - meta, 1) + ' p.p.',
                                        'Status: ' + st.txt,
                                        'O.S.: ' + x.os,
                                        'Dias parados: ' + disponibilidadeFmt(x.diasParados, 2)
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, max: 100, ticks: { color: dispTc2U, callback: v => v + '%' }, grid: { color: dispGridU } },
                        x: { ticks: { color: dispTcU, maxRotation: 45, minRotation: 0 } }
                    }
                }
            });
        }

        function renderDisponibilidadeColhedorasMinisUnico(arr, meta) {
            const el = document.getElementById('disp-colhedoras-minis-geral');
            if (!el) return;
            const media = arr.reduce((s, x) => s + x.disp, 0) / (arr.length || 1);
            const melhor = arr.reduce((a, b) => !a || b.disp > a.disp ? b : a, null);
            const pior = arr.reduce((a, b) => !a || b.disp < a.disp ? b : a, null);
            const dentro = arr.filter(x => x.disp >= meta).length;
            const osTotal = arr.reduce((s, x) => s + (x.os || 0), 0);
            el.innerHTML =
                '<div class="consumo-mini"><div class="consumo-mini-val">' + arr.length + '</div><div class="consumo-mini-lbl">Colhedoras</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val">' + disponibilidadeFmt(media, 1) + '%</div><div class="consumo-mini-lbl">Média</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val" style="color:#16a34a;">' + dentro + '</div><div class="consumo-mini-lbl">Dentro</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val" style="color:#dc2626;">' + (arr.length - dentro) + '</div><div class="consumo-mini-lbl">Fora</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val">' + osTotal + '</div><div class="consumo-mini-lbl">O.S.</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val">' + (melhor ? melhor.frota + ' - ' + disponibilidadeFmt(melhor.disp, 1) + '%' : '—') + '</div><div class="consumo-mini-lbl">Melhor</div></div>' +
                '<div class="consumo-mini"><div class="consumo-mini-val" style="color:#dc2626;">' + (pior ? pior.frota + ' - ' + disponibilidadeFmt(pior.disp, 1) + '%' : '—') + '</div><div class="consumo-mini-lbl">Pior</div></div>';
        }

        function disponibilidadeHtmlTabelaColhedorasUnico(arr, meta) {
            let rows = '';
            arr.forEach(x => {
                const st = disponibilidadeStatus(x.disp, meta);
                rows += '<tr>' +
                    '<td>' + consumoEscHtml(x.frota) + '</td>' +
                    '<td>' + consumoEscHtml(x.equipamento) + '</td>' +
                    '<td>' + consumoEscHtml(x.grupo) + '</td>' +
                    '<td>' + disponibilidadeFmt(x.disp, 1) + '%</td>' +
                    '<td>' + disponibilidadeFmt(meta, 1) + '%</td>' +
                    '<td class="' + ((x.disp - meta) >= 0 ? 'consumo-dif-neg' : 'consumo-dif-pos') + '">' + disponibilidadeFmt(x.disp - meta, 1) + ' p.p.</td>' +
                    '<td>' + (x.os || 0) + '</td>' +
                    '<td>' + disponibilidadeFmt(x.diasParados, 2) + '</td>' +
                    '<td>R$ ' + disponibilidadeFmt((x.custoMo || 0) + (x.totalPecas || 0), 2) + '</td>' +
                    '<td><span class="status-badge ' + (st.ok ? 'consumo-badge-dentro' : 'consumo-badge-fora') + '">' + st.txt + '</span></td>' +
                    '</tr>';
            });
            return '<div class="card"><div class="section-title">📋 Detalhamento de Disponibilidade — Colhedoras</div><div class="table-container"><table>' +
                '<thead><tr><th>Frota</th><th>Equipamento</th><th>Grupo/Frente</th><th>Disp.</th><th>Meta geral</th><th>Dif.</th><th>O.S.</th><th>Dias Parados</th><th>Custo Total</th><th>Status</th></tr></thead>' +
                '<tbody>' + rows + '</tbody></table></div></div>';
        }

        // Override CSV: colhedoras usa meta geral.
        function exportDisponibilidadeCSV(tipo) {
            const ctx = disponibilidadeGetCtx(tipo);
            const sep = ';';
            const num = n => (n == null || isNaN(n)) ? '' : String(Math.round(n * 10000) / 10000).replace('.', ',');
            let csv = ['Frota', 'Equipamento', ctx.rotuloGrupo, 'Disponibilidade %', 'Meta %', 'Diferença p.p.', 'O.S.', 'Dias Parados', 'I.C.', 'Atendimento %', 'Horas Permanência', 'Horas Trabalho', 'Custo M.O.', 'Total Peças', 'Status'].join(sep) + '\r\n';

            if (tipo === 'colhedoras') {
                const meta = disponibilidadeMetaColhedorasGeral();
                let arr = ctx.dados.slice().sort((a, b) => a.disp - b.disp);
                arr.forEach(x => {
                    const st = disponibilidadeStatus(x.disp, meta);
                    csv += [x.frota, '"' + String(x.equipamento || '').replace(/"/g, '""') + '"', '"' + String(x.grupo || '').replace(/"/g, '""') + '"', num(x.disp), num(meta), num(x.disp - meta), x.os || 0, num(x.diasParados), num(x.ic), num(x.atend), x.perm, x.trabalho, num(x.custoMo), num(x.totalPecas), st.txt].join(sep) + '\r\n';
                });
            } else {
                const { grupos, nomes } = disponibilidadeAgrupar(ctx);
                nomes.forEach(g => grupos[g].forEach(x => {
                    const meta = disponibilidadeMeta(ctx, g);
                    const st = disponibilidadeStatus(x.disp, meta);
                    csv += [x.frota, '"' + String(x.equipamento || '').replace(/"/g, '""') + '"', '"' + g.replace(/"/g, '""') + '"', num(x.disp), num(meta), num(x.disp - meta), x.os || 0, num(x.diasParados), num(x.ic), num(x.atend), x.perm, x.trabalho, num(x.custoMo), num(x.totalPecas), st.txt].join(sep) + '\r\n';
                }));
            }

            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = tipo === 'caminhao' ? 'disponibilidade_caminhao.csv' : 'disponibilidade_colhedoras.csv';
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
            if (typeof showToast === 'function') showToast('✅ CSV de disponibilidade exportado!', '#16a34a');
        }


        // ═════════════════════ FIM DO MÓDULO DISPONIBILIDADE ════════════════

        // ═══════════════════════ FIM DO MÓDULO CONSUMO ══════════════════════
    
        // ═══════════════════════════════════════════════════════════════
        //  PATCH FINAL — GOOGLE SHEETS CORRIGIDO 13/06/2026
        //  - Usa metadata_disponibilidade novo do bot
        //  - Exibe status por quantidade de linhas
        //  - Evita falso erro de PDF local ausente
        // ═══════════════════════════════════════════════════════════════

        function agrosyncGetMetadataDisp(data) {
            if (!data) return [];
            return data.metadata_disponibilidade || data.metadata_pdf || [];
        }

        function agrosyncMetaValor(metaRows, campo) {
            if (!Array.isArray(metaRows)) return '';
            const item = metaRows.find(r => String(r.campo || '').trim() === campo);
            return item ? (item.valor || '') : '';
        }

        function agrosyncResumoOnline(data) {
            const qtdProd = Array.isArray(data.producao) ? data.producao.length : 0;
            const qtdSol = Array.isArray(data.solinftec) ? data.solinftec.length : 0;
            const qtdCam = Array.isArray(data.consumo_caminhao) ? data.consumo_caminhao.length : 0;
            const qtdCol = Array.isArray(data.consumo_colhedoras) ? data.consumo_colhedoras.length : 0;
            const qtdDisp = Array.isArray(data.disponibilidade) ? data.disponibilidade.length : 0;
            const metaDisp = agrosyncGetMetadataDisp(data);
            const fonte = agrosyncMetaValor(metaDisp, 'fonte_disponibilidade') || 'Google Sheets';

            return {
                qtdProd,
                qtdSol,
                qtdCam,
                qtdCol,
                qtdDisp,
                fonte
            };
        }

