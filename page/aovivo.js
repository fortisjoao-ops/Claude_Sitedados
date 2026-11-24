// ---------- Cotações relidas ao vivo: dólar futuro, Ibovespa e IFIX ----------
// A atualização do site grava essas três cotações. Com a página aberta, o navegador as relê direto da B3 a cada minuto,
// em horário de pregão, e troca o dado gravado pelo mais novo. A B3 já entrega o dado com 15 minutos de atraso.
// Se a B3 não responder, fica o dado gravado, sem aviso. Os outros números da página só mudam nas atualizações do site.
(() => {
  const { num, ok, reais, varPct, dataHora, linhas, MESES, INDISPONIVEL } = VC;
  const texto = (v) => (ok(v) ? String(v) : null);
  const mil = (v) => (ok(v) ? String(+(v / 1000).toFixed(4)) : null);   // o dólar futuro é cotado por US$ 1.000
  const RESUMO = ['rs-valor', 'rs-tiles', 'rs-tabela'];
  const indice = (g, q) => ({ ...g, nivel: texto(q.curPrc), var_dia: texto(q.prcFlcn), abertura: texto(q.opngPric), minimo: texto(q.minPric), maximo: texto(q.maxPric) });
  const ALVOS = [
    { dado: 'br_dolar_fut', simbolo: (g) => g.simbolo, formato: /^DOL[A-Z]\d\d$/, desenhos: ['dol-preco', 'dol-var', 'dol-campo', 'dol-quando'],
      aplicar: (g, q) => ({ ...g, preco: mil(q.curPrc), var_dia: texto(q.prcFlcn), abertura: mil(q.opngPric), minimo: mil(q.minPric), maximo: mil(q.maxPric) }) },
    { dado: 'br_ibov', simbolo: () => 'IBOV', formato: /^IBOV$/, desenhos: ['ac-nivel', 'ac-campo', 'ac-cotado', 'ac-var', 'ac-base', 'ac-grafico'], aplicar: indice },
    { dado: 'br_ifix', simbolo: () => 'IFIX', formato: /^IFIX$/, desenhos: ['fii-nivel', 'fii-campo', 'fii-cotado', 'fii-var', 'fii-base'], aplicar: indice },
  ];

  // Dólar futuro: leitura e desenhos próprios (o Ibovespa e o IFIX usam os desenhos das abas deles).
  const dolar = () => linhas('br_dolar_fut')[0] || null;
  VC.dolarFuturo = dolar;
  VC.mesDoContrato = (c) => (c ? MESES[+c.vencimento.slice(5, 7) - 1] + '/' + c.vencimento.slice(2, 4) : '');
  dash.draw('dol-preco', (el) => { const c = dolar(); el.textContent = c ? reais(num(c.preco), 4) : INDISPONIVEL; });
  dash.draw('dol-var', (el) => { const c = dolar(); el.textContent = c ? varPct(num(c.var_dia)) : INDISPONIVEL; });
  dash.draw('dol-campo', (el) => { const c = dolar(); el.textContent = c && ok(num(c[el.dataset.campo])) ? reais(num(c[el.dataset.campo]), 4) : INDISPONIVEL; });
  dash.draw('dol-venc', (el) => { const c = dolar(); el.textContent = c ? VC.mesDoContrato(c) : INDISPONIVEL; });
  dash.draw('dol-simbolo', (el) => { const c = dolar(); el.textContent = c ? c.simbolo : INDISPONIVEL; });
  dash.draw('dol-quando', (el) => { const c = dolar(); el.textContent = c ? dataHora(c.cotado_em) : INDISPONIVEL; });

  const reler = (alvo) => {
    const g = linhas(alvo.dado)[0];
    if (!g) return;
    const simbolo = alvo.simbolo(g);
    if (!alvo.formato.test(String(simbolo))) return;
    fetch('https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation/' + simbolo, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('resposta ' + r.status))))
      .then((j) => {
        const q = j && j.BizSts && j.BizSts.cd === 'OK' && j.Trad && j.Trad[0] && j.Trad[0].scty && j.Trad[0].scty.SctyQtn;
        if (!q || !ok(q.curPrc) || !j.Msg || !j.Msg.dtTm) return;   // sem cotação nova, fica o dado gravado
        const quando = String(j.Msg.dtTm).replace(' ', 'T') + '-03:00';
        const agora = linhas(alvo.dado)[0];
        if (!agora || quando <= String(agora.cotado_em)) return;
        dash.definir(alvo.dado, [{ ...alvo.aplicar(agora, q), cotado_em: quando }]);
        [...alvo.desenhos, ...RESUMO].forEach((n) => dash.draw(n));
      })
      .catch(() => {});   // falha de rede ou recusa da B3: fica o dado gravado
  };
  const relerTudo = () => ALVOS.forEach((alvo, i) => setTimeout(() => reler(alvo), i * 400));
  // Pregão: dias úteis, das 9h às 18h50 de Brasília (o dólar futuro abre às 9h; a folga cobre o atraso de 15 minutos).
  const emPregao = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    const minutos = +p.hour * 60 + +p.minute;
    return p.weekday !== 'Sat' && p.weekday !== 'Sun' && minutos >= 9 * 60 && minutos <= 18 * 60 + 50;
  };
  dash.onData(() => {
    if (window.VC_ESTATICO) return;   // relatório em PDF: ficam os dados gravados
    setTimeout(relerTudo, 0);   // uma leitura ao abrir a página, mesmo fora do pregão
    setInterval(() => { if (document.visibilityState === 'visible' && emPregao()) relerTudo(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && emPregao()) relerTudo(); });
  });
})();
