// ---------- Aba Focus ----------
(() => {
  const { num, ok, fmt, pct, sinal, bps, reais, data, linhas, tabela, INDISPONIVEL } = VC;
  const NOMES = { 'IPCA': 'IPCA no ano', 'Selic': 'Selic no fim do ano', 'PIB Total': 'PIB, crescimento no ano', 'Câmbio': 'Dólar (R$/US$)' };
  const ORDEM = ['IPCA', 'Selic', 'PIB Total', 'Câmbio'];
  const cambio = (ind) => ind === 'Câmbio';
  const valor = (ind, v) => (cambio(ind) ? reais(v) : pct(v));
  const mudanca = (ind, v) => (cambio(ind) ? (ok(v) ? sinal(v, 2, '').replace(/^([+−]?)/, '$1R$ ') : INDISPONIVEL) : sinal(v, 2, ' p.p.'));

  dash.calc('focus_medianas', {
    title: 'Medianas do Focus e mudança em 4 semanas',
    description: 'Mediana de cada indicador para o ano corrente e o seguinte, com a mediana de quatro semanas antes e a diferença entre as duas.',
    inputs: ['focus'],
    fn: (focus) => focus.map((r) => {
      const m = num(r.mediana), a = r.mediana_4s === null ? NaN : num(r.mediana_4s);
      return {
        chave: r.chave, indicador: r.indicador, ano: +r.ano, data: r.data, mediana: isFinite(m) ? m : null,
        mediana_4s: isFinite(a) ? a : null, data_4s: r.data_4s || null,
        // a mudança é a diferença entre as medianas já arredondadas em duas casas, para bater com o que a tabela mostra
        mudanca: isFinite(m) && isFinite(a) ? +(+m.toFixed(2) - +a.toFixed(2)).toFixed(2) : null,
        respondentes: r.respondentes === null || r.respondentes === '' ? null : +r.respondentes,
      };
    }).sort((x, y) => ORDEM.indexOf(x.indicador) - ORDEM.indexOf(y.indicador) || x.ano - y.ano),
  });

  dash.calc('focus_selic_curva', {
    title: 'Selic no fim do ano: Focus e curva DI',
    description: 'Mediana do Focus para a Selic no fim de cada ano contra o CDI embutido na curva depois da última reunião do Copom do ano, somado à distância atual entre a meta da Selic e o CDI.',
    inputs: ['focus_medianas', 'copom_implicito', 'br_parametros', 'cdi_base'],
    fn: (medianas, copom, parametros, cdiBase) => {
      const selic = num((parametros.find((p) => p.chave === 'selic') || {}).valor), cdi = num((cdiBase[0] || {}).taxa);
      const spread = isFinite(selic) && isFinite(cdi) ? +(selic - cdi).toFixed(3) : null;
      return medianas.filter((r) => r.indicador === 'Selic').map((r) => {
        const reunioes = (copom || []).filter((c) => String(c.reuniao).slice(0, 4) === String(r.ano));
        const ultima = reunioes[reunioes.length - 1] || null;
        const equivalente = ultima && spread !== null ? +(ultima.cdi_depois + spread).toFixed(2) : null;
        return {
          ano: r.ano, focus: r.mediana, reuniao: ultima ? ultima.reuniao : null, cdi_curva: ultima ? +ultima.cdi_depois.toFixed(2) : null, spread,
          selic_curva: equivalente, dif_bps: equivalente !== null && r.mediana !== null ? +((equivalente - r.mediana) * 100).toFixed(0) : null,
        };
      });
    },
  });

  const medianas = () => linhas('focus_medianas');
  const anos = () => [...new Set(medianas().map((r) => r.ano))].sort();
  const linha = (el) => { const a = anos()[+el.dataset.idx]; return medianas().find((r) => r.indicador === el.dataset.ind && r.ano === a) || null; };
  VC.focus = (ind, idx) => { const a = anos()[idx]; return medianas().find((r) => r.indicador === ind && r.ano === a) || null; };

  dash.draw('fx-ano', (el) => { const a = anos()[+el.dataset.idx]; el.textContent = a ? String(a) : INDISPONIVEL; });
  dash.draw('fx-num', (el) => { const r = linha(el); el.textContent = r ? valor(r.indicador, r.mediana) : INDISPONIVEL; });
  dash.draw('fx-4s', (el) => { const r = linha(el); el.textContent = r ? valor(r.indicador, r.mediana_4s) : INDISPONIVEL; });
  dash.draw('fx-data', (el) => { const d = medianas().map((r) => r.data).sort().pop(); el.textContent = d ? data(d) : INDISPONIVEL; });

  dash.draw('fx-tabela', (corpo) => tabela(corpo, medianas(), 'chave', [
    [(r) => NOMES[r.indicador] || r.indicador, ''], [(r) => String(r.ano), ''], [(r) => valor(r.indicador, r.mediana), 'di-num di-strong'],
    [(r) => valor(r.indicador, r.mediana_4s), 'di-num'], [(r) => mudanca(r.indicador, r.mudanca), 'di-num'],
    [(r) => (r.respondentes === null ? INDISPONIVEL : fmt(r.respondentes, 0)), 'di-num'],
    [(r) => (r.data_4s ? `${data(r.data)} e ${data(r.data_4s)}` : data(r.data)), ''],
  ]));

  dash.draw('fx-spread', (el) => {
    const r = linhas('focus_selic_curva')[0];
    el.textContent = r && r.spread !== null ? fmt(r.spread, 2) + ' ponto percentual' : INDISPONIVEL;
  });
  dash.draw('fx-tabela-selic', (corpo) => tabela(corpo, linhas('focus_selic_curva'), 'ano', [
    [(r) => String(r.ano), ''], [(r) => pct(r.focus), 'di-num di-strong'], [(r) => (r.reuniao ? data(r.reuniao) : INDISPONIVEL), ''],
    [(r) => pct(r.cdi_curva), 'di-num'], [(r) => pct(r.selic_curva), 'di-num di-strong'], [(r) => bps(r.dif_bps), 'di-num'],
  ]));

  dash.draw('fx-tabela-inflacao', (corpo) => {
    const itens = medianas().filter((r) => r.indicador === 'IPCA').map((r) => ({ chave: 'focus' + r.ano, medida: 'Focus, mediana do IPCA', horizonte: `ano de ${r.ano}`, valor: r.mediana }));
    const datas = VC.juroRealDatas ? VC.juroRealDatas() : {};
    linhas('br_real').filter((r) => r.implicita !== null).slice(0, 3).forEach((r) => itens.push({
      chave: r.chave, medida: `Implícita na ${r.titulo} ${r.vencimento.slice(0, 4)}`,
      horizonte: `média de ${datas.td_ref ? data(datas.td_ref) : 'hoje'} até ${data(r.vencimento)}`, valor: r.implicita,
    }));
    tabela(corpo, itens, 'chave', [[(r) => r.medida, ''], [(r) => r.horizonte, ''], [(r) => pct(r.valor), 'di-num di-strong']]);
  });
})();
