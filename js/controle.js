        // ═══════════════════════════════════════════════════════════════
        // ── ABA CONTROLE DE CARGA — linha próprio × terceiro por hora ──
        // ═══════════════════════════════════════════════════════════════
        let controleSelectedDay = 'TODOS';

        function renderControleTimeline() {
            const tl = document.getElementById('controle-timeline');
            if (!tl) return;
            tl.innerHTML = '';
            const dias = [...new Set(horariaRaw.map(r => r.dia))].filter(Boolean).sort();
            const addBtn = (id, label) => {
                const b = document.createElement('div');
                b.className = 'day-badge' + (controleSelectedDay === id ? ' active' : '');
                b.innerText = label;
                b.onclick = () => { controleSelectedDay = id; renderControleTimeline(); renderControle(); };
                tl.appendChild(b);
            };
            addBtn('TODOS', 'SAFRA COMPLETA');
            dias.forEach(d => { const p = d.split('-'); addBtn(d, `${p[2]}/${p[1]}`); });
        }

        function renderControle() {
            if (!balanceLoaded) return;
            renderControleTimeline();

            const cont = document.getElementById('controle-content');
            if (!cont) return;
            cont.innerHTML = '';

            const dados = controleSelectedDay === 'TODOS'
                ? horariaRaw
                : horariaRaw.filter(r => r.dia === controleSelectedDay);

            if (!dados.length) {
                cont.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8;font-weight:700;">⏳ Nenhum dado. Carregue o Producao.xlsx.</div>';
                return;
            }

            const HORAS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];
            const LABELS = HORAS.map(h => String(h).padStart(2, '0') + 'h');
            const metaProp = 60, metaTerc = 40;

            // Agrega por hora × ownership
            const aggH = {};
            HORAS.forEach(h => { aggH[h] = { proprio: 0, terceiro: 0 }; });
            dados.forEach(r => {
                if (aggH[r.hora] !== undefined)
                    aggH[r.hora][r.ownership] = (aggH[r.hora][r.ownership] || 0) + r.peso;
            });

            // Arrays hora a hora
            const propVals = [], tercVals = [], pctPropHora = [], pctTercHora = [];
            let acProp = 0, acTerc = 0;
            HORAS.forEach(h => {
                const p = aggH[h].proprio / 1000;
                const t = aggH[h].terceiro / 1000;
                acProp += p; acTerc += t;
                propVals.push(parseFloat(p.toFixed(3)));
                tercVals.push(parseFloat(t.toFixed(3)));
                const tot = p + t;
                pctPropHora.push(tot > 0 ? parseFloat((p / tot * 100).toFixed(1)) : null);
                pctTercHora.push(tot > 0 ? parseFloat((t / tot * 100).toFixed(1)) : null);
            });

            const totalProp = acProp, totalTerc = acTerc, totalGeral = acProp + acTerc;
            const pctPropTotal = totalGeral > 0 ? totalProp / totalGeral * 100 : 0;
            const pctTercTotal = totalGeral > 0 ? totalTerc / totalGeral * 100 : 0;
            const propOk = pctPropTotal >= metaProp;
            const tercOk = pctTercTotal >= metaTerc;

            // Horas com gargalo (próprio < meta)
            const horasGargalo = HORAS.filter((_, i) => pctPropHora[i] !== null && pctPropHora[i] < metaProp);
            const nGargalo = horasGargalo.length;
            const nHorasComDado = pctPropHora.filter(v => v !== null).length;

            const dayLabel = controleSelectedDay === 'TODOS' ? 'Safra completa' :
                (() => { const p = controleSelectedDay.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; })();

            // ── KPI strip ────────────────────────────────────────────────────
            const kpiDiv = document.createElement('div');
            kpiDiv.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;';
            kpiDiv.innerHTML = `
            <div class="kpi-card" style="flex:1;min-width:150px;border-bottom-color:#40800c;${propOk ? 'background:#f0fdf4;' : 'background:#fef2f2;'}">
                <small>🚛 PRÓPRIO (31)</small>
                <span class="val" style="color:#40800c;">${totalProp.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} t</span>
                <div class="meta-info">${pctPropTotal.toFixed(1)}% do total · Meta ${metaProp}%
                    <span style="color:${propOk ? '#16a34a' : '#dc2626'};font-weight:800;"> ${propOk ? '✅ OK' : '❌ ABAIXO'}</span>
                </div>
            </div>
            <div class="kpi-card terc" style="flex:1;min-width:150px;${tercOk ? 'background:#fffbeb;' : ''}">
                <small>🚛 TERCEIRO (91)</small>
                <span class="val" style="color:#e9a23b;">${totalTerc.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} t</span>
                <div class="meta-info">${pctTercTotal.toFixed(1)}% do total · Meta ${metaTerc}%
                    <span style="color:${tercOk ? '#16a34a' : '#dc2626'};font-weight:800;"> ${tercOk ? '✅ OK' : '❌ ACIMA'}</span>
                </div>
            </div>
            <div class="kpi-card" style="flex:1;min-width:150px;background:#f0fdf4;border-bottom-color:#22c55e;">
                <small>📦 TOTAL GERAL</small>
                <span class="val" style="color:#16a34a;">${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} t</span>
                <div class="meta-info">${dayLabel}</div>
            </div>
            <div class="kpi-card" style="flex:1;min-width:150px;background:${nGargalo > 0 ? '#fef2f2' : '#f0fdf4'};border-bottom-color:${nGargalo > 0 ? '#ef4444' : '#22c55e'};">
                <small>⚠️ HORAS ABAIXO DA META</small>
                <span class="val" style="color:${nGargalo > 0 ? '#dc2626' : '#16a34a'};">${nGargalo} <span style="font-size:.8rem">de ${nHorasComDado}h</span></span>
                <div class="meta-info">${nGargalo > 0 ? 'Próprio < ' + metaProp + '% nessas horas' : 'Todas as horas dentro da meta'}</div>
            </div>`;
            cont.appendChild(kpiDiv);

            // ── Card: gráfico principal — % por hora + meta ───────────────────
            const card1 = document.createElement('div');
            card1.className = 'balance-card';
            card1.style.cssText = 'padding:24px;margin-bottom:16px;';
            card1.innerHTML = `
            <div class="balance-card-title" style="border-left-color:#40800c;margin-bottom:12px;">
                📈 % Mix Próprio × Terceiro por Hora · ${dayLabel}
            </div>
            <div style="font-size:11px;color:#64748b;margin-bottom:14px;display:flex;gap:18px;flex-wrap:wrap;align-items:center;">
                <span style="display:flex;align-items:center;gap:6px;font-weight:700;color:#40800c;">
                    <span style="display:inline-block;width:20px;height:3px;background:#40800c;border-radius:2px;"></span>% Próprio
                </span>
                <span style="display:flex;align-items:center;gap:6px;font-weight:700;color:#e9a23b;">
                    <span style="display:inline-block;width:20px;height:3px;background:#e9a23b;border-radius:2px;"></span>% Terceiro
                </span>
                <span style="display:flex;align-items:center;gap:6px;font-weight:700;color:#dc2626;">
                    <span style="display:inline-block;width:20px;height:2px;background:#dc2626;border-top:2px dashed #dc2626;"></span>Meta Próprio ${metaProp}%
                </span>
                <span style="font-size:10px;color:#94a3b8;font-style:italic;margin-left:auto;">
                    Área vermelha = horas abaixo da meta · Interseção = troca de liderança
                </span>
            </div>
            <div style="position:relative;height:360px;">
                <canvas id="controle-pct-canvas"></canvas>
            </div>`;
            cont.appendChild(card1);

            // ── Card: barras volume por hora ──────────────────────────────────
            const card2 = document.createElement('div');
            card2.className = 'balance-card';
            card2.style.cssText = 'padding:24px;margin-bottom:16px;';
            card2.innerHTML = `
            <div class="balance-card-title" style="border-left-color:#6366f1;margin-bottom:12px;">
                📊 Volume por Hora · Próprio vs Terceiro (t)
            </div>
            <div style="position:relative;height:240px;">
                <canvas id="controle-bar-canvas"></canvas>
            </div>`;
            cont.appendChild(card2);

            // ── Card gargalos ─────────────────────────────────────────────────
            const gargCard = document.createElement('div');
            gargCard.className = 'balance-card';
            gargCard.style.cssText = 'padding:24px;';
            gargCard.innerHTML = '<div class="balance-card-title" style="border-left-color:#f59e0b;margin-bottom:14px;">⚠️ Gargalos por Hora — Próprio abaixo de ' + metaProp + '%</div>'
                + '<div id="controle-gargalos" style="display:flex;flex-direction:column;gap:6px;"></div>';
            cont.appendChild(gargCard);

            var isDark = document.body.classList.contains('dark-theme');
            const gargDiv = gargCard.querySelector('#controle-gargalos');
            let temGargalo = false;
            HORAS.forEach((h, i) => {
                const p = propVals[i], t = tercVals[i], tot = p + t;
                if (tot <= 0) return;
                const pP = pctPropHora[i];
                if (pP >= metaProp) return;
                temGargalo = true;
                const deficit = metaProp - pP;
                var gargBg = isDark ? '#2a1010' : '#fef2f2';
                var gargText = isDark ? '#f1f5f9' : '#1e293b';
                const row = document.createElement('div');
                row.style.cssText = 'display:grid;grid-template-columns:48px 1fr auto auto auto;'
                    + 'align-items:center;gap:10px;padding:10px 14px;'
                    + 'background:' + gargBg + ';border-radius:10px;border-left:4px solid #ef4444;';
                row.innerHTML =
                    `<span style="font-size:16px;font-weight:900;color:${gargText};">${String(h).padStart(2, '0')}h</span>`
                    + `<div>`
                    + `<div style="background:#e2e8f0;border-radius:4px;height:18px;overflow:hidden;position:relative;">`
                    // barra próprio
                    + `<div style="position:absolute;left:0;top:0;height:100%;width:${pP.toFixed(0)}%;background:#40800c;border-radius:4px 0 0 4px;display:flex;align-items:center;padding-left:6px;">`
                    + `<span style="color:#fff;font-size:10px;font-weight:900;">${pP.toFixed(0)}%</span></div>`
                    // barra terceiro (resto)
                    + `<div style="position:absolute;right:0;top:0;height:100%;width:${(100 - pP).toFixed(0)}%;background:#e9a23b;border-radius:0 4px 4px 0;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">`
                    + `<span style="color:#fff;font-size:10px;font-weight:900;">${(100 - pP).toFixed(0)}%</span></div>`
                    + `</div>`
                    + `<div style="font-size:10px;color:#dc2626;font-weight:700;margin-top:3px;">Déficit: ${deficit.toFixed(1)} p.p. abaixo da meta</div>`
                    + `</div>`
                    + `<span style="font-size:12px;font-weight:800;color:#40800c;white-space:nowrap;">Próprio: ${p.toFixed(3)}t</span>`
                    + `<span style="font-size:12px;font-weight:800;color:#e9a23b;white-space:nowrap;">Terceiro: ${t.toFixed(3)}t</span>`
                    + `<span style="font-size:11px;font-weight:800;padding:3px 8px;border-radius:20px;background:#fee2e2;color:#dc2626;white-space:nowrap;">-${deficit.toFixed(1)}p.p.</span>`;
                gargDiv.appendChild(row);
            });
            if (!temGargalo) {
                gargDiv.innerHTML = '<div style="text-align:center;padding:24px;color:#16a34a;font-weight:700;font-size:13px;">✅ Nenhum gargalo identificado no período.</div>';
            }

            // ── Render gráfico % ──────────────────────────────────────────────
            setTimeout(() => {
                var isDark = document.body.classList.contains('dark-theme');
                var ctrlTc = isDark ? '#f1f5f9' : '#64748b';
                var ctrlTc2 = isDark ? '#94a3b8' : '#94a3b8';
                var ctrlGrid = isDark ? '#334155' : '#f1f5f9';
                var ctrlTooltip = isDark ? '#334155' : '#1e293b';
                const propPtColor = pctPropHora.map(v => v === null ? 'transparent' : v >= metaProp ? '#40800c' : '#dc2626');
                const tercPtColor = pctTercHora.map(v => v === null ? 'transparent' : '#e9a23b');

                const ctxPct = document.getElementById('controle-pct-canvas');
                if (!ctxPct) return;
                if (charts['ctrl-pct']) { charts['ctrl-pct'].destroy(); delete charts['ctrl-pct']; }

                // Plugin: linha de meta + preenche área de déficit
                const metaPlugin = {
                    id: 'ctrlMeta',
                    afterDraw(chart) {
                        const y = chart.scales && chart.scales.y;
                        if (!y) return;
                        const { ctx, chartArea: { left, right, top, bottom } } = chart;
                        // Linha de meta 60%
                        const yMeta = y.getPixelForValue(metaProp);
                        ctx.save();
                        ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.setLineDash([8, 4]);
                        ctx.beginPath(); ctx.moveTo(left, yMeta); ctx.lineTo(right, yMeta); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#dc2626';
                        ctx.font = 'bold 10px Plus Jakarta Sans,sans-serif';
                        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
                        ctx.fillText('Meta ' + metaProp + '%', right - 4, yMeta - 3);

                        // Linha de meta terceiro 40%
                        const yMeta2 = y.getPixelForValue(metaTerc);
                        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
                        ctx.beginPath(); ctx.moveTo(left, yMeta2); ctx.lineTo(right, yMeta2); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#f59e0b';
                        ctx.textBaseline = 'top';
                        ctx.fillText('Meta ' + metaTerc + '%', right - 4, yMeta2 + 3);
                        ctx.restore();
                    }
                };
                charts['ctrl-pct'] = new Chart(ctxPct.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: LABELS,
                        datasets: [
                            {
                                label: '% Próprio por hora',
                                data: pctPropHora,
                                borderColor: ctx => {
                                    // será override pelo pointBorderColor; usamos verde como base
                                    return '#40800c';
                                },
                                borderWidth: 2.5,
                                pointRadius: 5,
                                pointBackgroundColor: propPtColor,
                                pointBorderColor: propPtColor,
                                pointBorderWidth: 2,
                                tension: 0.3,
                                fill: {
                                    target: { value: metaProp },
                                    above: 'rgba(64,128,12,0.12)',   // acima da meta: verde claro
                                    below: 'rgba(220,38,38,0.15)'    // abaixo da meta: vermelho claro
                                },
                                segment: {
                                    borderColor: ctx => {
                                        const v = ctx.p1.parsed.y;
                                        return v < metaProp ? '#dc2626' : '#40800c';
                                    }
                                },
                                spanGaps: true,
                                yAxisID: 'y'
                            },
                            {
                                label: '% Terceiro por hora',
                                data: pctTercHora,
                                borderColor: '#e9a23b',
                                borderWidth: 2,
                                pointRadius: 4,
                                pointBackgroundColor: '#e9a23b',
                                tension: 0.3,
                                fill: false,
                                spanGaps: true,
                                yAxisID: 'y'
                            }
                        ]
                    },
                    plugins: [metaPlugin, ChartDataLabels],
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        layout: { padding: { top: 20, right: 60 } },
                        interaction: { mode: 'index', intersect: false },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { font: { size: 10, weight: '700' }, color: ctrlTc, maxRotation: 0 }
                            },
                            y: {
                                min: 0, max: 100,
                                grid: { color: ctrlGrid },
                                ticks: {
                                    font: { size: 10 }, color: ctrlTc2,
                                    callback: v => v + '%',
                                    stepSize: 10
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: true, position: 'bottom',
                                labels: { font: { size: 11, weight: '700' }, padding: 16, usePointStyle: true, color: ctrlTc }
                            },
                            tooltip: {
                                backgroundColor: ctrlTooltip,
                                titleFont: { size: 12, weight: '800' },
                                bodyFont: { size: 11 }, padding: 12,
                                callbacks: {
                                    title: items => `🕐 ${items[0].label}`,
                                    label: ctx => {
                                        const v = ctx.parsed.y;
                                        if (v === null) return null;
                                        const ok = ctx.datasetIndex === 0 ? v >= metaProp : true;
                                        const em = ctx.datasetIndex === 0 ? (ok ? '✅' : '⚠️') : '';
                                        return ` ${ctx.dataset.label}: ${v.toFixed(1)}% ${em}`;
                                    },
                                    afterBody: items => {
                                        const i = items[0].dataIndex;
                                        const p = propVals[i], t = tercVals[i];
                                        if (p + t <= 0) return [];
                                        return ['─────────────────',
                                            ` Próprio: ${p.toFixed(3)}t`,
                                            ` Terceiro: ${t.toFixed(3)}t`,
                                            ` Total hora: ${(p + t).toFixed(3)}t`];
                                    },
                                    filter: item => item.parsed.y !== null
                                }
                            },
                            datalabels: {
                                display: ctx => ctx.datasetIndex === 0 && ctx.dataset.data[ctx.dataIndex] !== null,
                                formatter: v => v.toFixed(0) + '%',
                                color: ctx => ctx.dataset.data[ctx.dataIndex] >= metaProp ? '#15803d' : '#dc2626',
                                font: { size: 9, weight: '800' },
                                anchor: 'top', align: 'top', offset: 2
                            }
                        }
                    }
                });

                // ── Render gráfico barras volume ──────────────────────────────
                const ctxBar = document.getElementById('controle-bar-canvas');
                if (!ctxBar) return;
                if (charts['ctrl-bar']) { charts['ctrl-bar'].destroy(); delete charts['ctrl-bar']; }

                charts['ctrl-bar'] = new Chart(ctxBar.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: LABELS,
                        datasets: [
                            {
                                label: 'Próprio (t)',
                                data: propVals,
                                backgroundColor: propVals.map((_, i) =>
                                    pctPropHora[i] !== null && pctPropHora[i] < metaProp
                                        ? 'rgba(220,38,38,0.5)' : 'rgba(64,128,12,0.5)'),
                                borderColor: propVals.map((_, i) =>
                                    pctPropHora[i] !== null && pctPropHora[i] < metaProp ? '#dc2626' : '#40800c'),
                                borderWidth: 1, borderRadius: 3
                            },
                            {
                                label: 'Terceiro (t)',
                                data: tercVals,
                                backgroundColor: 'rgba(233,162,59,0.45)',
                                borderColor: '#e9a23b',
                                borderWidth: 1, borderRadius: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: {
                                display: true, position: 'bottom',
                                labels: { font: { size: 11, weight: '700' }, padding: 14, usePointStyle: true, color: ctrlTc }
                            },
                            tooltip: {
                                backgroundColor: ctrlTooltip, titleFont: { size: 12, weight: '800' },
                                bodyFont: { size: 11 }, padding: 10,
                                callbacks: {
                                    title: items => `🕐 ${items[0].label}`,
                                    label: ctx => {
                                        const v = ctx.parsed.y;
                                        return v > 0 ? ` ${ctx.dataset.label}: ${v.toFixed(3)}t` : null;
                                    },
                                    filter: item => item.parsed.y > 0
                                }
                            },
                            datalabels: {
                                display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
                                formatter: v => v.toFixed(2),
                                color: '#fff',
                                font: { size: 8, weight: '800' },
                                anchor: 'center', align: 'center', clamp: true,
                                textShadowColor: 'rgba(0,0,0,.4)', textShadowBlur: 2
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: { font: { size: 10, weight: '700' }, color: ctrlTc, maxRotation: 0 }
                            },
                            y: {
                                grid: { color: ctrlGrid },
                                ticks: { font: { size: 10 }, color: ctrlTc2, callback: v => v + 't' }
                            }
                        }
                    },
                    plugins: [ChartDataLabels]
                });
            }, 60);
        }

        // ═══════════════════════════════════════════════════════════════
