// ---------- Aba Juro real BR ----------
(() => {
  const { num, ok, pct, bps, data, ms, linhas, tabela, aviso, grafico, INDISPONIVEL } = VC;
  const ANO = 365.25 * 86400000;

  dash.calc('br_real', {
    title: 'Juro real das NTN-B e inflação implícita',
    description: 'Taxa de cada NTN-B no Tesouro Direto, o DI futuro interpolado para o mesmo vencimento e a inflação implícita entre os dois, na data de referência e três meses antes.',
    inputs: ['ntnb', 'di1_longo', 'di1_3m_longo'],
    fn: (titulos, di, di3m) => {
      const serie = (pontos, campo) => pontos.map((r) => ({ t: ms(r.vencimento), taxa: num(r[campo]) })).filter((p) => isFinite(p.t) && isFinite(p.taxa)).sort((a, b) => a.t - b.t);
      // Interpolação em linha reta, pelo calendário, entre os dois vencimentos de DI vizinhos. Fora do intervalo negociado não há valor.
      const interpolar = (pontos, alvo) => {
        if (pontos.length < 2 || alvo < pontos[0].t || alvo > pontos[pontos.length - 1].t) return null;
        const i = pontos.findIndex((p) => p.t >= alvo);
        if (pontos[i].t === alvo) return pontos[i].taxa;
        const a = pontos[i - 1], b = pontos[i];
        return a.taxa + ((b.taxa - a.taxa) * (alvo - a.t)) / (b.t - a.t);
      };
      const hoje = serie(di, 'ajuste_ant'), antes = serie(di3m, 'taxa_ajuste');
      const n = (v) => { const x = num(v); return isFinite(x) ? x : null; };
      const implicita = (nominal, real) => (nominal === null || real === null ? null : +(((1 + nominal / 100) / (1 + real / 100) - 1) * 100).toFixed(2));
      const dif = (a, b) => (a === null || b === null ? null : +((a - b) * 100).toFixed(1));
      return titulos.map((t) => {
        const v = ms(t.vencimento), real = n(t.taxa_venda), realAnt = n(t.taxa_ant), real3m = n(t.taxa_3m);
        const diHoje = interpolar(hoje, v), di3 = interpolar(antes, v);
        const imp = implicita(diHoje, real), imp3 = implicita(di3, real3m);
        return {
          chave: t.chave, titulo: t.titulo, vencimento: t.vencimento, principal: /Principal/.test(t.titulo),
          anos: +((v - ms(t.data_ref)) / ANO).toFixed(2),
          real, real_ant: realAnt, var_dia_bps: dif(real, realAnt), real_3m: real3m, var_3m_bps: dif(real, real3m),
          di: diHoje === null ? null : +diHoje.toFixed(3), implicita: imp,
          di_3m: di3 === null ? null : +di3.toFixed(3), implicita_3m: imp3, var_implicita_3m_bps: dif(imp, imp3),
        };
      }).filter((r) => r.real !== null).sort((a, b) => (a.vencimento === b.vencimento ? a.principal - b.principal : a.vencimento < b.vencimento ? -1 : 1));
    },
  });

  // Título de referência de cada tile: a NTN-B com juros semestrais mais próxima de 5 e de 10 anos, e a mais longa.
  const comJuros = () => linhas('br_real').filter((r) => !r.principal);
  const alvo = (qual) => {
    const lista = comJuros();
    if (!lista.length) return null;
    if (qual === 'longo') return lista[lista.length - 1];
    return d3.least(lista, (r) => Math.abs(r.anos - +qual));
  };
  VC.juroReal = alvo;

  dash.draw('jr-rotulo', (el) => { const r = alvo(el.dataset.alvo); el.textContent = r ? `${r.titulo} ${r.vencimento.slice(0, 4)}` : INDISPONIVEL; });
  dash.draw('jr-venc', (el) => { const r = alvo(el.dataset.alvo); el.textContent = r ? data(r.vencimento) : INDISPONIVEL; });
  dash.draw('jr-num', (el) => { const r = alvo(el.dataset.alvo); el.textContent = r ? pct(r[el.dataset.campo]) : INDISPONIVEL; });
  dash.draw('jr-var', (el) => { const r = alvo(el.dataset.alvo); el.textContent = r ? bps(r[el.dataset.campo]) : INDISPONIVEL; });

  const datas = () => {
    const t = linhas('ntnb')[0] || {}, d = linhas('di1_longo')[0] || {}, d3m = linhas('di1_3m_longo')[0] || {};
    return { td_ref: t.data_ref, td_ant: t.data_ant, td_3m: t.data_3m, di_ref: d.data_ajuste_ant, di_3m: d3m.data_ref };
  };
  VC.juroRealDatas = datas;
  dash.draw('jr-data', (el) => { const v = datas()[el.dataset.campo]; el.textContent = v ? data(v) : INDISPONIVEL; });

  const eixoAnos = (lista) => {
    const ini = Math.min(...lista.map((r) => ms(r.vencimento))), fim = Math.max(...lista.map((r) => ms(r.vencimento)));
    const anoIni = new Date(ini).getUTCFullYear(), anoFim = new Date(fim).getUTCFullYear();
    const passo = anoFim - anoIni > 18 ? 5 : 2;
    const marcas = [];
    for (let a = Math.ceil(anoIni / passo) * passo; a <= anoFim + 1; a += passo) marcas.push({ v: Date.UTC(a, 0, 1), rotulo: String(a) });
    const folga = (fim - ini) * 0.03;
    return { dominio: [ini - folga, fim + folga], marcas };
  };

  const desenhar = (el, campo, campo3m, rotulo, extras) => {
    const todos = linhas('br_real').filter((r) => r[campo] !== null);
    if (todos.length < 3) return aviso(el, INDISPONIVEL);
    const pontos = (lista, c) => lista.filter((r) => r[c] !== null).map((r) => ({ x: ms(r.vencimento), y: r[c] }));
    const juros = todos.filter((r) => !r.principal), principais = todos.filter((r) => r.principal);
    const eixo = eixoAnos(todos);
    grafico(el, {
      rotulo,
      x: eixo,
      y: { sufixo: '%', folgaMin: 0.05 },
      series: [
        ...(extras ? extras(eixo) : []),
        { classe: 'di-line-3m', pontos: pontos(juros, campo3m), curva: 'monotona' },
        { classe: 'di-line', pontos: pontos(juros, campo), curva: 'monotona', marcadores: true },
        { classe: 'vc-sem-linha', pontos: pontos(principais, campo), marcadores: true, classeMarcador: 'di-ring' },
      ],
      encaixes: [...new Set(todos.map((r) => ms(r.vencimento)))],
      dica: (xv) => {
        const noDia = todos.filter((r) => ms(r.vencimento) === xv);
        if (!noDia.length) return null;
        const ls = [];
        noDia.forEach((r) => {
          ls.push([r.titulo, pct(r[campo])]);
          ls.push(['há 3 meses', pct(r[campo3m])]);
        });
        return { x: xv, titulo: 'Vencimento em ' + data(noDia[0].vencimento), pontos: noDia.map((r) => ({ y: r[campo] })), linhas: ls };
      },
    });
  };

  dash.draw('jr-grafico-real', (el) => desenhar(el, 'real', 'real_3m', 'Juro real das NTN-B por vencimento, na data mais recente e três meses antes.'));
  dash.draw('jr-grafico-implicita', (el) => {
    const meta = num((linhas('br_parametros').find((p) => p.chave === 'meta') || {}).valor);
    desenhar(el, 'implicita', 'implicita_3m', 'Inflação implícita por vencimento das NTN-B, na data mais recente e três meses antes, com a meta de inflação.',
      (eixo) => (isFinite(meta) ? [{ classe: 'di-line-ant', pontos: eixo.dominio.map((x) => ({ x, y: meta })) }] : []));
  });

  dash.draw('jr-tabela', (corpo) => tabela(corpo, linhas('br_real'), 'chave', [
    [(r) => r.titulo, ''], [(r) => data(r.vencimento), ''], [(r) => pct(r.real), 'di-num di-strong'], [(r) => bps(r.var_dia_bps), 'di-num'],
    [(r) => pct(r.real_3m), 'di-num'], [(r) => bps(r.var_3m_bps), 'di-num'],
    [(r) => pct(r.di), 'di-num'], [(r) => pct(r.implicita), 'di-num di-strong'], [(r) => pct(r.implicita_3m), 'di-num'], [(r) => bps(r.var_implicita_3m_bps), 'di-num'],
  ]));
})();
