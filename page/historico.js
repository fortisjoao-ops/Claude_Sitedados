// ---------- Aba Histórico ----------
// O histórico fica num arquivo à parte (historico.json), lido só quando a aba é aberta.
(() => {
  const { num, nf, ok, fmt, pct, bps, varPct, reais, data, ms, linhas, tabela, aviso, grafico, MESES, INDISPONIVEL } = VC;
  const BASE = 252, DIA = 86400000;
  const pct3 = (v) => (ok(v) ? nf(3).format(v) + '%' : INDISPONIVEL);
  const NOMES = ['hist-estado', 'hist-data', 'hist-rotulo', 'hist-grafico-curvas', 'hist-tabela-curvas', 'hist-serie', 'hist-grafico-serie', 'hist-tabela-serie', 'csv'];
  const redesenhar = () => NOMES.forEach((n) => dash.draw(n));

  let H = null, estado = 'ocioso';   // ocioso, carregando, pronto ou falhou
  const carregar = () => {
    if (estado !== 'ocioso') return;
    estado = 'carregando';
    redesenhar();
    fetch('historico.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('resposta ' + r.status); return r.json(); })
      .then((j) => { H = { di: j.di || {}, ntnb: j.ntnb || {}, ust: j.ust || {} }; estado = 'pronto'; })
      .catch(() => { estado = 'falhou'; })
      .then(redesenhar);
  };
  const conferir = () => { const p = document.getElementById('historico'); if (p && !p.hidden) carregar(); };
  window.addEventListener('hashchange', () => setTimeout(conferir, 0));
  dash.onData(() => setTimeout(conferir, 0));
  const mensagem = () => (estado === 'falhou' ? 'indisponível: o arquivo de histórico não pôde ser lido' : 'Carregando o histórico…');

  // ----- Curvas de DI por data -----
  const datasDI = () => (H ? Object.keys(H.di).sort() : []);
  const curvaDe = (d) => ((H && H.di[d]) || []).map(([venc, du, taxa]) => ({ venc, du: +du, taxa: +taxa, t: ms(venc) }))
    .filter((p) => isFinite(p.du) && isFinite(p.taxa)).sort((a, b) => a.du - b.du);
  // Interpolação em linha reta entre dois pontos vizinhos, pelo campo indicado (dias úteis ou data do vencimento). Fora do intervalo não há valor.
  const interpolar = (curva, campo, alvo) => {
    if (curva.length < 2 || alvo < curva[0][campo] || alvo > curva[curva.length - 1][campo]) return null;
    const i = curva.findIndex((p) => p[campo] >= alvo);
    if (curva[i][campo] === alvo) return curva[i].taxa;
    const a = curva[i - 1], b = curva[i];
    return a.taxa + ((b.taxa - a.taxa) * (alvo - a[campo])) / (b[campo] - a[campo]);
  };
  const escolha = { a: null, b: null };
  const escolhida = (qual) => {
    const ds = datasDI();
    if (!ds.length) return null;
    if (escolha[qual] && H.di[escolha[qual]]) return escolha[qual];
    if (qual === 'a') return ds[ds.length - 1];
    // padrão da comparação: a data gravada mais próxima de um mês antes da primeira
    const alvo = ms(escolhida('a')) - 30 * DIA;
    const antes = ds.filter((d) => ms(d) <= alvo);
    return antes.length ? antes[antes.length - 1] : ds[0];
  };

  dash.draw('hist-estado', (el) => {
    const campo = el.dataset.campo;
    if (campo === 'aviso') { el.hidden = estado !== 'falhou'; el.textContent = estado === 'falhou' ? 'O arquivo de histórico não pôde ser lido agora. As outras abas não dependem dele.' : ''; return; }
    if (estado !== 'pronto') { el.textContent = estado === 'falhou' ? INDISPONIVEL : '…'; return; }
    const todas = [...Object.keys(H.di), ...Object.keys(H.ntnb), ...Object.keys(H.ust)].sort();
    el.textContent = todas.length ? data(campo === 'inicio' ? todas[0] : todas[todas.length - 1]) : INDISPONIVEL;
  });

  dash.draw('hist-data', (sel) => {
    const ds = datasDI().slice().reverse(), qual = sel.dataset.qual;
    sel.disabled = estado !== 'pronto' || !ds.length;
    if (sel.disabled) { sel.replaceChildren(); return; }
    if (sel.options.length !== ds.length) sel.replaceChildren(...ds.map((d) => { const o = document.createElement('option'); o.value = d; o.textContent = data(d); return o; }));
    if (document.activeElement !== sel) sel.value = escolhida(qual);
    sel.onchange = () => { escolha[qual] = sel.value; ['hist-rotulo', 'hist-grafico-curvas', 'hist-tabela-curvas'].forEach((n) => dash.draw(n)); };
  });
  dash.draw('hist-rotulo', (el) => { const d = estado === 'pronto' ? escolhida(el.dataset.qual) : null; el.textContent = d ? data(d) : '—'; });

  dash.draw('hist-grafico-curvas', (el) => {
    if (estado !== 'pronto') return aviso(el, mensagem());
    const dA = escolhida('a'), dB = escolhida('b');
    if (!dA) return aviso(el, INDISPONIVEL);
    const A = curvaDe(dA), B = dB ? curvaDe(dB) : [];   // a leitura por ponteiro interpola na curva inteira; o desenho vai até 10 anos
    const pontos = (c) => c.filter((p) => p.du <= 10 * BASE).map((p) => ({ x: p.du / BASE, y: p.taxa }));
    grafico(el, {
      rotulo: `Curva de ajuste do DI em ${data(dA)}` + (dB ? ` e em ${data(dB)}` : '') + ', por prazo, até 10 anos.',
      x: { dominio: [0, 10], marcas: d3.range(0, 11).map((a) => ({ v: a, rotulo: a === 0 ? '0' : a === 1 ? '1 ano' : a + ' anos', curto: a === 0 ? '0' : a + 'a' })) },
      y: { sufixo: '%', folgaMin: 0.05 },
      series: [
        { classe: 'di-line-3m', pontos: pontos(B), curva: 'monotona' },
        { classe: 'di-line', pontos: pontos(A), curva: 'monotona', marcadores: true },
      ],
      dica: (xv) => {
        const du = Math.round(xv * BASE), a = interpolar(A, 'du', du), b = interpolar(B, 'du', du);
        if (a === null && b === null) return null;
        return {
          x: du / BASE, titulo: `${nf(2).format(du / BASE)} anos`, sub: `${nf(0).format(du)} dias úteis · interpolado`,
          pontos: [{ y: a }, { y: b, classe: 'di-focus-3m' }],
          linhas: [[data(dA), pct3(a)], [dB ? data(dB) : '—', pct3(b)], ['Diferença', a === null || b === null ? INDISPONIVEL : bps((a - b) * 100, 1)]],
        };
      },
    });
  });

  dash.draw('hist-tabela-curvas', (corpo) => {
    const dA = estado === 'pronto' ? escolhida('a') : null, dB = dA ? escolhida('b') : null;
    if (!dA) return tabela(corpo, [], 'prazo', [[() => '', ''], [() => '', ''], [() => '', ''], [() => '', '']]);
    const A = curvaDe(dA), B = dB ? curvaDe(dB) : [];
    const registros = [[0.5, '6 meses'], [1, '1 ano'], [2, '2 anos'], [3, '3 anos'], [5, '5 anos'], [7, '7 anos'], [10, '10 anos']].map(([anos, nome]) => {
      const a = interpolar(A, 'du', anos * BASE), b = interpolar(B, 'du', anos * BASE);
      return { prazo: nome, a, b, dif: a === null || b === null ? null : +((a - b) * 100).toFixed(1) };
    });
    tabela(corpo, registros, 'prazo', [[(r) => r.prazo, ''], [(r) => pct3(r.a), 'di-num di-strong'], [(r) => pct3(r.b), 'di-num'], [(r) => bps(r.dif, 1), 'di-num di-strong']]);
  });

  // ----- Evolução de um indicador -----
  // Cada série devolve pontos {data, v}. tipo "taxa": variação em pontos-base; "indice": variação em %.
  const series = () => {
    const lista = [];
    const por = (id, grupo, nome, tipo, formato, pontos) => lista.push({ id, grupo, nome, tipo, formato, pontos });
    [[1, '1 ano'], [2, '2 anos'], [5, '5 anos'], [10, '10 anos']].forEach(([anos, nome]) => por('di-' + anos, 'Juros no Brasil', `DI de ${nome} (ajuste)`, 'taxa', pct3,
      () => datasDI().map((d) => ({ data: d, v: interpolar(curvaDe(d), 'du', anos * BASE) }))));
    linhas('br_real').forEach((t) => {
      const rotulo = `${t.titulo} ${t.vencimento.slice(0, 4)}`;
      por('real-' + t.chave, 'Juro real (NTN-B)', `Juro real, ${rotulo}`, 'taxa', pct,
        () => Object.keys(H.ntnb).sort().map((d) => ({ data: d, v: H.ntnb[d][t.chave] === undefined ? null : +H.ntnb[d][t.chave] })));
      por('impl-' + t.chave, 'Inflação implícita (NTN-B)', `Inflação implícita até ${t.vencimento.slice(0, 4)}, ${t.titulo}`, 'taxa', pct,
        () => datasDI().filter((d) => H.ntnb[d] && H.ntnb[d][t.chave] !== undefined).map((d) => {
          const nominal = interpolar(curvaDe(d).sort((a, b) => a.t - b.t), 't', ms(t.vencimento)), real = +H.ntnb[d][t.chave];
          return { data: d, v: nominal === null ? null : +(((1 + nominal / 100) / (1 + real / 100) - 1) * 100).toFixed(2) };
        }));
    });
    [['2 Yr', '2 anos'], ['10 Yr', '10 anos'], ['30 Yr', '30 anos']].forEach(([prazo, nome]) => por('ust-' + prazo, 'Juros nos Estados Unidos', `Treasury de ${nome}`, 'taxa', pct,
      () => Object.keys(H.ust).sort().map((d) => ({ data: d, v: H.ust[d][prazo] === undefined ? null : +H.ust[d][prazo] }))));
    por('ifix', 'Bolsa e câmbio', 'IFIX (fechamento)', 'indice', (v) => (ok(v) ? nf(2).format(v) : INDISPONIVEL), () => linhas('br_ifix_hist').map((p) => ({ data: p.data, v: num(p.fechamento) })));
    por('ibov', 'Bolsa e câmbio', 'Ibovespa (fechamento)', 'indice', (v) => (ok(v) ? nf(0).format(v) : INDISPONIVEL), () => linhas('br_ibov_hist').map((p) => ({ data: p.data, v: num(p.fechamento) })));
    por('dolar', 'Bolsa e câmbio', 'Dólar PTAX, venda', 'indice', (v) => reais(v, 4), () => linhas('br_dolar').map((p) => ({ data: p.data, v: num(p.valor) })));
    return lista;
  };
  let serieEscolhida = 'di-5', meses = 12;
  const atual = () => {
    if (estado !== 'pronto') return null;
    const lista = series(), s = lista.find((x) => x.id === serieEscolhida) || lista[0];
    let pontos = s.pontos().filter((p) => ok(p.v));
    if (meses && pontos.length) { const corte = ms(pontos[pontos.length - 1].data) - meses * 30.44 * DIA; pontos = pontos.filter((p) => ms(p.data) >= corte); }
    return { ...s, pontos };
  };
  VC.historicoSerie = atual;

  dash.draw('hist-serie', (sel) => {
    sel.disabled = estado !== 'pronto';
    if (sel.disabled) { sel.replaceChildren(); return; }
    const lista = series();
    if (sel.querySelectorAll('option').length !== lista.length) {
      const grupos = new Map();
      lista.forEach((s) => {
        if (!grupos.has(s.grupo)) { const g = document.createElement('optgroup'); g.label = s.grupo; grupos.set(s.grupo, g); }
        const o = document.createElement('option'); o.value = s.id; o.textContent = s.nome; grupos.get(s.grupo).append(o);
      });
      sel.replaceChildren(...grupos.values());
    }
    if (document.activeElement !== sel) sel.value = (lista.find((x) => x.id === serieEscolhida) || lista[0]).id;
    sel.onchange = () => { serieEscolhida = sel.value; ['hist-grafico-serie', 'hist-tabela-serie', 'csv'].forEach((n) => dash.draw(n)); };
  });
  dash.draw('hist-periodo', (sel) => {
    sel.onchange = () => { meses = +sel.value; ['hist-grafico-serie', 'hist-tabela-serie', 'csv'].forEach((n) => dash.draw(n)); };
  });

  dash.draw('hist-grafico-serie', (el) => {
    if (estado !== 'pronto') return aviso(el, mensagem());
    const s = atual();
    if (!s || s.pontos.length < 2) return aviso(el, 'indisponível: menos de dois pontos neste período');
    const pts = s.pontos.map((p) => ({ x: ms(p.data), y: p.v, data: p.data }));
    const marcas = [];
    pts.forEach((p, i) => { if (i > 0 && p.data.slice(0, 7) !== pts[i - 1].data.slice(0, 7)) marcas.push({ v: ms(p.data.slice(0, 7) + '-01'), rotulo: MESES[+p.data.slice(5, 7) - 1] + '/' + p.data.slice(2, 4) }); });
    grafico(el, {
      rotulo: `${s.nome}, de ${data(pts[0].data)} a ${data(pts[pts.length - 1].data)}.`,
      x: { dominio: [pts[0].x, pts[pts.length - 1].x], marcas },
      y: s.tipo === 'taxa' ? { sufixo: '%', folgaMin: 0.05 } : { folgaMin: 0.01 },
      series: [{ classe: 'di-line', pontos: pts, marcadores: pts.length <= 70 }],
      encaixes: pts.map((p) => p.x),
      dica: (xv) => { const p = pts.find((q) => q.x === xv); return p ? { x: p.x, titulo: data(p.data), pontos: [{ y: p.y }], linhas: [[s.nome, s.formato(p.y)]] } : null; },
    });
  });

  dash.draw('hist-tabela-serie', (corpo) => {
    const s = atual();
    if (!s || !s.pontos.length) return tabela(corpo, [], 'id', new Array(7).fill([() => '', '']));
    const p = s.pontos, a = p[0], u = p[p.length - 1], vs = p.map((x) => x.v);
    const variacao = s.tipo === 'taxa' ? bps((u.v - a.v) * 100, 1) : varPct((u.v / a.v - 1) * 100);
    tabela(corpo, [{ id: s.id }], 'id', [
      [() => s.nome, ''], [() => `${s.formato(a.v)} em ${data(a.data)}`, 'di-num'], [() => `${s.formato(u.v)} em ${data(u.data)}`, 'di-num di-strong'],
      [() => variacao, 'di-num di-strong'], [() => s.formato(Math.min(...vs)), 'di-num'], [() => s.formato(Math.max(...vs)), 'di-num'], [() => String(p.length), 'di-num'],
    ]);
  });
})();
