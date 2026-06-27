        const DENS_TIPO_CFG = {
            'RODOTREM': { bar: '#0891b2', border: '#0e7490', bg: 'rgba(8,145,178,0.15)' },
            'TREMINHÃO': { bar: '#7c3aed', border: '#6d28d9', bg: 'rgba(124,58,237,0.15)' },
            'OUTRO': { bar: '#64748b', border: '#475569', bg: 'rgba(100,116,139,0.15)' }
        };
        const DENS_META_BOM = 70;
        const DENS_META_MED = 62;
        // Rótulos hora agrícola: 06→23, 00→05
        const HORA_AGR_LABELS = [
            '06h', '07h', '08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h',
            '18h', '19h', '20h', '21h', '22h', '23h', '00h', '01h', '02h', '03h', '04h', '05h'
        ];
        function horaToIdx(h) { return h < 6 ? h + 18 : h - 6; }

        function densGetDias() {
            return [...new Set(densidadeRaw.map(r => r.diaAgricola))].filter(Boolean).sort();
        }
        function densFilterData() {
            return densSelectedDay === 'TODOS' ? densidadeRaw : densidadeRaw.filter(r => r.diaAgricola === densSelectedDay);
        }

        function renderDensidadeTimeline() {
            const tl = document.getElementById('dens-timeline');
            if (!tl) return;
            tl.innerHTML = '';
            const addBtn = (id, label) => {
                const b = document.createElement('div');
                b.className = 'day-badge' + (densSelectedDay === id ? ' active' : '');
                b.innerText = label;
                b.onclick = () => { densSelectedDay = id; renderDensidadeTimeline(); renderDensidade(); };
                tl.appendChild(b);
            };
            addBtn('TODOS', 'SAFRA COMPLETA');
            densGetDias().forEach(d => { const p = d.split('-'); addBtn(d, `${p[2]}/${p[1]}`); });
        }

        // Paleta por frente (até 10 frentes) — pares sólido/tracejado por tipo
        const DENS_FRENTE_PALETA = [
            { base: '#40800c', alt: '#86efac' },
            { base: '#0891b2', alt: '#67e8f9' },
            { base: '#7c3aed', alt: '#c4b5fd' },
            { base: '#ea580c', alt: '#fdba74' },
            { base: '#be185d', alt: '#f9a8d4' },
            { base: '#0f766e', alt: '#99f6e4' },
            { base: '#b45309', alt: '#fde68a' },
            { base: '#1d4ed8', alt: '#93c5fd' },
            { base: '#6b21a8', alt: '#e9d5ff' },
            { base: '#064e3b', alt: '#6ee7b7' },
        ];

        function renderDensidade() {
        var dc = document.body.classList.contains('dark-theme');
        const densCorBase = dc ? '#1e293b' : '#ffffff';
        const densCorSecondary = dc ? '#0f172a' : '#f1f5f9';
        const densCorBorder = dc ? '#334155' : '#e2e8f0';
        const densCorText = dc ? '#ffffff' : '#334155';
        const densCorText2 = dc ? '#ffffff' : '#475569';
        const densCorText3 = dc ? '#ffffff' : '#94a3b8';
        const densCorText4 = dc ? '#ffffff' : '#64748b';
        const densCorHoraBg = dc ? '#1e293b' : '#1e293b';

            const cont = document.getElementById('dens-content');
            if (!cont) return;
            cont.innerHTML = '';
            const data = densFilterData();
            if (!data.length) {
                cont.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8;font-weight:700;font-size:14px;">⏳ Nenhum dado disponível. Carregue o arquivo Producao.xlsx.</div>';
                return;
            }

            // Hora mais recente no topo
            const HORAS_DESC = [5, 4, 3, 2, 1, 0, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6];
            const dayLabel = densSelectedDay === 'TODOS' ? 'Período completo' :
                (() => { const p = densSelectedDay.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; })();

            // Frentes ordenadas numericamente
            const frentes = [...new Set(data.map(r => r.frente))].sort((a, b) =>
                (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));

            // Series: frente × tipo — uma cor por frente
            const series = [];
            frentes.forEach((frente, fi) => {
                const pal = DENS_FRENTE_PALETA[fi % DENS_FRENTE_PALETA.length];
                const fRows = data.filter(r => r.frente === frente);
                const fCode = fRows[0].fCode;
                const nProp = fRows.filter(r => r.camProp).length;
                const nTerc = fRows.filter(r => r.camTerc).length;
                const ownerLabel = nTerc > nProp ? 'TERCEIRO' : 'PRÓPRIO';
                const tipos = [...new Set(fRows.map(r => r.tipoNorm))].sort();
                tipos.forEach((tipo, ti) => {
                    series.push({
                        label: 'F' + fCode + ' ' + tipo + ' - ' + ownerLabel,  // display
                        aggKey: 'F' + fCode + ' ' + tipo,                    // chave interna do agg
                        frente, fCode, tipo,
                        cor: ti === 0 ? pal.base : pal.alt,
                        rows: fRows.filter(r => r.tipoNorm === tipo)
                    });
                });
            });

            // Agrega hora × aggKey → {ps, v}
            const agg = new Map();
            data.forEach(r => {
                const k = r.hora + '||F' + r.fCode + ' ' + r.tipoNorm;
                if (!agg.has(k)) agg.set(k, { ps: 0, v: 0 });
                const e = agg.get(k); e.ps += r.peso; e.v += 1;
            });
            const getDens = (h, aggKey) => {
                const e = agg.get(h + '||' + aggKey);
                return (e && e.v > 0) ? parseFloat((e.ps / e.v).toFixed(1)) : null;
            };

            const horasComDado = HORAS_DESC.filter(h => series.some(s => getDens(h, s.aggKey) !== null));
            const allD = []; horasComDado.forEach(h => series.forEach(s => { const d = getDens(h, s.aggKey); if (d) allD.push(d); }));
            const maxD = allD.length ? Math.max(...allD) : 100;
            const BAR_W = 100; // px largura máxima da barra

            // ── KPI strip ──────────────────────────────────────────────────────
            const kpiWrap = document.createElement('div');
            kpiWrap.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;';
            series.forEach(s => {
                const tp = s.rows.reduce((a, r) => a + r.peso, 0), tv = s.rows.length;
                const td = tv > 0 ? tp / tv : 0;
                const cls = td >= DENS_META_BOM ? 'densidade-otimo' : td >= DENS_META_MED ? 'densidade-mediano' : 'densidade-ruim';
                const kpi = document.createElement('div');
                kpi.className = 'kpi-card ' + cls;
                kpi.style.cssText = 'flex:1;min-width:130px;border-left:4px solid ' + s.cor + ';';
                kpi.innerHTML = '<small>' + s.label + '</small>'
                    + '<span class="val">' + td.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                    + ' <span style="font-size:.7rem">kg/vg</span></span>'
                    + '<div class="meta-info">' + tv + 'vg · ' + (tp / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 't</div>';
                kpiWrap.appendChild(kpi);
            });
            cont.appendChild(kpiWrap);

            // ── Card com título e legenda ───────────────────────────────────────
            const card = document.createElement('div');
            card.className = 'balance-card';
            card.style.cssText = 'padding:24px;';

            const legItems = series.map(s =>
                '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:' + densCorText + ';margin-right:14px;white-space:nowrap;">'
                + '<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:' + s.cor + ';flex-shrink:0;"></span>' + s.label + '</span>'
            ).join('');

            card.innerHTML =
                '<div class="balance-card-title" style="border-left-color:#40800c;margin-bottom:8px;color:' + densCorText + ';' + (dc ? 'text-shadow:0 1px 2px rgba(0,0,0,0.5);' : '') + '">'
                + '📊 Densidade de Carga por Frente · Hora Agrícola 06:00→05:59 · ' + dayLabel + '</div>'
                + '<div style="font-size:11px;color:' + densCorText4 + ';margin-bottom:10px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">'
                + '<span style="font-weight:700;color:#16a34a;">● Meta ≥' + DENS_META_BOM + 'kg</span>'
                + '<span style="font-weight:700;color:#f59e0b;">● Mediano ≥' + DENS_META_MED + 'kg</span>'
                + '<span style="font-weight:700;color:#ef4444;">● Abaixo &lt;' + DENS_META_MED + 'kg</span>'
                + '<span style="font-size:10px;color:' + densCorText3 + ';margin-left:auto;">↑ Mais recente no topo</span>'
                + '</div>'
                + '<div style="margin-bottom:16px;line-height:2.2;">' + legItems + '</div>'
                + '<div id="dens-blocos"></div>';
            cont.appendChild(card);

            const grid = card.querySelector('#dens-blocos');

            // ── Um card por hora ───────────────────────────────────────────────
            horasComDado.forEach(h => {
                const seriesNaHora = series.filter(s => getDens(h, s.aggKey) !== null);
                const medHora = seriesNaHora.reduce((sum, s) => sum + getDens(h, s.aggKey), 0) / seriesNaHora.length;
                const medCor = medHora >= DENS_META_BOM ? '#16a34a' : medHora >= DENS_META_MED ? '#f59e0b' : '#ef4444';
                const medEmj = medHora >= DENS_META_BOM ? '🟢' : medHora >= DENS_META_MED ? '🟡' : '🔴';

                // Container do bloco hora
                const bloco = document.createElement('div');
                bloco.style.cssText = 'display:flex;align-items:stretch;margin-bottom:8px;'
                    + 'border:1px solid ' + densCorBorder + ';border-radius:14px;overflow:hidden;';

                // Coluna esquerda: hora + média
                const horaCol = document.createElement('div');
                horaCol.style.cssText = 'min-width:68px;max-width:68px;flex-shrink:0;'
                    + 'background:' + densCorHoraBg + ';color:#fff;'
                    + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
                    + 'padding:10px 4px;gap:3px;';
                horaCol.innerHTML =
                    '<div style="font-size:16px;font-weight:900;line-height:1;">' + String(h).padStart(2, '0') + 'h</div>'
                    + '<div style="font-size:11px;font-weight:800;color:' + medCor + ';margin-top:5px;">' + medHora.toFixed(1) + 'kg</div>'
                    + '<div style="font-size:11px;line-height:1;">' + medEmj + '</div>';

                // Coluna direita: frentes lado a lado
                const frentesRow = document.createElement('div');
                frentesRow.style.cssText = 'flex:1;display:flex;flex-wrap:wrap;align-items:center;'
                    + 'padding:8px 10px;gap:8px;background:' + densCorBase + ';';

                seriesNaHora.forEach(s => {
                    const d = getDens(h, s.aggKey);
                    const barPx = Math.max(4, Math.round((d / maxD) * BAR_W));
                    const barCor = d >= DENS_META_BOM ? s.cor : d >= DENS_META_MED ? '#f59e0b' : '#ef4444';
                    const e = agg.get(h + '||' + s.aggKey);
                    const viag = e ? e.v : 0;

                    // Mini-card por frente
                    const fc = document.createElement('div');
                    fc.style.cssText = 'display:flex;flex-direction:column;gap:3px;'
                        + 'border-left:3px solid ' + s.cor + ';padding-left:8px;min-width:140px;';

                    // Linha: label
                    fc.innerHTML =
                        '<div style="font-size:10px;font-weight:800;color:' + densCorText2 + ';white-space:nowrap;">' + s.label + '</div>'
                        // Barra + valor dentro
                        + '<div style="display:flex;align-items:center;gap:6px;">'
                        + '<div style="width:' + BAR_W + 'px;flex-shrink:0;background:' + densCorSecondary + ';border-radius:4px;height:20px;overflow:hidden;">'
                        + '<div style="width:' + barPx + 'px;height:100%;background:' + barCor + ';border-radius:4px;'
                        + 'display:flex;align-items:center;justify-content:flex-end;padding-right:4px;">'
                        + '<span style="color:#fff;font-size:10px;font-weight:900;text-shadow:0 1px 2px rgba(0,0,0,.5);">' + d.toFixed(0) + '</span>'
                        + '</div></div>'
                        + '<div style="display:flex;flex-direction:column;line-height:1.2;">'
                        + '<span style="font-size:11px;font-weight:800;color:' + densCorText + ';">' + d.toFixed(1) + ' kg</span>'
                        + '<span style="font-size:10px;color:' + densCorText3 + ';font-weight:600;">' + viag + 'vg</span>'
                        + '</div></div>';

                    frentesRow.appendChild(fc);
                });

                bloco.appendChild(horaCol);
                bloco.appendChild(frentesRow);
                grid.appendChild(bloco);
            });
        }

