// ---------- Relatório diário ----------
// Documento à parte, que a rotina da manhã imprime em PDF. Não tem conta própria: o modelo (relatorio.html) marca com
// data-de="#id" os trechos que vêm das abas do site, e este arquivo os traz para o lugar antes de a página desenhar.
// Assim os números e os gráficos do relatório são os mesmos do site, feitos pelo mesmo código.
(() => {
  const { linhas, valor, dataHora, INDISPONIVEL } = VC;
  const origem = document.getElementById('rl-origem');
  document.querySelectorAll('[data-de]').forEach((vaga) => {
    const trecho = origem.querySelector(vaga.dataset.de);
    if (trecho) vaga.replaceWith(trecho);
    else { vaga.className = 'di-note'; vaga.textContent = INDISPONIVEL; }
  });
  origem.remove();   // o que não entrou no relatório sai do documento

  const montagem = () => (linhas('noticias_montagem')[0] || {}).montada_em || null;
  // Momento em que a edição foi montada: a atualização mais recente entre os blocos de dados.
  const atualizado = () => Object.values(valor('status') || {}).map((s) => s && s.em).filter(Boolean).sort().pop() || null;

  dash.draw('rl-edicao', (el) => {
    const m = montagem(), d = m ? new Date(m) : null;
    el.textContent = d && !isNaN(d)
      ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
      : INDISPONIVEL;
  });
  dash.draw('rl-montagem', (el) => { const a = atualizado(); el.textContent = a ? dataHora(a) : INDISPONIVEL; });

  dash.draw('rl-noticias-resumo', (el) => {
    const itens = linhas('noticias'), m = montagem();
    if (!itens.length || !m) { el.textContent = INDISPONIVEL; return; }
    const veiculos = new Set(itens.map((n) => n.fonte)).size;
    const repetidas = itens.filter((n) => +n.veiculos > 1).length;
    el.textContent = `Seleção montada em ${dataHora(m)}: ${itens.length} matérias de ${veiculos} veículos, em três seções.`
      + (repetidas ? ` ${repetidas === 1 ? 'Uma delas saiu' : repetidas + ' delas saíram'} em mais de um veículo, o que este relatório indica ao lado do título.` : '');
  });

  // Fontes que não responderam na última tentativa: o relatório traz o dado anterior, com a data ao lado de cada número.
  const BLOCOS = {
    curva_di: 'curva DI (B3)', ntnb: 'NTN-B (Tesouro Direto)', fed_funds: 'Fed funds (NY Fed)', treasuries: 'Treasuries (Tesouro americano)', fomc: 'dot plot e calendário do Fed',
    futuros_fed: 'futuros de Fed funds (Yahoo Finance)', macro_eua: 'inflação e emprego dos EUA (BLS)', inflacao_br: 'inflação brasileira (Banco Central)', ibovespa: 'Ibovespa (B3)',
    papeis_br: 'ações do Ibovespa (B3)', historico_br: 'dólar e histórico do Ibovespa', ifix: 'IFIX (B3)', fiis: 'fundos do IFIX (B3)', historico_fii: 'CDI e histórico do IFIX',
    dolar_futuro: 'dólar futuro (B3)', dolar_curva: 'curva do dólar futuro (B3)', fiis_cvm: 'informes dos FIIs (CVM)', focus: 'Focus (Banco Central)', agenda: 'agenda de divulgações (FRED)', noticias: 'notícias',
  };
  dash.draw('rl-fontes', (el) => {
    const status = valor('status') || {}, nomes = Object.keys(BLOCOS).filter((n) => status[n]);
    if (!nomes.length) { el.textContent = INDISPONIVEL; return; }
    const falhas = nomes.filter((n) => !status[n].ok);
    el.textContent = falhas.length
      ? `Fontes que não responderam na última tentativa antes da montagem: ${falhas.map((n) => `${BLOCOS[n]}, com dado de ${dataHora(status[n].em)}`).join('; ')}. `
        + `Nesses blocos o relatório traz o dado anterior. Antes da abertura do pregão é normal a B3 ainda não ter cotação do dia. As outras ${nomes.length - falhas.length} fontes responderam.`
      : `As ${nomes.length} fontes responderam na última tentativa antes da montagem.`;
  });

  const site = window.VC_ENDERECO || '';
  dash.draw('rl-site', (el) => { el.textContent = site.replace(/^https:\/\//, '').replace(/\/$/, '') || INDISPONIVEL; });

  // Conferência para a rotina que imprime: sem a biblioteca de gráficos o relatório sairia incompleto, e a rotina não o publica.
  dash.draw('rl-conferencia', (el) => { const falta = typeof d3 === 'undefined'; el.hidden = !falta; el.textContent = falta ? 'RELATORIO-INCOMPLETO: biblioteca de gráficos indisponível' : ''; });

  window.iniciarCurvaDI();

  // Matérias que saíram em mais de um veículo: a contagem entra ao lado do veículo.
  const porLink = new Map(linhas('noticias').map((n) => [n.link, n]));
  document.querySelectorAll('.vc-noticias li').forEach((li) => {
    const a = li.querySelector('a'), meta = li.querySelector('.vc-noticia-meta'), n = a && porLink.get(a.getAttribute('href'));
    if (n && meta && +n.veiculos > 1) meta.textContent += ` · em ${n.veiculos} veículos`;
  });
  // No PDF, os atalhos para as abas levam ao site.
  if (site) document.querySelectorAll('a[href^="#"]').forEach((a) => { a.href = site + a.getAttribute('href'); });
})();
