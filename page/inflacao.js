// ---------- Aba Inflação BR ----------
(() => {
  const { num, ok, pct, data, mes, ms, linhas, tabela, aviso, grafico, MESES, INDISPONIVEL } = VC;
  const TOLERANCIA = 1.5;   // pontos percentuais em torno da meta, regra do CMN (digitado à mão)

  dash.calc('inflacao_meses', {
    title: 'Índices de inflação mês a mês',
    description: 'IPCA, IPCA-15 e IGP-M de cada mês, com o acumulado em 12 meses (o do IPCA vem da fonte; os outros são compostos aqui).',
    inputs: ['br_inflacao'],
    fn: (pontos) => {
      const serie = (nome) => pontos.filter((p) => p.serie === nome).sort((a, b) => (a.mes > b.mes ? 1 : -1));
      const acumulado = (lista, i) => {
        if (i < 11) return null;
        let fator = 1;
        for (let k = i - 11; k <= i; k++) fator *= 1 + +lista[k].valor / 100;
        return +((fator - 1) * 100).toFixed(2);
      };
      const ipca = serie('ipca'), ipca12 = serie('ipca_12m'), ipca15 = serie('ipca15'), igpm = serie('igpm');
      const mesesTodos = [...new Set(pontos.map((p) => p.mes))].sort();
      return mesesTodos.map((m) => {
        const de = (lista) => { const p = lista.find((x) => x.mes === m); return p ? +p.valor : null; };
        const i15 = ipca15.findIndex((x) => x.mes === m), ig = igpm.findIndex((x) => x.mes === m);
        const iI = ipca.findIndex((x) => x.mes === m), oficial = de(ipca12), composto = iI >= 0 ? acumulado(ipca, iI) : null;
        return { mes: m, ipca: de(ipca), ipca_12m: oficial !== null ? oficial : composto, ipca_12m_origem: oficial !== null ? 'oficial' : (composto !== null ? 'calculado' : null), ipca15: de(ipca15), ipca15_12m: i15 >= 0 ? acumulado(ipca15, i15) : null,
          igpm: de(igpm), igpm_12m: ig >= 0 ? acumulado(igpm, ig) : null };
      });
    },
  });

  const ultimo = (serie) => {
    const lista = linhas('br_inflacao').filter((p) => p.serie === serie).sort((a, b) => (a.mes > b.mes ? 1 : -1));
    return { atual: lista[lista.length - 1] || null, anterior: lista[lista.length - 2] || null };
  };
  const parametro = (nome) => linhas('br_parametros').find((p) => p.nome === nome) || null;

  // O acumulado em 12 meses acompanha o mês do IPCA mensal; se a série oficial ainda não tem o mês, vale o composto.
  const doze = (posicao) => { const l = linhas('inflacao_meses').filter((r) => r.ipca !== null); return l[l.length - posicao] || null; };
  const sufixo = (r) => (r && r.ipca_12m_origem === 'calculado' ? ' (calculado)' : '');
  dash.draw('inf-valor', (el) => {
    if (el.dataset.serie === 'ipca_12m') { const r = doze(1); el.textContent = r && r.ipca_12m !== null ? pct(r.ipca_12m) : INDISPONIVEL; return; }
    const u = ultimo(el.dataset.serie).atual; el.textContent = u ? pct(num(u.valor)) : INDISPONIVEL;
  });
  dash.draw('inf-12m-origem', (el) => { const r = doze(1); el.textContent = r && r.ipca_12m_origem === 'calculado' ? 'composto nesta página a partir do IPCA mensal; a série oficial ainda não tem o mês' : 'série oficial do Banco Central'; });
  dash.draw('inf-anterior', (el) => {
    if (el.dataset.serie === 'ipca_12m') { const r = doze(2); el.textContent = r && r.ipca_12m !== null ? pct(r.ipca_12m) : INDISPONIVEL; return; }
    const u = ultimo(el.dataset.serie).anterior; el.textContent = u ? pct(num(u.valor)) : INDISPONIVEL;
  });
  dash.draw('inf-mes', (el) => { const u = ultimo(el.dataset.serie === 'ipca_12m' ? 'ipca' : el.dataset.serie).atual; el.textContent = u ? mes(u.mes) : INDISPONIVEL; });
  dash.draw('inf-mes-ref', (el) => { const u = ultimo('ipca').atual; el.textContent = u ? mes(u.mes) : INDISPONIVEL; });
  dash.draw('inf-divulgacao', (el) => {
    const u = ultimo('ipca').atual;
    el.textContent = u && u.visto_em ? `indisponível na fonte; o número de ${mes(u.mes)} entrou nesta página em ${data(u.visto_em)}` : 'indisponível na fonte';
  });
  dash.draw('inf-meta', (el) => { const p = parametro('meta'); el.textContent = p ? pct(num(p.valor)) : INDISPONIVEL; });
  dash.draw('inf-tolerancia', (el) => { el.textContent = VC.fmt(TOLERANCIA, 1) + ' p.p.'; });
  dash.draw('inf-selic', (el) => { const p = parametro('selic'); el.textContent = p ? pct(num(p.valor)) : INDISPONIVEL; });
  dash.draw('inf-selic-data', (el) => { const p = parametro('selic'); el.textContent = p ? data(p.ref) : INDISPONIVEL; });

  dash.draw('inf-grafico', (el) => {
    const meses = linhas('inflacao_meses').filter((r) => r.ipca_12m !== null).slice(-24);
    const meta = parametro('meta');
    if (meses.length < 3) return aviso(el, INDISPONIVEL);
    const x = (r) => ms(r.mes + '-01');
    const alvo = meta ? num(meta.valor) : null;
    grafico(el, {
      rotulo: 'IPCA acumulado em 12 meses, mês a mês, comparado com a meta de inflação e o intervalo de tolerância.',
      x: { dominio: [x(meses[0]), x(meses[meses.length - 1])], marcas: meses.filter((r, i) => (meses.length - 1 - i) % 3 === 0).map((r) => ({ v: x(r), rotulo: mes(r.mes), curto: MESES[+r.mes.slice(5) - 1] + '/' + r.mes.slice(2, 4) })) },
      y: { sufixo: '%', folgaMin: 0.3 },
      faixas: ok(alvo) ? [{ y0: alvo - TOLERANCIA, y1: alvo + TOLERANCIA, classe: 'vc-faixa' }] : [],
      series: [
        { classe: 'di-line-ant', pontos: ok(alvo) ? [{ x: x(meses[0]), y: alvo }, { x: x(meses[meses.length - 1]), y: alvo }] : [] },
        { classe: 'di-line', marcadores: true, pontos: meses.map((r) => ({ x: x(r), y: r.ipca_12m })) },
      ],
      encaixes: meses.map(x),
      dica: (xv) => {
        const r = d3.least(meses, (m) => Math.abs(x(m) - xv));
        return { x: x(r), titulo: mes(r.mes), pontos: [{ y: r.ipca_12m }], linhas: [['IPCA em 12 meses', pct(r.ipca_12m)], ['IPCA no mês', pct(r.ipca)], ['Meta', pct(alvo)]] };
      },
    });
  });

  dash.draw('inf-tabela', (corpo) => tabela(corpo, linhas('inflacao_meses').filter((r) => r.ipca !== null || r.ipca15 !== null || r.igpm !== null).slice(-13).reverse(), 'mes', [
    [(r) => mes(r.mes), ''], [(r) => pct(r.ipca), 'di-num di-strong'], [(r) => pct(r.ipca_12m) + sufixo(r), 'di-num'], [(r) => pct(r.ipca15), 'di-num'], [(r) => pct(r.ipca15_12m), 'di-num'],
    [(r) => pct(r.igpm), 'di-num'], [(r) => pct(r.igpm_12m), 'di-num'],
  ]));
})();
