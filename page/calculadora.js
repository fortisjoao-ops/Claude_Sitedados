// ---------- Aba Calculadora de equivalência de taxas ----------
(() => {
  const { num, nf, ok, fmt, pct, bps, sinal, data, linhas, tabela, INDISPONIVEL } = VC;
  const BASE = 252;
  const n = (v) => { const x = num(v); return isFinite(x) ? x : null; };
  const interpolar = (pontos, x) => {
    if (pontos.length < 2 || x < pontos[0].x || x > pontos[pontos.length - 1].x) return null;
    const i = pontos.findIndex((p) => p.x >= x);
    if (pontos[i].x === x) return pontos[i].y;
    const a = pontos[i - 1], b = pontos[i];
    return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  };
  // Curvas: DI de ajuste por dias úteis e juro real das NTN-B Principal pelo prazo em anos.
  const curvaDI = () => linhas('di1_longo').map((v) => ({ x: +v.du, y: n(v.ajuste_ant) })).filter((p) => p.y !== null && isFinite(p.x)).sort((a, b) => a.x - b.x);
  const curvaReal = () => linhas('br_real').filter((t) => t.principal && t.real !== null).map((t) => ({ x: t.anos, y: t.real })).sort((a, b) => a.x - b.x);
  const faixa = () => {
    const di = curvaDI(), real = curvaReal();
    if (di.length < 2) return null;
    // limites arredondados para dentro, em décimos de ano, para o texto e a validação baterem
    const acima = (v) => Math.ceil(v * 10 - 1e-9) / 10, abaixo = (v) => Math.floor(v * 10 + 1e-9) / 10;
    const min = acima(di[0].x / BASE), max = abaixo(di[di.length - 1].x / BASE);
    return { min, max, ipca_min: real.length > 1 ? Math.max(min, acima(real[0].x)) : null, ipca_max: real.length > 1 ? Math.min(max, abaixo(real[real.length - 1].x)) : null };
  };

  const ler = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const numero = (texto) => { const t = String(texto).trim().replace(/\s/g, '').replace('%', '').replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(t) ? +t : NaN; };
  const calcular = () => {
    const indexador = ler('calc-indexador'), taxa = numero(ler('calc-taxa')), prazo = numero(ler('calc-prazo')), f = faixa();
    if (!f) return { erro: 'indisponível: a curva de DI não foi carregada' };
    if (!isFinite(taxa)) return { erro: 'Informe a taxa como número, por exemplo 8,50.' };
    if (!isFinite(prazo) || prazo < f.min || prazo > f.max) return { erro: `Informe um prazo entre ${fmt(f.min, 1)} e ${fmt(f.max, 1)} anos.` };
    const di = interpolar(curvaDI(), prazo * BASE);
    const real = interpolar(curvaReal(), prazo);
    const inflacao = di === null || real === null ? null : ((1 + di / 100) / (1 + real / 100) - 1) * 100;
    const diaria = (anual) => Math.pow(1 + anual / 100, 1 / BASE) - 1;
    let pre = null;
    if (indexador === 'pre') pre = taxa;
    else if (indexador === 'cdi') pre = ((1 + di / 100) * (1 + taxa / 100) - 1) * 100;
    else if (indexador === 'pcdi') pre = (Math.pow(1 + diaria(di) * taxa / 100, BASE) - 1) * 100;
    else if (inflacao !== null) pre = ((1 + taxa / 100) * (1 + inflacao / 100) - 1) * 100;
    if (pre === null) return { erro: `Nesse prazo não há NTN-B Principal e DI juntos; as equivalências com IPCA existem de ${fmt(f.ipca_min, 1)} a ${fmt(f.ipca_max, 1)} anos.`, prazo };
    if (pre <= -99) return { erro: 'A taxa informada não gera uma equivalência válida.' };
    const ipca = inflacao === null ? null : ((1 + pre / 100) / (1 + inflacao / 100) - 1) * 100;
    return { indexador, taxa, prazo, di, real, inflacao, pre, cdi: ((1 + pre / 100) / (1 + di / 100) - 1) * 100, pcdi: (diaria(pre) / diaria(di)) * 100, ipca,
      premio: ipca === null || real === null ? null : (ipca - real) * 100 };
  };

  const DESENHOS = ['calc-aviso', 'calc-prazo-texto', 'calc-resultado', 'calc-curvas', 'calc-rotulo-taxa'];
  dash.draw('calc-campo', (el) => { el.oninput = el.onchange = () => DESENHOS.forEach((nome) => dash.draw(nome)); });
  dash.draw('calc-rotulo-taxa', (el) => { el.textContent = { ipca: 'Taxa acima do IPCA (% ao ano)', cdi: 'Spread sobre o CDI (% ao ano)', pcdi: 'Percentual do CDI (%)', pre: 'Taxa prefixada (% ao ano)' }[ler('calc-indexador')] || 'Taxa'; });
  dash.draw('calc-faixa', (el) => { const f = faixa(), v = f ? f[el.dataset.campo] : null; el.textContent = ok(v) ? fmt(v, 1) : INDISPONIVEL; });
  dash.draw('calc-data', (el) => {
    const d = linhas('di1_longo')[0], t = linhas('ntnb')[0];
    el.textContent = el.dataset.campo === 'di' ? (d && d.data_ajuste_ant ? data(d.data_ajuste_ant) : INDISPONIVEL) : (t ? data(t.data_ref) : INDISPONIVEL);
  });
  dash.draw('calc-aviso', (el) => { const r = calcular(); el.hidden = !r.erro; el.textContent = r.erro || ''; });
  dash.draw('calc-prazo-texto', (el) => { const r = calcular(); el.textContent = ok(r.prazo) ? `${fmt(r.prazo, 1)} ${r.prazo === 1 ? 'ano' : 'anos'}` : '—'; });

  dash.draw('calc-resultado', (corpo) => {
    const r = calcular();
    if (r.erro) return tabela(corpo, [], 'id', [[() => '', ''], [() => '', ''], [() => '', '']]);
    const informado = (id) => (r.indexador === id ? ' (informado)' : '');
    const registros = [
      { id: 'pre', nome: 'Prefixado' + informado('pre'), valor: pct(r.pre), ler: 'taxa nominal ao ano, base 252 dias úteis' },
      { id: 'cdi', nome: 'CDI + spread' + informado('cdi'), valor: 'CDI ' + sinal(r.cdi, 2, '%'), ler: 'spread ao ano, composto sobre o CDI' },
      { id: 'pcdi', nome: '% do CDI' + informado('pcdi'), valor: fmt(r.pcdi, 1) + '% do CDI', ler: 'percentual aplicado à taxa diária do CDI' },
      { id: 'ipca', nome: 'IPCA + taxa' + informado('ipca'), valor: r.ipca === null ? INDISPONIVEL : 'IPCA ' + sinal(r.ipca, 2, '%'), ler: 'juro real ao ano, pela inflação implícita do prazo' },
      { id: 'premio', nome: 'Prêmio sobre a NTN-B', valor: r.premio === null ? INDISPONIVEL : bps(r.premio), ler: 'taxa em IPCA + menos a NTN-B Principal do mesmo prazo' },
    ];
    tabela(corpo, registros, 'id', [[(x) => x.nome, ''], [(x) => x.valor, 'di-num di-strong'], [(x) => x.ler, '']]);
  });

  dash.draw('calc-curvas', (corpo) => {
    const r = calcular();
    if (r.erro && !ok(r.prazo)) return tabela(corpo, [], 'id', [[() => '', ''], [() => '', ''], [() => '', '']]);
    const f = faixa(), prazo = r.prazo, di = r.erro ? interpolar(curvaDI(), prazo * BASE) : r.di, real = r.erro ? interpolar(curvaReal(), prazo) : r.real;
    const inflacao = r.erro ? null : r.inflacao;
    const registros = [
      { id: 'di', nome: 'DI futuro (prefixado)', valor: pct(di), origem: 'ajuste dos contratos de DI, B3' },
      { id: 'real', nome: 'Juro real, NTN-B Principal', valor: real === null ? INDISPONIVEL : pct(real), origem: 'taxa de venda no Tesouro Direto' },
      { id: 'inf', nome: 'Inflação implícita', valor: inflacao === null ? INDISPONIVEL : pct(inflacao), origem: 'conta desta página: DI contra NTN-B' },
    ];
    tabela(corpo, registros, 'id', [[(x) => x.nome, ''], [(x) => x.valor, 'di-num di-strong'], [(x) => x.origem, '']]);
  });
})();
