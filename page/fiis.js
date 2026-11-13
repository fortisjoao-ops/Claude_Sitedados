// ---------- Aba Fundos imobiliários ----------
(() => {
  const { num, nf, ok, fmt, pct, reais, varPct, data, dataHora, ms, linhas, tabela, aviso, grafico, MESES, INDISPONIVEL } = VC;

  dash.calc('ifix_variacoes', {
    title: 'Variações do IFIX',
    description: 'Variação no dia (informada pela B3) e variações no mês e no ano, contra o último fechamento do mês e do ano anteriores.',
    inputs: ['br_ifix', 'br_ifix_hist'],
    fn: (cotacao, historico) => {
      if (!cotacao.length) return [];
      const c = cotacao[0], nivel = +c.nivel, hoje = String(c.cotado_em).slice(0, 10);
      const ultimoAntes = (limite) => { const l = historico.filter((p) => p.data < limite); return l[l.length - 1] || null; };
      const baseMes = ultimoAntes(hoje.slice(0, 7) + '-01'), baseAno = ultimoAntes(hoje.slice(0, 4) + '-01-01');
      const contra = (base) => (base ? +((nivel / +base.fechamento - 1) * 100).toFixed(2) : null);
      return [
        { campo: 'dia', variacao: c.var_dia === null ? null : +c.var_dia, base_data: null },
        { campo: 'mes', variacao: contra(baseMes), base_data: baseMes ? baseMes.data : null },
        { campo: 'ano', variacao: contra(baseAno), base_data: baseAno ? baseAno.data : null },
      ];
    },
  });

  dash.calc('fiis_ordenados', {
    title: 'Fundos do IFIX por variação no dia',
    description: 'Fundos da carteira do índice ordenados da maior alta para a maior baixa, com o peso de cada um no índice.',
    inputs: ['br_fiis'],
    fn: (fundos) => fundos.map((p) => ({ ticker: p.ticker, nome: p.nome, preco: +p.preco, var_dia: +(+p.var_dia).toFixed(2), peso: p.peso === '' ? null : +p.peso })).sort((a, b) => b.var_dia - a.var_dia),
  });

  dash.calc('ifix_comparado', {
    title: 'IFIX, Ibovespa e CDI em base 100',
    description: 'Os três em base 100 no último pregão até um ano antes do fechamento mais recente do IFIX. O CDI é a taxa diária acumulada.',
    inputs: ['br_ifix_hist', 'br_ibov_hist', 'br_cdi'],
    fn: (ifix, ibov, cdi) => {
      if (ifix.length < 20) return [];
      const fim = ifix[ifix.length - 1].data;
      const alvo = (+fim.slice(0, 4) - 1) + fim.slice(4);
      const anteriores = ifix.filter((p) => p.data <= alvo);
      const base = (anteriores[anteriores.length - 1] || ifix[0]);
      const baseIbov = ibov.filter((p) => p.data <= base.data).pop();
      const fechIbov = new Map(ibov.map((p) => [p.data, +p.fechamento]));
      const taxas = cdi.filter((p) => p.data >= base.data).sort((a, b) => (a.data < b.data ? -1 : 1));
      let fator = 1, j = 0, ultimoIbov = baseIbov ? +baseIbov.fechamento : null;
      // se a série do CDI termina dias antes de um fechamento, a linha do CDI para ali em vez de ficar parada
      const ultimoCdi = taxas.length ? taxas[taxas.length - 1].data : '';
      return ifix.filter((p) => p.data >= base.data).map((p) => {
        while (j < taxas.length && taxas[j].data < p.data) { fator *= 1 + +taxas[j].valor / 100; j++; }
        if (fechIbov.has(p.data)) ultimoIbov = fechIbov.get(p.data);
        const cdiOk = taxas.length > 0 && ms(p.data) - ms(ultimoCdi) <= 5 * 86400000;
        return {
          data: p.data,
          ifix: +((+p.fechamento / +base.fechamento) * 100).toFixed(2),
          ibov: baseIbov && ultimoIbov ? +((ultimoIbov / +baseIbov.fechamento) * 100).toFixed(2) : null,
          cdi: cdiOk ? +(fator * 100).toFixed(2) : null,
        };
      });
    },
  });

  const ifix = () => linhas('br_ifix')[0] || null;
  const pontos = (v) => (ok(v) ? nf(2).format(v) : INDISPONIVEL);
  const variacao = (campo) => linhas('ifix_variacoes').find((x) => x.campo === campo);
  dash.draw('fii-nivel', (el) => { const c = ifix(); el.textContent = c ? pontos(num(c.nivel)) : INDISPONIVEL; });
  dash.draw('fii-campo', (el) => { const c = ifix(); el.textContent = c ? pontos(num(c[el.dataset.campo])) : INDISPONIVEL; });
  dash.draw('fii-cotado', (el) => { const c = ifix(); el.textContent = c ? dataHora(c.cotado_em) : INDISPONIVEL; });
  dash.draw('fii-var', (el) => { const r = variacao(el.dataset.campo); el.textContent = r ? varPct(r.variacao) : INDISPONIVEL; });
  dash.draw('fii-base', (el) => { const r = variacao(el.dataset.campo); el.textContent = r && r.base_data ? data(r.base_data) : INDISPONIVEL; });

  const comparado = () => linhas('ifix_comparado');
  dash.draw('fii-12m', (el) => {
    const l = comparado(), u = l[l.length - 1], v = u ? u[el.dataset.campo] : null;
    el.textContent = u && v !== null ? varPct(+(v - 100).toFixed(2)) : INDISPONIVEL;
  });
  dash.draw('fii-12m-data', (el) => {
    const l = comparado();
    el.textContent = l.length ? data(el.dataset.campo === 'base' ? l[0].data : l[l.length - 1].data) : INDISPONIVEL;
  });

  dash.draw('fii-grafico', (el) => {
    const l = comparado();
    if (l.length < 20) return aviso(el, INDISPONIVEL);
    const serie = (campo) => l.filter((p) => p[campo] !== null).map((p) => ({ x: ms(p.data), y: p[campo] }));
    const marcas = [];
    l.forEach((p, i) => { if (i > 0 && p.data.slice(0, 7) !== l[i - 1].data.slice(0, 7)) marcas.push({ v: ms(p.data), rotulo: MESES[+p.data.slice(5, 7) - 1] + '/' + p.data.slice(2, 4) }); });
    grafico(el, {
      rotulo: 'IFIX, Ibovespa e CDI acumulado em 12 meses, todos em base 100 na data inicial.',
      x: { dominio: [ms(l[0].data), ms(l[l.length - 1].data)], marcas },
      y: { casas: 0, folgaMin: 1 },
      series: [
        { classe: 'di-line-ant', pontos: serie('cdi') },
        { classe: 'di-line-3m', pontos: serie('ibov') },
        { classe: 'di-line', pontos: serie('ifix') },
      ],
      encaixes: l.map((p) => ms(p.data)),
      dica: (xv) => {
        const p = l.find((r) => ms(r.data) === xv);
        if (!p) return null;
        return {
          x: xv, titulo: data(p.data), sub: 'base 100 em ' + data(l[0].data),
          pontos: [{ y: p.ifix }, { y: p.ibov, classe: 'di-focus-3m' }, { y: p.cdi, classe: 'di-focus-ant' }],
          linhas: [['IFIX', fmt(p.ifix, 1)], ['Ibovespa', fmt(p.ibov, 1)], ['CDI', fmt(p.cdi, 1)]],
        };
      },
    });
  });

  dash.draw('fii-tabela', (corpo) => {
    const todos = linhas('fiis_ordenados'), lado = corpo.dataset.lado;
    if (lado === 'pesos') {
      const lista = todos.filter((p) => p.peso !== null).sort((a, b) => b.peso - a.peso).slice(0, 10);
      return tabela(corpo, lista, 'ticker', [[(r) => r.ticker, 'di-strong'], [(r) => r.nome, ''], [(r) => pct(r.peso), 'di-num'], [(r) => reais(r.preco), 'di-num'], [(r) => varPct(r.var_dia), 'di-num di-strong']]);
    }
    const lista = lado === 'altas' ? todos.filter((p) => p.var_dia > 0).slice(0, 5) : todos.filter((p) => p.var_dia < 0).slice(-5).reverse();
    tabela(corpo, lista, 'ticker', [[(r) => r.ticker, 'di-strong'], [(r) => r.nome, ''], [(r) => reais(r.preco), 'di-num'], [(r) => varPct(r.var_dia), 'di-num di-strong']]);
  });
  dash.draw('fii-fundos-data', (el) => { const r = linhas('br_fiis_ref')[0]; el.textContent = r ? dataHora(r.cotado_em) : INDISPONIVEL; });
  dash.draw('fii-fundos-n', (el) => { const r = linhas('br_fiis_ref')[0]; el.textContent = r ? `${r.fundos} dos ${r.carteira} fundos da carteira tinham cotação` : ''; });
})();
