// ---------- Aba Dólar ----------
(() => {
  const { num, nf, ok, fmt, pct, bps, reais, sinal, data, dataHora, ms, linhas, tabela, aviso, grafico, MESES, INDISPONIVEL } = VC;
  const BASE = 252;
  const n = (v) => { const x = num(v); return isFinite(x) ? x : null; };

  dash.calc('dolar_curva', {
    title: 'Curva do dólar futuro',
    description: 'Preço de ajuste de cada vencimento, o prêmio sobre o primeiro vencimento e o juro em dólar embutido entre o primeiro vencimento e cada um dos seguintes.',
    inputs: ['br_dolar_curva', 'di1_longo'],
    fn: (curva, di) => {
      const c = curva.map((r) => {
        const compra = n(r.compra), venda = n(r.venda), ultimo = n(r.ultimo);
        return { ticker: r.ticker, vencimento: r.vencimento, du: +r.du, duA: +r.du_ajuste, dcA: +r.dc_ajuste, ajuste: n(r.ajuste_ant),
          agora: compra !== null && venda !== null ? +((compra + venda) / 2).toFixed(4) : ultimo, em_aberto: n(r.em_aberto), negociados: n(r.negociados) };
      }).filter((r) => r.ajuste !== null).sort((a, b) => a.duA - b.duA);
      if (!c.length) return [];
      const base = c[0], deslocamento = base.duA - base.du;   // dias úteis entre o pregão do ajuste e hoje
      // DI de ajuste do mesmo pregão, interpolado em linha reta por dias úteis; fora dos vencimentos negociados não há valor.
      const pontos = di.map((v) => ({ du: +v.du + deslocamento, taxa: n(v.ajuste_ant) })).filter((p) => p.taxa !== null && isFinite(p.du)).sort((a, b) => a.du - b.du);
      const diEm = (du) => {
        if (pontos.length < 2 || du < pontos[0].du || du > pontos[pontos.length - 1].du) return null;
        const i = pontos.findIndex((p) => p.du >= du);
        if (pontos[i].du === du) return pontos[i].taxa;
        const a = pontos[i - 1], b = pontos[i];
        return a.taxa + ((b.taxa - a.taxa) * (du - a.du)) / (b.du - a.du);
      };
      const fator = (du) => { const t = diEm(du); return t === null ? null : Math.pow(1 + t / 100, du / BASE); };
      const fatorBase = fator(base.duA);
      return c.map((r, i) => {
        const razao = r.ajuste / base.ajuste, dias = r.duA - base.duA, corridos = r.dcA - base.dcA, f = fator(r.duA);
        return {
          ticker: r.ticker, vencimento: r.vencimento, du: r.du, ajuste: r.ajuste, agora: r.agora, em_aberto: r.em_aberto,
          premio: i === 0 ? null : +((razao - 1) * 100).toFixed(2),
          premio_aa: i === 0 || dias <= 0 ? null : +((Math.pow(razao, BASE / dias) - 1) * 100).toFixed(2),
          cupom: i === 0 || corridos <= 0 || f === null || fatorBase === null ? null : +((((f / fatorBase) / razao - 1) * 360 / corridos) * 100).toFixed(2),
        };
      });
    },
  });

  dash.calc('juros_br_eua', {
    title: 'Diferencial de juros entre Brasil e Estados Unidos',
    description: 'Taxa do DI futuro menos o rendimento do Treasury de mesmo prazo, hoje e três meses atrás.',
    inputs: ['prazos', 'curva_dez', 'eua_curva'],
    fn: (prazos, curvaDez, treasuries) => {
      const dez = (curvaDez || []).find((l) => l.du === 10 * BASE);
      const di = { 1: prazos.find((p) => p.prazo === '1a'), 2: prazos.find((p) => p.prazo === '2a'), 3: prazos.find((p) => p.prazo === '3a'), 5: prazos.find((p) => p.prazo === '5a'), 10: dez };
      return [[1, '1 Yr', '1 ano'], [2, '2 Yr', '2 anos'], [3, '3 Yr', '3 anos'], [5, '5 Yr', '5 anos'], [10, '10 Yr', '10 anos']].map(([anos, prazo, nome]) => {
        const d = di[anos], t = (treasuries || []).find((r) => r.prazo === prazo);
        const dif = d && t ? +(d.taxa - t.taxa).toFixed(2) : null;
        const dif3 = d && t && d.taxa_3m !== null && d.taxa_3m !== undefined && t.taxa_3m !== null ? +(d.taxa_3m - t.taxa_3m).toFixed(2) : null;
        return { anos, nome, di: d ? d.taxa : null, ust: t ? t.taxa : null, dif, dif_3m: dif3, var_bps: dif === null || dif3 === null ? null : +((dif - dif3) * 100).toFixed(0) };
      });
    },
  });

  const pp = (v) => (ok(v) ? fmt(v, 2) + ' p.p.' : INDISPONIVEL);
  dash.draw('cb-data', (el) => {
    const campo = el.dataset.campo, c = linhas('br_dolar_curva')[0], cot = linhas('di1')[0], t = linhas('eua_curva')[0];
    el.textContent = campo === 'ajuste' ? (c ? data(c.data_ajuste_ant) : INDISPONIVEL) : campo === 'di' ? (cot ? dataHora(cot.cotacao_em) : INDISPONIVEL) : (t ? data(t.data) : INDISPONIVEL);
  });

  dash.draw('cb-grafico-curva', (el) => {
    const c = linhas('dolar_curva');
    if (c.length < 3) return aviso(el, INDISPONIVEL);
    const xs = c.map((r) => ms(r.vencimento)), ini = xs[0], fim = xs[xs.length - 1], folga = (fim - ini) * 0.02;
    const marcas = [];
    for (let a = new Date(ini).getUTCFullYear() + 1; a <= new Date(fim).getUTCFullYear(); a++) marcas.push({ v: Date.UTC(a, 0, 1), rotulo: String(a) });
    grafico(el, {
      rotulo: 'Curva do dólar futuro por vencimento: preço de ajuste e cotação de agora.',
      x: { dominio: [ini - folga, fim + folga], marcas },
      y: { casas: 2, folgaMin: 0.02 },
      series: [
        { classe: 'di-line', pontos: c.map((r) => ({ x: ms(r.vencimento), y: r.ajuste })), curva: 'monotona', marcadores: true },
        { classe: 'vc-sem-linha', pontos: c.filter((r) => r.agora !== null).map((r) => ({ x: ms(r.vencimento), y: r.agora })), marcadores: true, classeMarcador: 'di-ring' },
      ],
      encaixes: xs,
      dica: (xv) => {
        const r = c.find((q) => ms(q.vencimento) === xv);
        if (!r) return null;
        return { x: xv, titulo: `${r.ticker} · vence em ${data(r.vencimento)}`, sub: `${nf(0).format(r.du)} dias úteis`, pontos: [{ y: r.ajuste }],
          linhas: [['Ajuste anterior', reais(r.ajuste, 4)], ['Agora', reais(r.agora, 4)], ['Prêmio ao ano', pct(r.premio_aa)], ['Juro em dólar', pct(r.cupom)]] };
      },
    });
  });

  dash.draw('cb-tabela-curva', (corpo) => tabela(corpo, linhas('dolar_curva'), 'ticker', [
    [(r) => r.ticker, 'di-strong'], [(r) => data(r.vencimento), ''], [(r) => nf(0).format(r.du), 'di-num'], [(r) => reais(r.ajuste, 4), 'di-num di-strong'],
    [(r) => (r.agora === null ? '—' : reais(r.agora, 4)), 'di-num'], [(r) => (r.premio === null ? '—' : sinal(r.premio, 2, '%')), 'di-num'],
    [(r) => (r.premio_aa === null ? '—' : pct(r.premio_aa)), 'di-num'], [(r) => (r.cupom === null ? '—' : pct(r.cupom)), 'di-num'],
    [(r) => (r.em_aberto === null ? '—' : nf(0).format(r.em_aberto)), 'di-num'],
  ]));

  dash.draw('cb-tabela-dif', (corpo) => tabela(corpo, linhas('juros_br_eua'), 'anos', [
    [(r) => r.nome, ''], [(r) => pct(r.di), 'di-num'], [(r) => pct(r.ust), 'di-num'], [(r) => pp(r.dif), 'di-num di-strong'], [(r) => pp(r.dif_3m), 'di-num'], [(r) => bps(r.var_bps), 'di-num'],
  ]));

  dash.draw('cb-grafico-ptax', (el) => {
    const serie = linhas('br_dolar').slice(-252).map((p) => ({ x: ms(p.data), y: +p.valor, data: p.data }));
    if (serie.length < 20) return aviso(el, INDISPONIVEL);
    const marcas = [];
    serie.forEach((p, i) => { if (i > 0 && p.data.slice(0, 7) !== serie[i - 1].data.slice(0, 7)) marcas.push({ v: p.x, rotulo: MESES[+p.data.slice(5, 7) - 1] + '/' + p.data.slice(2, 4) }); });
    grafico(el, {
      rotulo: 'Dólar PTAX de venda nos últimos 12 meses.',
      x: { dominio: [serie[0].x, serie[serie.length - 1].x], marcas },
      y: { casas: 2, folgaMin: 0.02 },
      series: [{ classe: 'di-line', pontos: serie }],
      encaixes: serie.map((p) => p.x),
      dica: (xv) => { const p = serie.find((q) => q.x === xv); return p ? { x: p.x, titulo: data(p.data), pontos: [{ y: p.y }], linhas: [['PTAX, venda', reais(p.y, 4)]] } : null; },
    });
  });
})();
