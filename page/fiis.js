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

  dash.calc('fiis_indicadores', {
    title: 'Indicadores dos fundos do IFIX',
    description: 'Cota de agora contra o valor patrimonial do informe mensal da CVM, tipo de carteira pelo balanço e dividend yield informado pelo fundo.',
    inputs: ['br_fiis', 'br_fiis_cvm'],
    fn: (fundos, cvm) => {
      const porTicker = new Map(cvm.map((c) => [c.ticker, c]));
      const n = (v) => (v === null || v === undefined || v === '' ? null : +v);
      return fundos.map((f) => {
        const c = porTicker.get(f.ticker) || {}, preco = n(f.preco), vp = n(c.vp_cota), qtd = n(f.qtd), cotas = n(c.cotas);
        // com mais de 20% de diferença entre as cotas do informe e as do índice, a cota e o valor patrimonial estão em bases diferentes
        const mesmaBase = qtd === null || cotas === null || Math.abs(qtd / cotas - 1) <= 0.2;
        return {
          ticker: f.ticker, nome: f.nome, peso: n(f.peso), preco, mes: c.mes || null, tipo: c.tipo || null, vp_cota: vp,
          pvp: preco !== null && vp && mesmaBase ? +(preco / vp).toFixed(2) : null, pl_milhoes: n(c.pl) === null ? null : +(n(c.pl) / 1e6).toFixed(0),
          dy_mes: n(c.dy_mes), dy_12m: n(c.dy_12m),
        };
      }).sort((a, b) => (b.peso || 0) - (a.peso || 0));
    },
  });

  dash.calc('fiis_por_tipo', {
    title: 'Fundos do IFIX por tipo de carteira',
    description: 'Número de fundos, peso no índice, P/VP ponderado pelo peso e mediana do dividend yield em 12 meses de cada tipo de carteira.',
    inputs: ['fiis_indicadores'],
    fn: (fundos) => {
      const mediana = (l) => { const o = l.slice().sort((a, b) => a - b); return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : null; };
      const grupo = (chave, lista) => {
        const comPvp = lista.filter((f) => f.pvp !== null && f.peso), pesoPvp = comPvp.reduce((s, f) => s + f.peso, 0), dys = lista.map((f) => f.dy_12m).filter((v) => v !== null);
        return { tipo: chave, fundos: lista.length, peso: +lista.reduce((s, f) => s + (f.peso || 0), 0).toFixed(2),
          pvp: pesoPvp > 0 ? +(comPvp.reduce((s, f) => s + f.peso * f.pvp, 0) / pesoPvp).toFixed(2) : null,
          dy_12m: dys.length ? +mediana(dys).toFixed(2) : null, com_dy: dys.length };
      };
      const tipos = ['tijolo', 'papel', 'fundo de fundos', 'hibrido'].map((t) => grupo(t, fundos.filter((f) => f.tipo === t))).filter((g) => g.fundos);
      const semTipo = fundos.filter((f) => !f.tipo);
      return [...tipos, ...(semTipo.length ? [grupo('sem informe', semTipo)] : []), grupo('todos', fundos)];
    },
  });
  const TIPOS = { tijolo: 'Tijolo', papel: 'Papel', 'fundo de fundos': 'Fundo de fundos', hibrido: 'Híbrido', 'sem informe': 'Sem informe localizado', todos: 'IFIX inteiro' };
  VC.tipoDeFundo = (t) => TIPOS[t] || INDISPONIVEL;
  const vezes = (v) => (ok(v) ? nf(2).format(v) : INDISPONIVEL);
  dash.draw('fii-cvm-mes', (el) => { const m = linhas('br_fiis_cvm').map((c) => c.mes).sort().pop(); el.textContent = m ? VC.mes(m) : INDISPONIVEL; });
  dash.draw('fii-cvm-n', (el) => { const c = linhas('br_fiis_cvm').length, t = linhas('br_fiis').length; el.textContent = c ? `${c} dos ${t} fundos com cotação foram localizados na CVM` : 'Informes da CVM indisponíveis'; });
  dash.draw('fii-tabela-tipos', (corpo) => tabela(corpo, linhas('br_fiis_cvm').length ? linhas('fiis_por_tipo') : [], 'tipo', [
    [(r) => TIPOS[r.tipo] || r.tipo, 'di-strong'], [(r) => String(r.fundos), 'di-num'], [(r) => pct(r.peso), 'di-num'], [(r) => vezes(r.pvp), 'di-num di-strong'],
    [(r) => (r.dy_12m === null ? INDISPONIVEL : `${pct(r.dy_12m)} (${r.com_dy} fundos)`), 'di-num'],
  ]));
  dash.draw('fii-tabela-indicadores', (corpo) => tabela(corpo, linhas('br_fiis_cvm').length ? linhas('fiis_indicadores') : [], 'ticker', [
    [(r) => r.ticker, 'di-strong'], [(r) => r.nome, ''], [(r) => VC.tipoDeFundo(r.tipo), ''], [(r) => pct(r.peso), 'di-num'], [(r) => reais(r.preco), 'di-num'],
    [(r) => reais(r.vp_cota), 'di-num'], [(r) => vezes(r.pvp), 'di-num di-strong'], [(r) => (r.pl_milhoes === null ? INDISPONIVEL : nf(0).format(r.pl_milhoes)), 'di-num'],
    [(r) => pct(r.dy_mes), 'di-num'], [(r) => pct(r.dy_12m), 'di-num'],
  ]));

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
