// ---------- Aba Ações BR ----------
(() => {
  const { num, nf, ok, fmt, reais, varPct, data, dataHora, ms, linhas, tabela, aviso, grafico, MESES, INDISPONIVEL } = VC;

  // Últimos pontos de uma série diária: o mais recente, o anterior, o último do mês anterior e o último do ano anterior.
  const bases = (serie, campo, hoje) => {
    const antes = (limite) => { const l = serie.filter((p) => p.data < limite); return l[l.length - 1] || null; };
    return { mes: antes(hoje.slice(0, 7) + '-01'), ano: antes(hoje.slice(0, 4) + '-01-01') };
  };

  dash.calc('ibov_variacoes', {
    title: 'Variações do Ibovespa',
    description: 'Variação no dia (informada pela B3) e variações no mês e no ano, contra o último fechamento do mês e do ano anteriores.',
    inputs: ['br_ibov', 'br_ibov_hist'],
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

  dash.calc('dolar_variacoes', {
    title: 'Variações do dólar PTAX',
    description: 'PTAX de venda mais recente contra a do dia útil anterior, a última do mês anterior e a última do ano anterior.',
    inputs: ['br_dolar'],
    fn: (ptax) => {
      if (ptax.length < 2) return [];
      const u = ptax[ptax.length - 1], valor = +u.valor;
      const ultimoAntes = (limite) => { const l = ptax.filter((p) => p.data < limite); return l[l.length - 1] || null; };
      const contra = (base) => (base ? +((valor / +base.valor - 1) * 100).toFixed(2) : null);
      const mesAnt = ultimoAntes(u.data.slice(0, 7) + '-01'), anoAnt = ultimoAntes(u.data.slice(0, 4) + '-01-01');
      return [
        { campo: 'dia', variacao: contra(ptax[ptax.length - 2]), base_data: ptax[ptax.length - 2].data },
        { campo: 'mes', variacao: contra(mesAnt), base_data: mesAnt ? mesAnt.data : null },
        { campo: 'ano', variacao: contra(anoAnt), base_data: anoAnt ? anoAnt.data : null },
      ];
    },
  });

  dash.calc('papeis_ordenados', {
    title: 'Ações do Ibovespa por variação no dia',
    description: 'Ações da carteira do índice ordenadas da maior alta para a maior baixa.',
    inputs: ['br_papeis'],
    fn: (papeis) => papeis.map((p) => ({ ticker: p.ticker, nome: p.nome, preco: +p.preco, var_dia: +(+p.var_dia).toFixed(2) })).sort((a, b) => b.var_dia - a.var_dia),
  });

  const ibov = () => linhas('br_ibov')[0] || null;
  const pontos = (v) => (ok(v) ? nf(0).format(v) : INDISPONIVEL);
  dash.draw('ac-nivel', (el) => { const c = ibov(); el.textContent = c ? pontos(num(c.nivel)) : INDISPONIVEL; });
  dash.draw('ac-campo', (el) => { const c = ibov(); el.textContent = c ? pontos(num(c[el.dataset.campo])) : INDISPONIVEL; });
  dash.draw('ac-cotado', (el) => { const c = ibov(); el.textContent = c ? dataHora(c.cotado_em) : INDISPONIVEL; });
  dash.draw('ac-var', (el) => { const r = linhas('ibov_variacoes').find((x) => x.campo === el.dataset.campo); el.textContent = r ? varPct(r.variacao) : INDISPONIVEL; });
  dash.draw('ac-base', (el) => { const r = linhas('ibov_variacoes').find((x) => x.campo === el.dataset.campo); el.textContent = r && r.base_data ? data(r.base_data) : INDISPONIVEL; });
  const dolar = () => { const l = linhas('br_dolar'); return l[l.length - 1] || null; };
  dash.draw('ac-dolar', (el) => { const d = dolar(); el.textContent = d ? reais(num(d.valor), 4) : INDISPONIVEL; });
  dash.draw('ac-dolar-data', (el) => { const d = dolar(); el.textContent = d ? data(d.data) : INDISPONIVEL; });
  dash.draw('ac-dolar-var', (el) => { const r = linhas('dolar_variacoes').find((x) => x.campo === el.dataset.campo); el.textContent = r ? varPct(r.variacao) : INDISPONIVEL; });

  dash.draw('ac-grafico', (el) => {
    const hist = linhas('br_ibov_hist').slice(-252), c = ibov();
    if (hist.length < 20) return aviso(el, INDISPONIVEL);
    const serie = hist.map((p) => ({ x: ms(p.data), y: +p.fechamento, data: p.data }));
    if (c && String(c.cotado_em).slice(0, 10) > hist[hist.length - 1].data) serie.push({ x: ms(c.cotado_em), y: +c.nivel, data: String(c.cotado_em).slice(0, 10), agora: true });
    const marcas = [];
    serie.forEach((p, i) => { if (i === 0 || p.data.slice(0, 7) !== serie[i - 1].data.slice(0, 7)) marcas.push({ v: p.x, rotulo: MESES[+p.data.slice(5, 7) - 1] + '/' + p.data.slice(2, 4) }); });
    grafico(el, {
      rotulo: 'Ibovespa: fechamentos diários dos últimos 12 meses.',
      x: { dominio: [serie[0].x, serie[serie.length - 1].x], marcas: marcas.slice(1) },
      y: { casas: 0, folgaMin: 500 },
      series: [{ classe: 'di-line', pontos: serie }],
      encaixes: serie.map((p) => p.x),
      dica: (xv) => {
        const p = d3.least(serie, (s) => Math.abs(s.x - xv));
        return { x: p.x, titulo: data(p.data), sub: p.agora ? 'cotação mais recente' : 'fechamento', pontos: [{ y: p.y }], linhas: [['Ibovespa', pontos(p.y)]] };
      },
    });
  });

  dash.draw('ac-tabela', (corpo) => {
    const todos = linhas('papeis_ordenados');
    const lista = corpo.dataset.lado === 'altas' ? todos.filter((p) => p.var_dia > 0).slice(0, 5) : todos.filter((p) => p.var_dia < 0).slice(-5).reverse();
    tabela(corpo, lista, 'ticker', [[(r) => r.ticker, 'di-strong'], [(r) => r.nome, ''], [(r) => reais(r.preco), 'di-num'], [(r) => varPct(r.var_dia), 'di-num di-strong']]);
  });
  dash.draw('ac-papeis-data', (el) => { const r = linhas('br_papeis_ref')[0]; el.textContent = r ? dataHora(r.cotado_em) : INDISPONIVEL; });
  dash.draw('ac-papeis-n', (el) => { const r = linhas('br_papeis_ref')[0]; el.textContent = r ? `${r.papeis} das ${r.carteira} ações da carteira tinham cotação` : ''; });
})();
