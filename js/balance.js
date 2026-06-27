        function processBalanceData(rows) {
            if (!rows || rows.length < 2) return;
            // ── Mescla cabeçalhos multi‑linha (ex: 1ª linha tem nomes, 2ª linha tem Peso Líquido etc.) ──
            if (rows.length > 2) {
                const r0 = rows[0], r1 = rows[1];
                let merged = false;
                for (let i = 0; i < Math.max(r0.length, r1.length); i++) {
                    const p = String(r0[i] || '').trim();
                    const s = String(r1[i] || '').trim();
                    if (!p && s) {
                        r0[i] = s;
                        merged = true;
                    }
                }
                if (merged) rows.splice(1, 1); // remove a 2ª linha de cabeçalho
            }
            const headers = rows[0].map(h => normalize(h));
            const idxQtd = headers.findIndex(h => h.includes("QTD") && h.includes("VIAGEM"));
            const idx = {
                dia: headers.findIndex(h => h === "DIA BALANCA" || h === "DIA"),
                data: headers.findIndex(h => h.includes("DATA") && h.includes("ENTRADA")),
                peso: headers.findIndex(h => h.includes("PESO") && h.includes("LIQ") || h.includes("PESO LÍQUIDO")),
                qtd: idxQtd,
                viagem: headers.findIndex((h, i) => h === "VIAGEM" || (h.includes("VIAGEM") && i !== idxQtd)),
                tipoProp: headers.findIndex(h => h.includes("DSC") && h.includes("TIPO") && h.includes("PROP")),
                tipoPropFA: headers.findIndex(h => h.includes("TIPO") && h.includes("PROPRIETARIO")),
                frota: headers.findIndex(h => h.includes("FROTA") && h.includes("MOTRIZ")),
                raio: headers.findIndex(h => h.includes("DIST") && h.includes("MEDIA")),
                colh1: headers.findIndex(h => (h.includes("CARREG") || h.includes("COLHED")) && h.includes("1") && !h.includes("2") && !h.includes("3")),
                tipoCarga: headers.findIndex(h => h.includes("TIPO") && h.includes("CARGA"))
            };

            const viagensMap = new Map();

            for (const r of rows.slice(1)) {
                if (!r || r.every(c => c === "" || c === null)) continue;
                const peso = parseNum(r[idx.peso]);
                if (!(peso > 0)) continue;

                const viagemId = String(r[idx.viagem] || '').trim();
                if (!viagemId || viagemId === "TOTAL") continue;

                const dia = parseDateISO(r[idx.dia]) || parseDateISO(r[idx.data]);
                let frota = String(r[idx.frota] || '').trim();
                let colh = String(r[idx.colh1] || '').trim();
                let tipo = normalize(r[idx.tipoProp]);
                if (!tipo) tipo = normalize(r[idx.tipoPropFA]);
                let raio = parseNum(r[idx.raio]);
                let tipoCarga = String(r[idx.tipoCarga] || '').trim();

                const colhProp = classColh(colh) === 'propria';
                const colhTerc = classColh(colh) === 'terceira';
                let camProp = classFrota(frota) === 'proprio';
                let camTerc = classFrota(frota) === 'terceiro';
                if (!camProp && !camTerc) {
                    camProp = tipo.includes('PROPRI');
                    camTerc = tipo.includes('FRETE') || tipo.includes('TERCEIRO') || tipo.includes('FRETISTA') || tipo.includes('FORNECEDOR');
                }

                // Classificar pelo Tipo Carga
                const subtipoProprio = camProp ? classificarTipoVeiculoProprio(tipoCarga) : null;

                if (!viagensMap.has(viagemId)) {
                    viagensMap.set(viagemId, {
                        viagemId: viagemId,
                        dia: dia,
                        pesoTotal: 0,
                        colhProp: colhProp,
                        colhTerc: colhTerc,
                        camProp: camProp,
                        camTerc: camTerc,
                        subtipoProprio: subtipoProprio,
                        raio: raio,
                        contagemLinhas: 0,
                        frota: frota,
                        tipoCarga: tipoCarga
                    });
                }

                const viagem = viagensMap.get(viagemId);
                viagem.pesoTotal += peso;
                viagem.contagemLinhas++;

                if (colhProp) viagem.colhProp = true;
                if (colhTerc) viagem.colhTerc = true;
                if (camProp) viagem.camProp = true;
                if (camTerc) viagem.camTerc = true;

                // Atualizar subtipo se necessário
                const novoSubtipo = camProp ? classificarTipoVeiculoProprio(tipoCarga) : null;
                if (novoSubtipo && novoSubtipo !== "outro") {
                    viagem.subtipoProprio = novoSubtipo;
                }

                viagem.raio = (viagem.raio + raio) / viagem.contagemLinhas;
            }

            balanceData = Array.from(viagensMap.values()).map(v => ({
                dia: v.dia,
                peso: v.pesoTotal,
                colhProp: v.colhProp,
                colhTerc: v.colhTerc,
                camProp: v.camProp,
                camTerc: v.camTerc,
                subtipoProprio: v.subtipoProprio,
                raio: v.raio,
                frota: v.frota,
                tipoCarga: v.tipoCarga
            }));

            // ── COA: cargas únicas por dia ──────────────────────────────────────
            const idxCarga = headers.findIndex(h => h === 'CARGA');
            const idxAnalisado = headers.findIndex(h => h === 'ANALISADO');
            const coaMap = new Map(); // key: dia|cargaId → {dia, cargaId, analisado}
            if (idxCarga >= 0 && idxAnalisado >= 0) {
                for (const r of rows.slice(1)) {
                    if (!r || r.every(c => c === '' || c === null)) continue;
                    const cargaId = String(r[idxCarga] || '').trim();
                    const analStr = normalize(r[idxAnalisado]);
                    const dia = parseDateISO(r[idx.dia]) || parseDateISO(r[idx.data]);
                    if (!cargaId) continue;
                    const key = `${dia}|${cargaId}`;
                    if (!coaMap.has(key)) {
                        coaMap.set(key, { dia, cargaId, analisado: analStr === 'SIM' });
                    }
                }
            }
            coaData = Array.from(coaMap.values());
            // ───────────────────────────────────────────────────────────────────

            // ── HORÁRIA: entrada de cana por hora e por frente ───────────────────
            const idxHora = headers.findIndex(h => h === 'HORA');
            const idxFrente = headers.findIndex(h => h.includes('COD') && h.includes('FRENTE'));
            const horariaMap2 = new Map(); // key: dia|hora|frente|prop → {peso}
            if (idxHora >= 0 && idxFrente >= 0) {
                for (const r of rows.slice(1)) {
                    if (!r || r.every(c => c === '' || c === null)) continue;
                    const peso = parseNum(r[idx.peso]);
                    if (!(peso > 0)) continue;
                    const dia = parseDateISO(r[idx.dia]) || parseDateISO(r[idx.data]);
                    let hora = parseInt(String(r[idxHora] || '').trim());
                    const fCode = String(r[idxFrente] || '').trim();
                    if (isNaN(hora) || !fCode) continue;
                    const frente = 'Frente ' + fCode.padStart(2, '0');
                    // proprio vs terceiro
                    let frotaH = String(r[idx.frota] || '').trim();
                    let tipoH = normalize(r[idx.tipoProp] || '');
                    if (!tipoH) tipoH = normalize(r[idx.tipoPropFA] || '');
                    let isProp = classFrota(frotaH) === 'proprio'
                        || tipoH.includes('PROPRI');
                    let isTerc = classFrota(frotaH) === 'terceiro'
                        || tipoH.includes('FRETE') || tipoH.includes('TERCEIRO')
                        || tipoH.includes('FRETISTA') || tipoH.includes('FORNECEDOR');
                    const ownership = isProp ? 'proprio' : isTerc ? 'terceiro' : 'proprio';
                    const key = `${dia}|${hora}|${frente}|${ownership}`;
                    horariaMap2.set(key, (horariaMap2.get(key) || 0) + peso);
                }
            }
            horariaRaw = Array.from(horariaMap2.entries()).map(([k, peso]) => {
                const parts = k.split('|');
                return { dia: parts[0], hora: parseInt(parts[1]), frente: parts[2], ownership: parts[3], peso };
            });
            // ─────────────────────────────────────────────────────────────────────

            // ── DENSIDADE: por viagem única, frente, tipo carga, hora agrícola ───
            // Dia agrícola: 06:00 do dia D até 05:59 do dia D+1
            // horaAgricola: 06→23 = posições 0→17, 00→05 = posições 18→23
            const densMap = new Map(); // key: viagem → record
            if (idxHora >= 0 && idxFrente >= 0) {
                for (const r of rows.slice(1)) {
                    if (!r || r.every(c => c === '' || c === null)) continue;
                    const peso = parseNum(r[idx.peso]);
                    if (!(peso > 0)) continue;
                    const viagemId = String(r[idx.viagem] || '').trim();
                    if (!viagemId || viagemId === 'TOTAL') continue;
                    const dia = parseDateISO(r[idx.dia]) || parseDateISO(r[idx.data]);
                    const horaRaw = parseInt(String(r[idxHora] || '').trim());
                    const fCode = String(r[idxFrente] || '').trim();
                    const tCarga = String(r[idx.tipoCarga] || '').trim();
                    if (isNaN(horaRaw) || !fCode || !dia) continue;

                    // Normaliza tipo de carga
                    const tUp = tCarga.toUpperCase();
                    let tipoNorm;
                    if (tUp.includes('RODOTREM') || tUp.includes('ROMEU')) tipoNorm = 'RODOTREM';
                    else if (tUp.includes('TREMINHAO') || tUp.includes('TREMINHÃO')) tipoNorm = 'TREMINHÃO';
                    else tipoNorm = tCarga || 'OUTRO';

                    // Dia agrícola: horas 0-5 pertencem ao dia anterior+1
                    let diaAgricola = dia;
                    if (horaRaw < 6) {
                        // pertence ao dia agrícola que começou ontem
                        const d = new Date(dia + 'T12:00:00');
                        d.setDate(d.getDate() - 1);
                        diaAgricola = d.toISOString().split('T')[0];
                    }
                    // horaAgricola: reordena 06,07,...,23,00,01,02,03,04,05
                    const horaAgricola = horaRaw < 6 ? horaRaw + 24 : horaRaw;

                    const frente = 'Frente ' + fCode.padStart(2, '0');
                    const key = `${viagemId}`;
                    // proprio vs terceiro
                    let frotaD = String(r[idx.frota] || '').trim();
                    let tipoD = normalize(r[idx.tipoProp] || '');
                    if (!tipoD) tipoD = normalize(r[idx.tipoPropFA] || '');
                    const dIsProp = classFrota(frotaD) === 'proprio' || tipoD.includes('PROPRI');
                    const dIsTerc = classFrota(frotaD) === 'terceiro'
                        || tipoD.includes('FRETE') || tipoD.includes('TERCEIRO')
                        || tipoD.includes('FRETISTA') || tipoD.includes('FORNECEDOR');
                    if (!densMap.has(key)) {
                        densMap.set(key, { dia, diaAgricola, hora: horaRaw, horaAgricola, frente, fCode, tipoCarga: tCarga, tipoNorm, viagem: viagemId, peso: 0, camProp: dIsProp, camTerc: dIsTerc });
                    }
                    densMap.get(key).peso += peso;
                }
            }
            densidadeRaw = Array.from(densMap.values());
            densSelectedDay = 'TODOS';
            controleSelectedDay = 'TODOS';
            renderDensidadeTimeline();
            renderDensidade();
            // ─────────────────────────────────────────────────────────────────────

            // ── PERMANÊNCIA: ciclo industrial completo por viagem ────────────────
            // Busca colunas com múltiplas estratégias
            function pmFind(predicate) { return headers.findIndex(predicate); }
            function pmFindInSet(keywords) {
                const norm = h => normalize(h);
                // 1° pass: igualdade exata
                for (let i = 0; i < headers.length; i++) {
                    const hn = norm(headers[i]);
                    for (const kw of keywords) {
                        if (hn === kw) return i;
                    }
                }
                // 2° pass: contém (parcial)
                for (let i = 0; i < headers.length; i++) {
                    const hn = norm(headers[i]);
                    for (const kw of keywords) {
                        if (hn.includes(kw)) return i;
                    }
                }
                return -1;
            }
            function pmIsDt(h) { return h.includes('DATA') || h.includes('HORA') || h.includes('DT'); }

            const idxViag = headers.findIndex((h, i) => normalize(h) === 'VIAGEM' || (normalize(h).includes('VIAGEM') && i !== headers.findIndex(hh => normalize(hh).includes('QTD') && normalize(hh).includes('VIAGEM'))));
            const idxCodMot = pmFindInSet(['COD MOTORISTA', 'CODIGO MOTORISTA', 'COD MOT', 'CODMOT']);
            const idxNomMot = pmFindInSet(['DSC MOTORISTA', 'NOME MOTORISTA', 'MOTORISTA', 'NOMEMOT']);
            const idxFrotaM = pmFindInSet(['FROTA MOTRIZ', 'FROTA', 'NR FROTA', 'NUMERO FROTA']);
            const idxTipoPF = pmFindInSet(['DSC TIPO PROP', 'TIPO PROPRIETARIO', 'TIPO PROP', 'PROPRIETARIO']);

            const idxDtEnt = pmFindInSet(['DATA ENTRADA', 'DT ENTRADA', 'ENTRADA']) || pmFind(h => h.includes('ENTRADA') && pmIsDt(h) && !h.includes('SAIDA') && !h.includes('USINA'));
            const idxHoraEnt = pmFindInSet(['HORA ENTRADA', 'HR ENTRADA']);
            const idxDtSonda = pmFindInSet(['DATA SONDA', 'DT SONDA', 'SONDA']) || pmFind(h => h.includes('SONDA') && pmIsDt(h));
            const idxHoraSonda = pmFindInSet(['HORA SONDA', 'HR SONDA']);
            const idxDtDentro = pmFindInSet(['DATA DENTRO USINA', 'DT DENTRO USINA', 'ENTRADA USINA', 'USINA']) || pmFind(h => (h.includes('DENTRO') && h.includes('USINA')) || (h.includes('ENTRADA') && h.includes('USINA')) || h === 'USINA') && pmIsDt(h);
            const idxHoraDentro = pmFindInSet(['HORA DENTRO USINA', 'HR DENTRO USINA', 'HORA USINA']);
            const idxDtSai = pmFindInSet(['DATA SAIDA', 'DT SAIDA', 'SAIDA']) || pmFind(h => h.includes('SAIDA') && pmIsDt(h));
            const idxHoraSai = pmFindInSet(['HORA SAIDA', 'HR SAIDA']);

            function pmPickDT(row, idxMain, idxHora, baseDate) {
                let dt = idxMain >= 0 ? parseAgroDateTime(row[idxMain], baseDate) : null;
                if (dt && idxHora >= 0) {
                    const hdt = parseAgroDateTime(row[idxHora], dt);
                    if (hdt) dt = hdt;
                }
                if (!dt && idxHora >= 0 && baseDate) dt = parseAgroDateTime(row[idxHora], baseDate);
                return dt;
            }
            function pmFixAfter(prev, dt) {
                if (!prev || !dt) return dt;
                const out = new Date(dt.getTime());
                while (out < prev && (prev - out) <= 18 * 3600000) out.setDate(out.getDate() + 1);
                return out;
            }
            function pmMinBetween(a, b) { return a && b ? Math.max(0, (b - a) / 60000) : null; }
            function pmFmtTime(dt) { return dt ? dt.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'; }
            function pmValidYear(y) { return y >= 2020 && y <= 2030; }

            const permMap = new Map();
            if (idxDtEnt >= 0 && idxDtSai >= 0 && idxViag >= 0) {
                for (const r of rows.slice(1)) {
                    if (!r || r.every(c => c === '' || c === null)) continue;
                    const viagem = String(r[idxViag] || '').trim();
                    if (!viagem || viagem === 'TOTAL') continue;

                    let entradaDT = pmPickDT(r, idxDtEnt, idxHoraEnt, null);
                    if (!entradaDT || !pmValidYear(entradaDT.getFullYear())) continue;
                    let sondaDT = pmPickDT(r, idxDtSonda, idxHoraSonda, entradaDT);
                    sondaDT = pmFixAfter(entradaDT, sondaDT);
                    let dentroDT = pmPickDT(r, idxDtDentro, idxHoraDentro, sondaDT || entradaDT);
                    dentroDT = pmFixAfter(sondaDT || entradaDT, dentroDT);
                    let saidaDT = pmPickDT(r, idxDtSai, idxHoraSai, dentroDT || sondaDT || entradaDT);
                    saidaDT = pmFixAfter(dentroDT || sondaDT || entradaDT, saidaDT);
                    if (!saidaDT || !pmValidYear(saidaDT.getFullYear())) continue;

                    const durMin = pmMinBetween(entradaDT, saidaDT);
                    if (durMin == null || durMin < 0 || durMin > 1440) continue;

                    const frota = String(r[idxFrotaM >= 0 ? idxFrotaM : 0] || '').trim();
                    const codMot = String(r[idxCodMot >= 0 ? idxCodMot : 0] || '').trim();
                    const nomeMot = String(r[idxNomMot >= 0 ? idxNomMot : 0] || '').trim();
                    const tipoPF = normalize(r[idxTipoPF >= 0 ? idxTipoPF : 0] || '');
                    const tipo = tipoPF.includes('TERCEIRO') || tipoPF.includes('FRETE') || tipoPF.includes('FRETISTA') || tipoPF.includes('FORNECEDOR') || frota.startsWith('91') ? 'terceiro' : 'proprio';
                    const dia = agrosyncToISODate(entradaDT);
                    const etapas = {
                        entradaSonda: pmMinBetween(entradaDT, sondaDT),
                        sondaUsina: pmMinBetween(sondaDT, dentroDT),
                        usinaSaida: pmMinBetween(dentroDT, saidaDT),
                        entradaSaida: durMin
                    };

                    if (!permMap.has(viagem)) {
                        permMap.set(viagem, {
                            viagem,
                            frota,
                            codMot,
                            nomeMot,
                            nomMot: nomeMot,
                            tipo,
                            dia,
                            entradaDT,
                            sondaDT,
                            dentroDT,
                            saidaDT,
                            entradaStr: pmFmtTime(entradaDT),
                            sondaStr: pmFmtTime(sondaDT),
                            dentroStr: pmFmtTime(dentroDT),
                            saidaStr: pmFmtTime(saidaDT),
                            etapas,
                            durMin,
                            pontosDetectados: {
                                entrada: idxDtEnt >= 0,
                                sonda: idxDtSonda >= 0 || idxHoraSonda >= 0,
                                dentro: idxDtDentro >= 0 || idxHoraDentro >= 0,
                                saida: idxDtSai >= 0
                            }
                        });
                    }
                }
            }

            // ── Fallback: se processBalanceData não encontrou ENTRADA/SAIDA, tenta
            // derivar permanência dos dados Solinftec (atividades Mesa/DentroUsina)
            if (permMap.size === 0 && Array.isArray(solinftecFrotaAtividades) && solinftecFrotaAtividades.length) {
                function pmParseDate(v) {
                    if (!v) return null;
                    var m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                    if (m) {
                        var y = +m[3], mo1 = +m[2] - 1, d1 = +m[1], mo2 = +m[1] - 1, d2 = +m[2];
                        // Tenta DD/MM/YYYY
                        var dt = new Date(y, mo1, d1);
                        if (dt && dt.getFullYear() >= 2020 && dt.getFullYear() <= 2030) return agrosyncToISODate(dt);
                        // Tenta MM/DD/YYYY
                        dt = new Date(y, mo2, d2);
                        if (dt && dt.getFullYear() >= 2020 && dt.getFullYear() <= 2030) return agrosyncToISODate(dt);
                    }
                    return parseDateISO(v);
                }
                var saidaAtividades = {};
                solinftecFrotaAtividades.forEach(function(a) {
                    if (!a.frota || !a.data) return;
                    var key = a.frota + '|' + a.data;
                    if (!saidaAtividades[key]) saidaAtividades[key] = { frota: a.frota, data: a.data, atividades: {} };
                    saidaAtividades[key].atividades[a.operacao] = (saidaAtividades[key].atividades[a.operacao] || 0) + (a.segundos || 0);
                });
                Object.keys(saidaAtividades).forEach(function(k) {
                    var g = saidaAtividades[k];
                    var durMin = Math.round(((g.atividades['3054'] || 0) + (g.atividades['2030'] || 0) + (g.atividades['3048'] || 0) + (g.atividades['2031'] || 0)) / 60);
                    if (durMin <= 0) return;
                    var diaStr = pmParseDate(g.data);
                    permMap.set('sol_' + g.frota + '_' + g.data, {
                        viagem: 'sol_' + g.frota + '_' + g.data,
                        frota: g.frota,
                        codMot: '',
                        nomeMot: '',
                        nomMot: '',
                        tipo: g.frota.startsWith('91') ? 'terceiro' : 'proprio',
                        dia: diaStr,
                        entradaDT: null,
                        sondaDT: null,
                        dentroDT: null,
                        saidaDT: null,
                        entradaStr: '—',
                        sondaStr: '—',
                        dentroStr: '—',
                        saidaStr: '—',
                        etapas: { entradaSonda: null, sondaUsina: null, usinaSaida: null, entradaSaida: durMin },
                        durMin: durMin,
                        pontosDetectados: { entrada: false, sonda: false, dentro: false, saida: false }
                    });
                });
            }

            permanenciaData = Array.from(permMap.values());
            permanenciaSelectedDay = 'TODOS';
            renderPermanenciaDetalhada();
            // ─────────────────────────────────────────────────────────────────────

            balanceLoaded = true;
            selectedDay = "TODOS";
            renderBalanceTimeline();
            renderBalance();
            updateStatus();
        }

        function renderBalanceTimeline() {
            const dias = [...new Set(balanceData.map(d => d.dia))].filter(Boolean).sort();
            const container = document.getElementById('balance-timeline');
            if (!container) return;
            container.innerHTML = '';
            const addBtn = (id, label) => {
                const btn = document.createElement('div');
                btn.className = `day-badge ${selectedDay === id ? 'active' : ''}`;
                btn.innerText = label;
                btn.onclick = () => { selectedDay = id; renderBalance(); renderBalanceTimeline(); };
                container.appendChild(btn);
            };
            addBtn("TODOS", "SAFRA COMPLETA");
            dias.forEach(d => { const p = d.split('-'); addBtn(d, `${p[2]}/${p[1]}`); });
        }

        function renderBalance() {
            if (!balanceLoaded) return;
            const dados = selectedDay === "TODOS" ? balanceData : balanceData.filter(d => d.dia === selectedDay);

            let k = { p80: 0, p83: 0, tProp: 0, tTerc: 0, vProp: 0, vTerc: 0 };
            let raioPropArr = [], raioTercArr = [];

            let rodotrem = { tons: 0, viagens: 0, raios: [] };
            let treminhao = { tons: 0, viagens: 0, raios: [] };

            dados.forEach(d => {
                if (d.colhProp) k.p80 += d.peso;
                if (d.colhTerc) k.p83 += d.peso;
                if (d.camProp) {
                    k.tProp += d.peso;
                    k.vProp += 1;
                    if (d.raio > 0) raioPropArr.push(d.raio);

                    // Classificar pelo subtipo
                    if (d.subtipoProprio === "rodotrem") {
                        rodotrem.tons += d.peso;
                        rodotrem.viagens += 1;
                        if (d.raio > 0) rodotrem.raios.push(d.raio);
                    } else if (d.subtipoProprio === "treminhao") {
                        treminhao.tons += d.peso;
                        treminhao.viagens += 1;
                        if (d.raio > 0) treminhao.raios.push(d.raio);
                    } else {
                        // Tentar classificar novamente pelo tipoCarga
                        const novaClassif = classificarTipoVeiculoProprio(d.tipoCarga);
                        if (novaClassif === "rodotrem") {
                            rodotrem.tons += d.peso;
                            rodotrem.viagens += 1;
                            if (d.raio > 0) rodotrem.raios.push(d.raio);
                        } else if (novaClassif === "treminhao") {
                            treminhao.tons += d.peso;
                            treminhao.viagens += 1;
                            if (d.raio > 0) treminhao.raios.push(d.raio);
                        }
                    }
                }
                if (d.camTerc) {
                    k.tTerc += d.peso;
                    k.vTerc += 1;
                    if (d.raio > 0) raioTercArr.push(d.raio);
                }
            });

            const totalC = k.p80 + k.p83;
            const totalT = k.tProp + k.tTerc;
            const pct80 = totalC > 0 ? (k.p80 / totalC * 100) : 0;
            const pct83 = totalC > 0 ? (k.p83 / totalC * 100) : 0;
            const pctPT = totalT > 0 ? (k.tProp / totalT * 100) : 0;
            const pctTT = totalT > 0 ? (k.tTerc / totalT * 100) : 0;

            const densProp = k.vProp > 0 ? k.tProp / k.vProp : 0;
            const densTerc = k.vTerc > 0 ? k.tTerc / k.vTerc : 0;
            const densMediaGeral = (totalT > 0 && (k.vProp + k.vTerc) > 0) ? totalT / (k.vProp + k.vTerc) : 0;
            const densRodotrem = rodotrem.viagens > 0 ? rodotrem.tons / rodotrem.viagens : 0;
            const densTreminhao = treminhao.viagens > 0 ? treminhao.tons / treminhao.viagens : 0;

            const densPropMsg = getDensidadeMensagem(densProp, k.vProp);
            const densTercMsg = getDensidadeMensagem(densTerc, k.vTerc);
            const densMediaMsg = getDensidadeMensagem(densMediaGeral, (k.vProp + k.vTerc));
            const densRodotremMsg = getDensidadeMensagem(densRodotrem, rodotrem.viagens);
            const densTreminhaoMsg = getDensidadeMensagem(densTreminhao, treminhao.viagens);

            const propCard = document.getElementById('prop-card');
            const tercCard = document.getElementById('terc-card');
            const densMediaCard = document.getElementById('dens-media-card');
            const rodotremCard = document.getElementById('rodotrem-card');
            const treminhaoCard = document.getElementById('treminhao-card');

            if (propCard) {
                propCard.classList.remove('densidade-ruim', 'densidade-mediano', 'densidade-otimo');
                propCard.classList.add(densPropMsg.class);
            }
            if (tercCard) {
                tercCard.classList.remove('densidade-ruim', 'densidade-mediano', 'densidade-otimo');
                tercCard.classList.add(densTercMsg.class);
            }
            if (densMediaCard) {
                densMediaCard.classList.remove('densidade-ruim', 'densidade-mediano', 'densidade-otimo');
                densMediaCard.classList.add(densMediaMsg.class);
            }
            if (rodotremCard) {
                rodotremCard.classList.remove('densidade-ruim', 'densidade-mediano', 'densidade-otimo');
                rodotremCard.classList.add(densRodotremMsg.class);
            }
            if (treminhaoCard) {
                treminhaoCard.classList.remove('densidade-ruim', 'densidade-mediano', 'densidade-otimo');
                treminhaoCard.classList.add(densTreminhaoMsg.class);
            }

            const bar80 = document.getElementById('bar-80'); if (bar80) { bar80.style.width = pct80 + '%'; bar80.innerText = pct80.toFixed(1) + '%'; bar80.style.backgroundColor = getColorByMeta(pct80, 58); }
            const bar83 = document.getElementById('bar-83'); if (bar83) { bar83.style.width = pct83 + '%'; bar83.innerText = pct83.toFixed(1) + '%'; bar83.style.backgroundColor = getColorByMeta(pct83, 42); }
            const barProp = document.getElementById('bar-prop-h'); if (barProp) { barProp.style.width = pctPT + '%'; barProp.innerText = pctPT.toFixed(1) + '%'; barProp.style.backgroundColor = getColorByMeta(pctPT, 60); }
            const barTerc = document.getElementById('bar-terc-h'); if (barTerc) { barTerc.style.width = pctTT + '%'; barTerc.innerText = pctTT.toFixed(1) + '%'; barTerc.style.backgroundColor = getColorByMeta(pctTT, 40); }

            const txt80 = document.getElementById('txt-80'); if (txt80) txt80.innerText = fmtT(k.p80);
            const txt83 = document.getElementById('txt-83'); if (txt83) txt83.innerText = fmtT(k.p83);
            const valf80 = document.getElementById('val-f80'); if (valf80) valf80.innerText = fmtT(k.p80);
            const valf83 = document.getElementById('val-f83'); if (valf83) valf83.innerText = fmtT(k.p83);
            const valCampo = document.getElementById('val-campo-total'); if (valCampo) valCampo.innerText = fmtT(totalT);

            const txtProp = document.getElementById('txt-prop-bar'); if (txtProp) txtProp.innerText = fmtT(k.tProp);
            const txtTerc = document.getElementById('txt-terc-bar'); if (txtTerc) txtTerc.innerText = fmtT(k.tTerc);

            const propComposicao = document.getElementById('prop-composicao');
            if (propComposicao) {
                propComposicao.innerHTML = `Meta🟢: 60% (Rodotrem: ${fmtT(rodotrem.tons)} + Treminhão: ${fmtT(treminhao.tons)})`;
            }

            const valTProp = document.getElementById('val-t-prop'); if (valTProp) valTProp.innerText = fmtT(k.tProp);
            const valTTerc = document.getElementById('val-t-terc'); if (valTTerc) valTTerc.innerText = fmtT(k.tTerc);
            const cntVProp = document.getElementById('cnt-v-prop'); if (cntVProp) cntVProp.innerText = k.vProp;
            const cntVTerc = document.getElementById('cnt-v-terc'); if (cntVTerc) cntVTerc.innerText = k.vTerc;
            const valTransp = document.getElementById('val-transp-total'); if (valTransp) valTransp.innerText = fmtT(totalT);

            const densPropElem = document.getElementById('dens-prop');
            if (densPropElem) densPropElem.innerText = densProp.toFixed(2).replace('.', ',') + ' t/viagem';

            const densTercElem = document.getElementById('dens-terc');
            if (densTercElem) densTercElem.innerText = densTerc.toFixed(2).replace('.', ',') + ' t/viagem';

            const densMediaElem = document.getElementById('dens-media-geral');
            if (densMediaElem) densMediaElem.innerText = densMediaGeral.toFixed(2).replace('.', ',') + ' t/viagem';

            const densPropInfo = document.getElementById('dens-prop-info');
            if (densPropInfo) densPropInfo.innerHTML = densPropMsg.mensagem;

            const densTercInfo = document.getElementById('dens-terc-info');
            if (densTercInfo) densTercInfo.innerHTML = densTercMsg.mensagem;

            const densMediaInfo = document.getElementById('dens-media-info');
            if (densMediaInfo) densMediaInfo.innerHTML = densMediaMsg.mensagem;

            const raioProp = document.getElementById('raio-prop'); if (raioProp) raioProp.innerText = avg(raioPropArr).toFixed(2).replace('.', ',') + ' km';
            const raioTerc = document.getElementById('raio-terc'); if (raioTerc) raioTerc.innerText = avg(raioTercArr).toFixed(2).replace('.', ',') + ' km';

            const rodotremTons = document.getElementById('rodotrem-tons');
            if (rodotremTons) rodotremTons.innerText = fmtT(rodotrem.tons);

            const rodotremViagens = document.getElementById('rodotrem-viagens');
            if (rodotremViagens) rodotremViagens.innerText = rodotrem.viagens;

            const rodotremDensidade = document.getElementById('rodotrem-densidade');
            if (rodotremDensidade) rodotremDensidade.innerText = densRodotrem.toFixed(2).replace('.', ',') + ' t/viagem';

            const rodotremInfo = document.getElementById('rodotrem-info');
            if (rodotremInfo) rodotremInfo.innerHTML = densRodotremMsg.mensagem;

            const treminhaoTons = document.getElementById('treminhao-tons');
            if (treminhaoTons) treminhaoTons.innerText = fmtT(treminhao.tons);

            const treminhaoViagens = document.getElementById('treminhao-viagens');
            if (treminhaoViagens) treminhaoViagens.innerText = treminhao.viagens;

            const treminhaoDensidade = document.getElementById('treminhao-densidade');
            if (treminhaoDensidade) treminhaoDensidade.innerText = densTreminhao.toFixed(2).replace('.', ',') + ' t/viagem';

            const treminhaoInfo = document.getElementById('treminhao-info');
            if (treminhaoInfo) treminhaoInfo.innerHTML = densTreminhaoMsg.mensagem;

            renderCOA();
            renderHorariaChart();
            renderPermanencia();
        }

        // ═══════════════════════════════════════════════════════════════
        // ═══════════════════════════════════════════════════════════════
        //  renderPermanencia — cards de tempo médio na usina
        // ═══════════════════════════════════════════════════════════════
        function permFmtMin(m) {
            if (m == null || isNaN(m)) return '—';
            const h = Math.floor(m / 60), min = Math.round(m % 60);
            return h > 0 ? `${h}h ${String(min).padStart(2, '0')}min` : `${min}min`;
        }
        function permAvg(arr, field) {
            const vals = arr.map(d => field ? d[field] : d).filter(v => v != null && !isNaN(v));
            return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        }
        function permStatusClass(m) { if (m == null) return 'ok'; if (m >= 120) return 'alto'; if (m >= 75) return 'medio'; return 'ok'; }
        function permStatusLabel(m) { if (m == null) return 'Sem dado'; if (m >= 120) return 'Crítico'; if (m >= 75) return 'Atenção'; return 'OK'; }
        function permDiaFmt(dia) { return dia ? dia.split('-').reverse().join('/') : '—'; }

        function agrosyncDerivarPermanenciaDeSolinftec(atividades) {
            function pmParseDate2(v) {
                if (!v) return null;
                var m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (m) {
                    var y = +m[3], mo1 = +m[2] - 1, d1 = +m[1], mo2 = +m[1] - 1, d2 = +m[2];
                    var dt = new Date(y, mo1, d1);
                    if (dt && dt.getFullYear() >= 2020 && dt.getFullYear() <= 2030) return agrosyncToISODate(dt);
                    dt = new Date(y, mo2, d2);
                    if (dt && dt.getFullYear() >= 2020 && dt.getFullYear() <= 2030) return agrosyncToISODate(dt);
                }
                return parseDateISO(v);
            }
            var grupos = {};
            atividades.forEach(function(a) {
                // Só considera caminhões canavieiros (31xxx próprio, 91xxx terceiro)
                var f = String(a.frota || '').trim();
                if (!f || !(/^31\d|^91\d/.test(f))) return;
                if (!a.data) return;
                var key = f + '|' + a.data;
                if (!grupos[key]) grupos[key] = { frota: f, data: a.data, atividades: {} };
                grupos[key].atividades[a.operacao] = (grupos[key].atividades[a.operacao] || 0) + (a.segundos || 0);
            });
            var result = [];
            Object.keys(grupos).forEach(function(k) {
                var g = grupos[k];
                var durMin = Math.round(((g.atividades['3054'] || 0) + (g.atividades['2030'] || 0) + (g.atividades['3048'] || 0) + (g.atividades['2031'] || 0)) / 60);
                if (durMin <= 0) return;
                if (durMin > 1440) durMin = 1440; // cap 24h
                var diaStr = pmParseDate2(g.data);
                result.push({
                    viagem: 'sol_' + g.frota + '_' + g.data,
                    frota: g.frota,
                    codMot: '',
                    nomeMot: '',
                    nomMot: '',
                    tipo: g.frota.startsWith('91') ? 'terceiro' : 'proprio',
                    dia: diaStr,
                    entradaDT: null,
                    sondaDT: null,
                    dentroDT: null,
                    saidaDT: null,
                    entradaStr: '—',
                    sondaStr: '—',
                    dentroStr: '—',
                    saidaStr: '—',
                    etapas: { entradaSonda: null, sondaUsina: null, usinaSaida: null, entradaSaida: durMin },
                    durMin: durMin,
                    pontosDetectados: { entrada: false, sonda: false, dentro: false, saida: false }
                });
            });
            return result;
        }

        function getPermanenciaFiltrada() {
            return permanenciaSelectedDay === 'TODOS' ? permanenciaData : permanenciaData.filter(d => d.dia === permanenciaSelectedDay);
        }

        function setPermanenciaDay(dia) {
            permanenciaSelectedDay = dia || 'TODOS';
            renderPermanenciaDetalhada();
        }

        function agruparPermanenciaPorFrotaDia(dados) {
            const map = new Map();
            dados.forEach(d => {
                const key = `${d.dia || 'SEM DATA'}|${d.frota || 'SEM FROTA'}`;
                if (!map.has(key)) {
                    map.set(key, { dia: d.dia, frota: d.frota || '—', tipo: d.tipo, viagens: 0, entradaSonda: [], sondaUsina: [], usinaSaida: [], total: [], maior: 0 });
                }
                const g = map.get(key);
                g.viagens++;
                if (d.etapas?.entradaSonda != null) g.entradaSonda.push(d.etapas.entradaSonda);
                if (d.etapas?.sondaUsina != null) g.sondaUsina.push(d.etapas.sondaUsina);
                if (d.etapas?.usinaSaida != null) g.usinaSaida.push(d.etapas.usinaSaida);
                g.total.push(d.durMin);
                g.maior = Math.max(g.maior, d.durMin || 0);
            });
            return Array.from(map.values()).map(g => ({
                ...g,
                mediaEntradaSonda: permAvg(g.entradaSonda),
                mediaSondaUsina: permAvg(g.sondaUsina),
                mediaUsinaSaida: permAvg(g.usinaSaida),
                mediaTotal: permAvg(g.total),
                acima120: g.total.length ? g.total.filter(v => v >= 120).length / g.total.length * 100 : 0
            })).sort((a, b) => (a.dia || '').localeCompare(b.dia || '') || b.mediaTotal - a.mediaTotal);
        }

        // Cards pequenos que já existiam em Balança > Transporte
        function renderPermanencia() {
            const dados = selectedDay === 'TODOS' ? permanenciaData : permanenciaData.filter(d => d.dia === selectedDay);
            const prop = dados.filter(d => d.tipo === 'proprio');
            const terc = dados.filter(d => d.tipo === 'terceiro');
            const elAvgP = document.getElementById('perm-avg-prop');
            const elAvgT = document.getElementById('perm-avg-terc');
            const elSubP = document.getElementById('perm-sub-prop');
            const elSubT = document.getElementById('perm-sub-terc');
            if (elAvgP) elAvgP.textContent = prop.length ? permFmtMin(permAvg(prop, 'durMin')) : '—';
            if (elAvgT) elAvgT.textContent = terc.length ? permFmtMin(permAvg(terc, 'durMin')) : '—';
            if (elSubP) elSubP.textContent = `${prop.length} viagem(ns)`;
            if (elSubT) elSubT.textContent = `${terc.length} viagem(ns)`;
        }

        function renderPermanenciaDetalhada() {
            const root = document.getElementById('permanencia-report');
            if (!root) return;
            if (!permanenciaData.length) {
                root.innerHTML = '<div class="card"><div class="section-title">⏱ Permanência Industrial</div><div class="perm-alert warn">Nenhum dado de permanência encontrado. Para essa análise, a base de Produção/Balança precisa ter pelo menos Data/Hora Entrada e Data/Hora Saída. As colunas de Sonda e Dentro da Usina são usadas automaticamente quando existirem.</div></div>';
                renderPermanencia();
                return;
            }

            const dias = [...new Set(permanenciaData.map(d => d.dia).filter(Boolean))].sort();
            if (permanenciaSelectedDay !== 'TODOS' && !dias.includes(permanenciaSelectedDay)) permanenciaSelectedDay = 'TODOS';
            const dados = getPermanenciaFiltrada();
            const grupos = agruparPermanenciaPorFrotaDia(dados);
            const totalViagens = dados.length;
            const totalFrotas = new Set(dados.map(d => d.frota).filter(Boolean)).size;
            const mediaTotal = permAvg(dados, 'durMin');
            const ordenados = [...dados].sort((a, b) => a.durMin - b.durMin);
            const p90 = ordenados.length ? ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * 0.90))].durMin : null;
            const etapaMedias = [
                { id: 'entradaSonda', label: 'Balança Entrada → Sonda', media: permAvg(dados.map(d => d.etapas?.entradaSonda)), qtd: dados.filter(d => d.etapas?.entradaSonda != null).length },
                { id: 'sondaUsina', label: 'Sonda → Dentro da Usina', media: permAvg(dados.map(d => d.etapas?.sondaUsina)), qtd: dados.filter(d => d.etapas?.sondaUsina != null).length },
                { id: 'usinaSaida', label: 'Dentro da Usina → Balança Saída', media: permAvg(dados.map(d => d.etapas?.usinaSaida)), qtd: dados.filter(d => d.etapas?.usinaSaida != null).length },
                { id: 'entradaSaida', label: 'Ciclo Total Interno', media: mediaTotal, qtd: dados.length }
            ];
            const gargaloEtapa = etapaMedias.filter(e => e.id !== 'entradaSaida' && e.media != null).sort((a, b) => b.media - a.media)[0];
            const piorGrupo = [...grupos].sort((a, b) => b.mediaTotal - a.mediaTotal)[0];
            const acima120 = dados.filter(d => d.durMin >= 120).length;
            const pctAcima120 = totalViagens ? acima120 / totalViagens * 100 : 0;

            const tabs = '<button class="perm-day-tab ' + (permanenciaSelectedDay === 'TODOS' ? 'active' : '') + '" onclick="setPermanenciaDay(\'TODOS\')">Todos</button>' +
                dias.map(d => '<button class="perm-day-tab ' + (permanenciaSelectedDay === d ? 'active' : '') + '" onclick="setPermanenciaDay(\'' + d + '\')">' + permDiaFmt(d) + '</button>').join('');

            const stageHtml = etapaMedias.map(e => {
                const cls = e.media == null ? 'warning' : e.media >= 120 ? 'danger' : e.media >= 75 ? 'warning' : '';
                return '<div class="perm-stage-card ' + cls + '">' +
                    '<div class="perm-stage-label">' + e.label + '</div>' +
                    '<div class="perm-stage-value">' + permFmtMin(e.media) + '</div>' +
                    '<div class="perm-stage-sub">' + (e.qtd ? e.qtd + ' registro(s) válidos' : 'Coluna não encontrada ou sem horário válido') + '</div>' +
                    '</div>';
            }).join('');

            const rankingHtml = grupos.slice().sort((a, b) => b.mediaTotal - a.mediaTotal).slice(0, 10).map((g, i) =>
                '<tr><td><strong>' + (i + 1) + 'º</strong></td><td><strong>' + g.frota + '</strong><br><span style="color:#64748b;font-size:10px;">' + (g.tipo === 'terceiro' ? 'Terceiro' : 'Próprio') + '</span></td><td>' + permDiaFmt(g.dia) + '</td><td>' + g.viagens + '</td><td><strong>' + permFmtMin(g.mediaTotal) + '</strong></td><td>' + permFmtMin(g.maior) + '</td><td><span class="perm-status ' + permStatusClass(g.mediaTotal) + '">' + permStatusLabel(g.mediaTotal) + '</span></td></tr>'
            ).join('');

            const tableHtml = grupos.map(g =>
                '<tr><td>' + permDiaFmt(g.dia) + '</td><td><strong>' + g.frota + '</strong></td><td>' + (g.tipo === 'terceiro' ? 'Terceiro' : 'Próprio') + '</td><td>' + g.viagens + '</td><td>' + permFmtMin(g.mediaEntradaSonda) + '</td><td>' + permFmtMin(g.mediaSondaUsina) + '</td><td>' + permFmtMin(g.mediaUsinaSaida) + '</td><td><strong>' + permFmtMin(g.mediaTotal) + '</strong></td><td>' + g.acima120.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%</td><td><span class="perm-status ' + permStatusClass(g.mediaTotal) + '">' + permStatusLabel(g.mediaTotal) + '</span></td></tr>'
            ).join('');

            const alertas = [];
            var fonteSolinftec = dados.some(function(d) { return d.viagem && d.viagem.indexOf('sol_') === 0; });
            alertas.push('<div class="perm-alert info">📌 Ciclo considerado: <strong>Balança de Entrada → Sonda → Dentro da Usina → Balança de Saída</strong>. Quando Sonda ou Dentro da Usina não existirem na base, o sistema mantém o ciclo total Entrada → Saída e sinaliza a etapa sem dado.' + (fonteSolinftec ? ' Os dados exibidos foram derivados do Solinftec (atividades Mesa/Dentro Usina) como fallback.' : '') + '</div>');
            if (gargaloEtapa) alertas.push('<div class="perm-alert warn">⚠️ Principal gargalo médio do período: <strong>' + gargaloEtapa.label + '</strong>, com média de <strong>' + permFmtMin(gargaloEtapa.media) + '</strong>.</div>');
            if (piorGrupo) alertas.push('<div class="perm-alert danger">🔥 Frota com maior média de permanência: <strong>' + piorGrupo.frota + '</strong> em <strong>' + permDiaFmt(piorGrupo.dia) + '</strong>, média de <strong>' + permFmtMin(piorGrupo.mediaTotal) + '</strong>. É aqui que o chicote estala.</div>');

            root.innerHTML =
                '<div class="perm-report-topbar"><div><div class="perm-report-title">⏱ Permanência Industrial — Ciclo Interno da Usina</div><div style="font-size:12px;color:#64748b;font-weight:700;margin-top:4px;">Análise por frota, por dia e por etapa operacional</div></div><button class="consumo-btn-csv" onclick="exportPermanenciaCSV()">⬇️ Exportar CSV</button></div>' +
                '<div class="perm-day-tabs">' + tabs + '</div>' +
                '<div class="perm-kpi-grid">' +
                '<div class="perm-kpi-box"><small>Viagens analisadas</small><strong>' + totalViagens + '</strong><span>ciclos válidos</span></div>' +
                '<div class="perm-kpi-box"><small>Frotas analisadas</small><strong>' + totalFrotas + '</strong><span>equipamentos únicos</span></div>' +
                '<div class="perm-kpi-box"><small>Média ciclo total</small><strong>' + permFmtMin(mediaTotal) + '</strong><span>Entrada → Saída</span></div>' +
                '<div class="perm-kpi-box"><small>P90 permanência</small><strong>' + permFmtMin(p90) + '</strong><span>90% das viagens até esse tempo</span></div>' +
                '<div class="perm-kpi-box"><small>Acima de 2h</small><strong>' + pctAcima120.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%</strong><span>' + acima120 + ' viagem(ns)</span></div>' +
                '</div>' +
                '<div class="perm-stage-grid">' + stageHtml + '</div>' +
                '<div class="perm-analysis-grid"><div class="card"><div class="section-title">🧠 Leitura Analítica</div>' + alertas.join('') + '</div>' +
                '<div class="card"><div class="section-title">🏁 Top 10 Frotas com Maior Permanência Média</div><div class="perm-table-wrap"><table class="perm-table"><thead><tr><th>#</th><th>Frota</th><th>Dia</th><th>Viagens</th><th>Média</th><th>Máximo</th><th>Status</th></tr></thead><tbody>' + rankingHtml + '</tbody></table></div></div></div>' +
                '<div class="card"><div class="section-title">📋 Relatório por Dia e Frota</div><div class="perm-table-wrap"><table class="perm-table"><thead><tr><th>Dia</th><th>Frota</th><th>Tipo</th><th>Viagens</th><th>Entrada → Sonda</th><th>Sonda → Usina</th><th>Usina → Saída</th><th>Ciclo Total</th><th>% +2h</th><th>Status</th></tr></thead><tbody>' + tableHtml + '</tbody></table></div></div>';

            renderPermanencia();
        }

        function exportPermanenciaCSV() {
            const grupos = agruparPermanenciaPorFrotaDia(getPermanenciaFiltrada());
            const header = ['Dia','Frota','Tipo','Viagens','Media_Entrada_Sonda_min','Media_Sonda_Usina_min','Media_Usina_Saida_min','Media_Ciclo_Total_min','Pct_Acima_120'];
            const rows = grupos.map(g => [g.dia, g.frota, g.tipo, g.viagens, Math.round(g.mediaEntradaSonda || 0), Math.round(g.mediaSondaUsina || 0), Math.round(g.mediaUsinaSaida || 0), Math.round(g.mediaTotal || 0), g.acima120.toFixed(1)]);
            const csv = [header, ...rows].map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\n');
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'permanencia_industrial.csv';
            a.click();
            URL.revokeObjectURL(a.href);
        }

        function openPermanenciaModal(tipo) {
            const dados = selectedDay === 'TODOS' ? permanenciaData : permanenciaData.filter(d => d.dia === selectedDay);
            const filtrado = dados.filter(d => d.tipo === tipo).sort((a, b) => b.durMin - a.durMin).slice(0, 10);
            const titulo = tipo === 'proprio' ? '🟢 Top 10 — Permanência Próprio (mais longos)' : '🟡 Top 10 — Permanência Terceiro (mais longos)';
            const modal = document.getElementById('detail-modal');
            const title = document.getElementById('modal-title');
            const body = document.getElementById('modal-body');
            title.textContent = titulo;
            if (!filtrado.length) {
                body.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;font-weight:700;">Nenhum dado de permanência disponível para o período.</div>`;
                modal.classList.add('active');
                return;
            }
            const rows = filtrado.map((d, i) => {
                const rank = i + 1;
                const cls = rank <= 3 ? `rank-${rank}` : 'rank-n';
                return `<tr><td><span class="top10-rank ${cls}">${rank}</span></td><td><strong>${d.frota || '—'}</strong></td><td>${permDiaFmt(d.dia)}<br><span style="color:#64748b;font-size:10px;">${d.entradaStr} → ${d.saidaStr}</span></td><td style="font-weight:800;">${d.viagem}</td><td>${d.codMot || '—'}<br><span style="color:#334155;font-weight:700;">${d.nomeMot || d.nomMot || '—'}</span></td><td><span class="perm-badge ${permStatusClass(d.durMin)}">${permFmtMin(d.durMin)}</span></td></tr>`;
            }).join('');
            body.innerHTML = `<div style="overflow-x:auto;"><table class="top10-table"><thead><tr><th>#</th><th>Frota</th><th>Data/Hora</th><th>Viagem</th><th>Motorista</th><th>Permanência</th></tr></thead><tbody>${rows}</tbody></table></div><div class="perm-alert info" style="margin-top:14px;">Para a visão completa por etapa, use a subaba <strong>Solinftec → Permanência</strong>.</div>`;
            modal.classList.add('active');
        }

        // ═══════════════════════════════════════════════════════════════

        // Filtro de frentes própria / terceira no gráfico horário
        function renderHorariaChart() {
            if (!balanceLoaded) return;

            var isDark = document.body.classList.contains('dark-theme');
            var balTc = isDark ? '#f1f5f9' : '#64748b';
            var balTc2 = isDark ? '#94a3b8' : '#94a3b8';
            var balTc3 = isDark ? '#e2e8f0' : '#334155';
            var balGrid = isDark ? '#334155' : '#f1f5f9';
            var balBorder = isDark ? '#475569' : '#e2e8f0';
            var balTooltip = isDark ? '#334155' : '#1e293b';

            const wrap = document.getElementById('horaria-chart-wrap');
            const noData = document.getElementById('horaria-no-data');
            const canvas = document.getElementById('horaria-chart-canvas');
            if (!canvas) return;

            // Filtra por dia selecionado
            const dados = selectedDay === 'TODOS'
                ? horariaRaw
                : horariaRaw.filter(d => d.dia === selectedDay);

            if (!dados.length) {
                if (wrap) wrap.style.display = 'none';
                if (noData) noData.style.display = 'block';
                if (charts['horaria']) { charts['horaria'].destroy(); delete charts['horaria']; }
                return;
            }
            if (wrap) wrap.style.display = 'block';
            if (noData) noData.style.display = 'none';

            // Eixo X: 24 slots, 06:00 → 05:00 (manhã seguinte)
            const HORAS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];
            const LABELS = HORAS.map(h => String(h).padStart(2, '0') + ':00');

            // Conjuntos de frentes por tipo
            const FRENTES_PROPRIA = new Set(['08', '8', '10', '11', '12', '13', '14', '15'].map(n => 'Frente ' + n.padStart(2, '0')));
            const FRENTES_TERCEIRA = new Set(['30', '33', '35', '38', '39'].map(n => 'Frente ' + n.padStart(2, '0')));

            // Decide quais frentes mostrar com base no filtro
            const showProp = frenteFilter.propria;
            const showTerc = frenteFilter.terceira;
            const mostrarTudo = (!showProp && !showTerc) || (showProp && showTerc);

            // Frentes ordenadas + filtradas
            const frentes = [...new Set(dados.map(d => d.frente))].sort((a, b) => {
                const na = parseInt(a.replace('Frente', '')) || 0;
                const nb = parseInt(b.replace('Frente', '')) || 0;
                return na - nb;
            }).filter(f => {
                if (mostrarTudo) return true;
                if (showProp && FRENTES_PROPRIA.has(f)) return true;
                if (showTerc && FRENTES_TERCEIRA.has(f)) return true;
                return false;
            });

            // Paleta de cores harmoniosa com a página
            const PALETTE = [
                '#40800c', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4',
                '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#e11d48',
                '#0891b2', '#a855f7', '#65a30d', '#dc2626', '#0369a1'
            ];

            // Agrega: mesmo hora/frente de vários dias somados
            const agg = new Map(); // 'hora|frente' → peso
            dados.forEach(d => {
                const k = `${d.hora}|${d.frente}`;
                agg.set(k, (agg.get(k) || 0) + d.peso);
            });

            // Total por hora (para referência nos tooltips)
            const totalPorHora = new Array(24).fill(0);
            HORAS.forEach((h, i) => {
                frentes.forEach(f => {
                    totalPorHora[i] += agg.get(`${h}|${f}`) || 0;
                });
            });

            // Datasets — uma série por frente
            const datasets = frentes.map((frente, idx) => {
                const cor = PALETTE[idx % PALETTE.length];
                return {
                    label: frente,
                    data: HORAS.map(h => {
                        const v = agg.get(`${h}|${frente}`) || 0;
                        return v > 0 ? parseFloat(v.toFixed(3)) : 0;
                    }),
                    backgroundColor: cor,
                    hoverBackgroundColor: cor + 'cc',
                    borderRadius: { topLeft: 2, topRight: 2 },
                    borderSkipped: false,
                    borderWidth: 0
                };
            });

            if (charts['horaria']) { charts['horaria'].destroy(); delete charts['horaria']; }

            // Plugin inline: desenha o total em verde escuro acima de cada barra
            const totaisPlugin = {
                id: 'stackTotals',
                afterDatasetsDraw(chart) {
                    const { ctx, scales: { x, y } } = chart;
                    ctx.save();
                    ctx.font = '800 11px "Plus Jakarta Sans", "Segoe UI", sans-serif';
                    ctx.fillStyle = '#40800c';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    HORAS.forEach((_, i) => {
                        const tot = totalPorHora[i];
                        if (!(tot > 0)) return;
                        const xPx = x.getPixelForValue(i);
                        const yPx = y.getPixelForValue(tot);
                        // sombra sutil para legibilidade sobre as barras
                        ctx.shadowColor = 'rgba(255,255,255,0.9)';
                        ctx.shadowBlur = 3;
                        ctx.shadowOffsetY = 1;
                        ctx.fillText(
                            tot.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' t',
                            xPx,
                            yPx - 5
                        );
                        ctx.shadowBlur = 0;
                    });
                    ctx.restore();
                }
            };

            charts['horaria'] = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: { labels: LABELS, datasets },
                plugins: [totaisPlugin],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 50 } }, // espaço ajustado para não cortar rótulos/título
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        x: {
                            stacked: true,
                            grid: { display: false },
                            border: { color: balBorder },
                            ticks: {
                                font: { size: 10, weight: '700', family: 'Plus Jakarta Sans' },
                                color: balTc,
                                maxRotation: 0
                            }
                        },
                        y: {
                            stacked: true,
                            grid: { color: balGrid, lineWidth: 1 },
                            border: { color: balBorder, dash: [4, 4] },
                            ticks: {
                                font: { size: 10, family: 'Plus Jakarta Sans' },
                                color: balTc2,
                                callback: v => v > 0 ? v.toFixed(0) + ' t' : '0'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                font: { size: 11, weight: '700', family: 'Plus Jakarta Sans' },
                                color: balTc3,
                                padding: 18,
                                usePointStyle: true,
                                pointStyle: 'rectRounded',
                                pointStyleWidth: 14
                            }
                        },
                        tooltip: {
                            backgroundColor: balTooltip,
                            titleFont: { size: 12, weight: '800' },
                            bodyFont: { size: 11 },
                            padding: 12,
                            callbacks: {
                                title: items => `🕐 ${items[0].label}`,
                                afterBody: items => {
                                    const idx2 = items[0].dataIndex;
                                    const tot = totalPorHora[idx2];
                                    return tot > 0
                                        ? [`─────────────────`, `📦 Total: ${tot.toFixed(3)} t`]
                                        : [];
                                },
                                label: ctx => {
                                    const v = ctx.parsed.y;
                                    return v > 0 ? ` ${ctx.dataset.label}: ${v.toFixed(3)} t` : null;
                                }
                            }
                        },
                        datalabels: {
                            display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
                            formatter: v => v.toFixed(0),
                            color: '#ffffff',
                            font: { size: 8, weight: '800', family: 'Plus Jakarta Sans' },
                            anchor: 'center',
                            align: 'center',
                            clamp: true,
                            textShadowColor: 'rgba(0,0,0,0.4)',
                            textShadowBlur: 3
                        }
                    }
                }
            });
        }
        // ═══════════════════════════════════════════════════════════════

        //  renderCOA — Análise COA: % cargas analisadas (SIM vs NÃO)
        // ═══════════════════════════════════════════════════════════════
        function renderCOA() {
            if (!balanceLoaded) return;
            var isDark = document.body.classList.contains('dark-theme');

            // ── filtrar por dia selecionado ───────────────────────────
            const dados = selectedDay === "TODOS"
                ? coaData
                : coaData.filter(d => d.dia === selectedDay);

            const sim = dados.filter(d => d.analisado).length;
            const nao = dados.filter(d => !d.analisado).length;
            const total = dados.length;
            const pctSim = total > 0 ? (sim / total * 100) : 0;

            // ── atualizar contadores ──────────────────────────────────
            const elTotal = document.getElementById('coa-total');
            const elSim = document.getElementById('coa-sim');
            const elNao = document.getElementById('coa-nao');
            const elPct = document.getElementById('coa-pct-center');
            if (elTotal) elTotal.innerText = total;
            if (elSim) elSim.innerText = sim;
            if (elNao) elNao.innerText = nao;
            if (elPct) elPct.innerText = pctSim.toFixed(1) + '%';

            // ── badge de meta (≥30% = bom, <30% = ruim) ─────────────
            const badge = document.getElementById('coa-status-badge');
            if (badge) {
                const meta = 30;
                if (total === 0) {
                    badge.className = 'coa-meta-badge coa-meta-ruim';
                    badge.innerHTML = '⚠️ Sem dados de análise COA para o período.';
                } else if (pctSim >= meta) {
                    badge.className = 'coa-meta-badge coa-meta-bom';
                    badge.innerHTML = `✅ ${pctSim.toFixed(1)}% das cargas analisadas — <strong>ACIMA DA META (≥ 30%)</strong>`;
                } else {
                    badge.className = 'coa-meta-badge coa-meta-ruim';
                    badge.innerHTML = `⚠️ ${pctSim.toFixed(1)}% das cargas analisadas — <strong>ABAIXO DA META (&lt; 30%)</strong> · Faltam ${(meta - pctSim).toFixed(1)} p.p.`;
                }
            }

            // ── atualizar legenda ─────────────────────────────────────
            const dotSim = document.getElementById('coa-dot-sim');
            const simColor = pctSim >= 30 ? '#22c55e' : '#ef4444';
            if (dotSim) dotSim.style.background = simColor;
            const elLSim = document.getElementById('coa-legend-sim');
            const elLNao = document.getElementById('coa-legend-nao');
            if (elLSim) elLSim.innerText = `SIM (${sim})`;
            if (elLNao) elLNao.innerText = `NÃO (${nao})`;

            // ── barras de transporte (espelho) ────────────────────────
            // reutiliza os mesmos valores já calculados em renderBalance
            // lendo os elementos do painel principal
            const propBarMain = document.getElementById('bar-prop-h');
            const tercBarMain = document.getElementById('bar-terc-h');
            const propTxtMain = document.getElementById('txt-prop-bar');
            const tercTxtMain = document.getElementById('txt-terc-bar');
            const propCompMain = document.getElementById('prop-composicao');

            const coaPropBar = document.getElementById('coa-bar-prop');
            const coaTercBar = document.getElementById('coa-bar-terc');
            const coaPropTxt = document.getElementById('coa-txt-prop');
            const coaTercTxt = document.getElementById('coa-txt-terc');
            const coaPropComp = document.getElementById('coa-prop-composicao');

            if (propBarMain && coaPropBar) {
                coaPropBar.style.width = propBarMain.style.width;
                coaPropBar.innerText = propBarMain.innerText;
                coaPropBar.style.backgroundColor = propBarMain.style.backgroundColor;
            }
            if (tercBarMain && coaTercBar) {
                coaTercBar.style.width = tercBarMain.style.width;
                coaTercBar.innerText = tercBarMain.innerText;
                coaTercBar.style.backgroundColor = tercBarMain.style.backgroundColor;
            }
            if (propTxtMain && coaPropTxt) coaPropTxt.innerText = propTxtMain.innerText;
            if (tercTxtMain && coaTercTxt) coaTercTxt.innerText = tercTxtMain.innerText;
            if (propCompMain && coaPropComp) coaPropComp.innerHTML = propCompMain.innerHTML;

            // ── gráfico donut COA ─────────────────────────────────────
            const canvas = document.getElementById('coa-donut-canvas');
            if (!canvas) return;
            if (charts['coa-donut']) { charts['coa-donut'].destroy(); delete charts['coa-donut']; }

            const chartData = total > 0 ? [sim, nao] : [0, 1];
            const bgColors = total > 0 ? [simColor, '#94a3b8'] : ['#cbd5e1', '#f1f5f9'];
            const chartLabels = ['Analisado (SIM)', 'Não Analisado (NÃO)'];

            charts['coa-donut'] = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        data: chartData,
                        backgroundColor: bgColors,
                        borderWidth: 3,
                        borderColor: isDark ? '#1e293b' : '#ffffff'
                    }]
                },
                options: {
                    cutout: '68%',
                    animation: { duration: 600 },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: isDark ? '#334155' : '#1e293b',
                            callbacks: {
                                label: (ctx) => {
                                    const val = ctx.raw;
                                    const pct = total > 0 ? (val / total * 100).toFixed(1) : '0.0';
                                    return ` ${ctx.label}: ${val} (${pct}%)`;
                                }
                            }
                        },
                        datalabels: {
                            display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0 && total > 0,
                            formatter: (val) => {
                                const p = (val / total * 100).toFixed(1);
                                return p + '%';
                            },
                            color: '#ffffff',
                            font: { weight: '800', size: 12 },
                            anchor: 'center',
                            align: 'center'
                        }
                    }
                }
            });
        }
        // ═══════════════════════════════════════════════════════════════

