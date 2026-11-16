// ---------- Dólar futuro (B3), com releitura enquanto a página está aberta ----------
// A atualização do site grava a cotação do primeiro vencimento do dólar futuro. Com a página aberta, o navegador relê
// essa mesma cotação direto da B3 a cada minuto, em horário de pregão. A B3 já entrega o dado com 15 minutos de atraso.
(() => {
  const { num, ok, reais, varPct, dataHora, linhas, MESES, INDISPONIVEL } = VC;
  const gravado = () => linhas('br_dolar_fut')[0] || null;
  let aoVivo = null;
  const atual = () => {
    const g = gravado();
    return aoVivo && g && aoVivo.simbolo === g.simbolo && aoVivo.cotado_em > g.cotado_em ? aoVivo : g;
  };
  VC.dolarFuturo = atual;
  VC.mesDoContrato = (c) => (c ? MESES[+c.vencimento.slice(5, 7) - 1] + '/' + c.vencimento.slice(2, 4) : '');

  dash.draw('dol-preco', (el) => { const c = atual(); el.textContent = c ? reais(num(c.preco), 4) : INDISPONIVEL; });
  dash.draw('dol-var', (el) => { const c = atual(); el.textContent = c ? varPct(num(c.var_dia)) : INDISPONIVEL; });
  dash.draw('dol-campo', (el) => { const c = atual(); el.textContent = c && ok(num(c[el.dataset.campo])) ? reais(num(c[el.dataset.campo]), 4) : INDISPONIVEL; });
  dash.draw('dol-venc', (el) => { const c = atual(); el.textContent = c ? VC.mesDoContrato(c) : INDISPONIVEL; });
  dash.draw('dol-simbolo', (el) => { const c = atual(); el.textContent = c ? c.simbolo : INDISPONIVEL; });
  dash.draw('dol-quando', (el) => { const c = atual(); el.textContent = c ? dataHora(c.cotado_em) : INDISPONIVEL; });

  const DESENHOS = ['dol-preco', 'dol-var', 'dol-campo', 'dol-quando', 'rs-valor', 'rs-tiles', 'rs-tabela'];
  const reler = () => {
    const g = gravado();
    if (!g || !/^DOL[A-Z]\d\d$/.test(g.simbolo)) return;
    fetch('https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation/' + g.simbolo, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('resposta ' + r.status))))
      .then((j) => {
        const q = j && j.BizSts && j.BizSts.cd === 'OK' && j.Trad && j.Trad[0] && j.Trad[0].scty && j.Trad[0].scty.SctyQtn;
        if (!q || !ok(q.curPrc) || !j.Msg || !j.Msg.dtTm) return;   // sem cotação nova, fica o dado gravado
        const mil = (v) => (ok(v) ? +(v / 1000).toFixed(4) : null);
        aoVivo = { ...g, preco: mil(q.curPrc), var_dia: ok(q.prcFlcn) ? q.prcFlcn : null, abertura: mil(q.opngPric), minimo: mil(q.minPric), maximo: mil(q.maxPric),
          cotado_em: String(j.Msg.dtTm).replace(' ', 'T') + '-03:00' };
        DESENHOS.forEach((n) => dash.draw(n));
      })
      .catch(() => {});   // falha de rede ou recusa da B3: fica o dado gravado, sem aviso
  };
  // Pregão do dólar futuro: dias úteis, das 9h às 18h30 de Brasília (com folga para o atraso de 15 minutos).
  const emPregao = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    const minutos = +p.hour * 60 + +p.minute;
    return p.weekday !== 'Sat' && p.weekday !== 'Sun' && minutos >= 9 * 60 && minutos <= 18 * 60 + 50;
  };
  dash.onData(() => {
    setTimeout(reler, 0);   // uma leitura ao abrir a página, mesmo fora do pregão
    setInterval(() => { if (document.visibilityState === 'visible' && emPregao()) reler(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && emPregao()) reler(); });
  });
})();
