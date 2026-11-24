// ---------- Daily Market Briefing: o relatório diário em PDF ----------
// Documento à parte, que a rotina imprime em PDF (relatorio.py). É montado direto dos dados e dos cálculos do site
// (dash.data, VC.resumoItens, VC.agendaItens), sem copiar a tela: cada seção abaixo é um componente que recebe os
// dados e devolve os elementos da página. O relatório não tem conta própria; só organiza e apresenta.
(() => {
  const { linhas, valor, reais, varPct, data, dataHora, diaHora, INDISPONIVEL } = VC;
  // Alguns cálculos do site usam a biblioteca d3. Sem ela o relatório sairia incompleto: a página avisa e a rotina não publica.
  if (typeof d3 === 'undefined') { document.body.append(Object.assign(document.createElement('p'), { className: 'mb-incompleto', textContent: 'RELATORIO-INCOMPLETO: biblioteca de cálculo indisponível' })); return; }

  // ----- Utilidades de montagem -----
  const no = (tag, classe, conteudo) => {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (conteudo !== undefined && conteudo !== null) el.append(...[].concat(conteudo).filter((c) => c !== null && c !== undefined && c !== ''));
    return el;
  };
  // Título e primeiro bloco ficam num grupo que não se parte: um título nunca sobra sozinho no pé da página.
  const junto = (...filhos) => no('div', 'mb-junto', filhos.filter(Boolean));
  const titulo = (texto) => no('h2', 'mb-h2', texto);
  const sinalDe = (texto) => (/^\+/.test(texto) ? 'mb-pos' : /^[−-]/.test(texto) ? 'mb-neg' : '');
  const tabela = (classe, cabecalho, registros, celulas) => {
    const t = no('table', 'mb-tab ' + classe);
    t.append(no('thead', '', no('tr', '', cabecalho.map(([texto, c]) => no('th', c || '', texto)))));
    t.append(no('tbody', '', registros.map((r) => no('tr', '', celulas(r).map(([conteudo, c]) => no('td', c || '', conteudo))))));
    return t;
  };

  const montagem = () => (linhas('noticias_montagem')[0] || {}).montada_em || null;
  const status = () => valor('status') || {};
  // Momento dos dados: a atualização mais recente entre os blocos.
  const atualizado = () => Object.values(status()).map((s) => s && s.em).filter(Boolean).sort().pop() || null;
  const edicao = () => { const m = montagem(); return m ? new Date(m) : null; };
  const dataLonga = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const diaDaEdicao = () => { const m = montagem(); return m ? data(m) : ''; };   // dd/mm/aaaa
  const site = String(window.VC_ENDERECO || '');
  const siteCurto = site.replace(/^https:\/\//, '').replace(/\/$/, '');

  // ----- Cabeçalho -----
  dash.draw('mb-data', (el) => { const d = edicao(); el.textContent = d && !isNaN(d) ? dataLonga(d) : INDISPONIVEL; });
  dash.draw('mb-atualizado', (el) => { const a = atualizado(); el.textContent = a ? dataHora(a) : INDISPONIVEL; });

  // ----- Resumo de mercado -----
  // Todos os indicadores da aba Resumo do site (VC.resumoItens), agrupados por tema. Cada linha junta a variação
  // no dia e a de janela mais longa do mesmo indicador, que no site ficam em duas tabelas.
  const itens = () => (VC.resumoItens ? VC.resumoItens() : []);
  const TEMAS = [
    ['Juros e renda fixa · Brasil', [['di1'], ['di2'], ['di5', 'di5_3m'], ['real5'], ['real10', 'real10_3m'], ['implicita10'], ['selic']]],
    ['Juros · Estados Unidos', [['fed'], ['t2'], ['t10', 't10_3m']]],
    ['Bolsa · Brasil', [['ibov', 'ibov_ano']]],
    ['Mercado imobiliário', [['ifix', 'ifix_ano']]],
    ['Câmbio', [['dolar'], ['ptax', 'dolar_ano']]],
    ['Inflação e expectativas', [['ipca12'], ['focus_IPCA_0'], ['focus_Selic_0'], ['focus_IPCA_1'], ['focus_Selic_1']]],
  ];
  // Natureza de cada dado e o bloco da atualização de onde ele vem (para marcar o que não foi renovado).
  const NATUREZA = [
    [/^di\d/, 'cotação B3', 'curva_di'], [/^real/, 'taxa da manhã', 'ntnb'], [/^implicita/, 'calculado', 'ntnb'],
    [/^selic/, 'vigente', 'inflacao_br'], [/^ipca/, 'mensal', 'inflacao_br'], [/^focus/, 'semanal', 'focus'],
    [/^fed/, 'fechamento', 'fed_funds'], [/^t\d/, 'fechamento', 'treasuries'], [/^ibov/, 'cotação B3', 'ibovespa'], [/^ifix/, 'cotação B3', 'ifix'],
    [/^ptax|^dolar_ano/, 'fechamento', 'historico_br'], [/^dolar/, 'cotação B3', 'dolar_futuro'],
  ];
  const naturezaDe = (item) => {
    if (/PTAX/.test(item.rotulo)) return ['fechamento', 'historico_br'];
    const n = NATUREZA.find(([padrao]) => padrao.test(item.id));
    return n ? [n[1], n[2]] : ['', ''];
  };
  const linhasDoResumo = () => {
    const todos = itens(), porId = new Map(todos.map((i) => [i.id, i])), usados = new Set();
    const temas = TEMAS.map(([nome, grupos]) => [nome, grupos.map((ids) => ids.map((id) => porId.get(id)).filter(Boolean)).filter((g) => g.length)]);
    // Sem dólar futuro, o item "dolar" do site já é a PTAX e a variação no ano dela fica na mesma linha.
    if (!porId.has('ptax') && porId.has('dolar') && porId.has('dolar_ano')) temas[4][1] = [[porId.get('dolar'), porId.get('dolar_ano')]];
    temas.forEach(([, grupos]) => grupos.forEach((g) => g.forEach((i) => usados.add(i.id))));
    // Indicador novo no site que ainda não tem tema aqui entra em "Outros indicadores": nada do Resumo fica de fora.
    const sobras = todos.filter((i) => !usados.has(i.id)).map((i) => [i]);
    if (sobras.length) temas.push(['Outros indicadores', sobras]);
    return temas.filter(([, grupos]) => grupos.length);
  };
  // Base de comparação em forma compacta, para caber numa coluna estreita: "fechamento de 20/11/2026" vira "fech. de 20/11/26".
  const curto = (texto) => String(texto || '').replace(/fechamento/g, 'fech.').replace(/\/20(\d\d)\b/g, '/$1');
  dash.draw('mb-resumo', (sec) => {
    const temas = linhasDoResumo(), st = status(), hoje = diaDaEdicao();
    if (!temas.length) { sec.replaceChildren(titulo('Resumo de mercado'), no('p', 'mb-nota', INDISPONIVEL)); return; }
    let algumAntigo = false;
    const t = no('table', 'mb-tab mb-tab-resumo');
    t.append(no('thead', '', no('tr', '', [['Indicador'], ['Valor', 'mb-num'], ['No dia', 'mb-num'], ['Comparado com'], ['Janela longa', 'mb-num'], ['Comparado com'], ['Data do dado'], ['Natureza']]
      .map(([texto, c]) => no('th', c || '', texto)))));
    temas.forEach(([nome, grupos]) => {
      const corpo = no('tbody');
      const faixa = no('th', '', nome);
      faixa.colSpan = 8;
      corpo.append(no('tr', 'mb-tema', faixa));
      grupos.forEach((grupo) => {
        const dia = grupo.find((i) => i.janela !== 'longa'), longa = grupo.find((i) => i.janela === 'longa'), base = dia || longa;
        const [natureza, bloco] = naturezaDe(base), antigo = !!(st[bloco] && !st[bloco].ok);
        if (antigo) algumAntigo = true;
        // Cotação da B3 com data de hoje é intradiária; com data anterior, é a do último pregão.
        const tipo = natureza === 'cotação B3' ? (String(base.ref).slice(0, 10) === hoje ? 'intradiário' : 'último pregão') : natureza;
        const variacao = (i) => (i && i.mudanca && i.mudanca !== INDISPONIVEL ? [no('td', 'mb-num mb-var ' + sinalDe(i.mudanca), i.mudanca), no('td', 'mb-base', curto(i.comparado))]
          : [no('td', 'mb-num mb-vazio', i && i.mudanca === INDISPONIVEL ? 'n/d' : '–'), no('td', 'mb-base', '')]);
        const indicador = no('td', 'mb-ind', [base.rotulo, antigo ? no('sup', '', '†') : '', dia && !dia.mudanca && dia.sub ? no('span', 'mb-sub', dia.sub) : '']);
        corpo.append(no('tr', '', [indicador, no('td', 'mb-num mb-valor', base.valor), ...variacao(dia), ...variacao(longa),
          no('td', 'mb-ref', base.ref || INDISPONIVEL), no('td', 'mb-base', tipo)]));
      });
      t.append(corpo);
    });
    const notas = no('p', 'mb-nota', 'Juros em % ao ano, com variação em pontos-base (bps); índices em pontos e câmbio em R$ por US$, com variação em %; expectativas com variação em pontos percentuais (p.p.). '
      + 'O traço indica que a comparação não se aplica ao indicador; n/d, que o dado não está disponível. Natureza: intradiário é a cotação da B3 no horário indicado, com 15 minutos de atraso; '
      + 'fechamento é o último valor oficial publicado; taxa da manhã é a do Tesouro Direto; calculado é uma conta da plataforma (DI contra NTN-B).' + (algumAntigo ? ' † A fonte não respondeu na última atualização: o dado é o anterior, com a data indicada.' : ''));

    // Agenda: as próximas decisões e divulgações, como na aba Resumo.
    const eventos = VC.agendaItens ? VC.agendaItens() : [];
    // O nome do bloco vai dentro do cabeçalho da tabela: assim ele acompanha a primeira linha e se repete se a tabela mudar de página.
    const agenda = eventos.length
      ? tabela('mb-tab-agenda', [['Data'], ['Evento'], ['Faltam', 'mb-num'], ['Fonte da data']], eventos, (r) => [[data(r.data), 'mb-forte'], [r.evento], [r.faltam, 'mb-num'], [r.fonte, 'mb-base']])
      : junto(no('h3', 'mb-h3', 'Agenda'), no('p', 'mb-nota', INDISPONIVEL));
    if (eventos.length) { const faixa = no('th', '', 'Agenda'); faixa.colSpan = 4; agenda.tHead.prepend(no('tr', 'mb-tema', faixa)); }
    const notaAgenda = no('p', 'mb-nota', 'As datas podem ser alteradas por quem as publica. Data de divulgação do IPCA: indisponível, porque o calendário do IBGE não responde à plataforma.');
    sec.replaceChildren(titulo('Resumo de mercado'), t, notas, agenda, notaAgenda);
  });

  // ----- Linha de abertura: a mesma frase do Resumo do site -----
  const abertura = () => {
    const porId = new Map(itens().map((i) => [i.id, i])), v = (id, campo) => (porId.get(id) && porId.get(id)[campo]) || INDISPONIVEL;
    const d = porId.get('dolar'), nomeDolar = d ? (d.rotulo.charAt(0).toLowerCase() + d.rotulo.slice(1)).replace(', ', ' de ') : 'dólar';
    return `O DI de 5 anos varia ${v('di5', 'mudanca')} frente ao ajuste anterior, o Ibovespa ${v('ibov', 'mudanca')} no dia e o IFIX ${v('ifix', 'mudanca')}. O ${nomeDolar} está em ${v('dolar', 'valor')}.`;
  };
  dash.draw('mb-lead', (el) => { el.textContent = itens().length ? abertura() : INDISPONIVEL; });

  // ----- Notícias e inteligência de mercado -----
  // Todas as matérias da seleção do dia, por categoria. A categoria e o resumo editorial vêm prontos nos dados
  // (resumir_noticias.py); sem eles, a matéria entra pela seção de origem, com título, veículo, data e link.
  const CATEGORIAS = ['Macroeconomia e política monetária', 'Mercado financeiro e de capitais', 'Real estate e mercado imobiliário', 'Crédito e renda fixa',
    'Empresas e negócios', 'Cenário internacional', 'Política e sociedade', 'Brasil'];
  const PELA_SECAO = { brasil: 'Brasil', mundo: 'Cenário internacional', imobiliario: 'Real estate e mercado imobiliário' };
  const ORDEM_SECAO = { brasil: 0, imobiliario: 1, mundo: 2 };
  const https = (u) => /^https:\/\//.test(String(u));
  const ligacao = (texto, href) => { const a = no('a', '', texto); if (https(href)) a.href = href; return a; };
  dash.draw('mb-noticias', (sec) => {
    const todas = linhas('noticias'), m = montagem();
    if (!todas.length) { sec.replaceChildren(junto(titulo('Notícias e inteligência de mercado'), no('p', 'mb-nota', INDISPONIVEL + ': a seleção de notícias não foi montada.'))); return; }
    const comResumo = todas.filter((n) => n.resumo).length;
    const categoriaDe = (n) => (CATEGORIAS.includes(n.categoria) ? n.categoria : PELA_SECAO[n.secao] || 'Brasil');
    const grupos = CATEGORIAS.map((c) => [c, todas.filter((n) => categoriaDe(n) === c).sort((a, b) => ((ORDEM_SECAO[a.secao] || 0) - (ORDEM_SECAO[b.secao] || 0)) || (a.ordem - b.ordem))]).filter(([, l]) => l.length);
    const materia = (n) => {
      const meta = no('p', 'mb-noticia-meta', [n.fonte, ' · ', diaHora(n.data)]);
      const outras = (n.outras || []).filter((o) => https(o.link));
      if (outras.length) meta.append(' · também em ', ...outras.flatMap((o, i) => (i ? [', ', ligacao(o.fonte, o.link)] : [ligacao(o.fonte, o.link)])));
      return no('article', 'mb-noticia', [no('div', 'mb-noticia-topo', [no('h4', '', ligacao(n.titulo, n.link)), meta]),
        n.resumo ? no('p', 'mb-noticia-resumo', n.resumo) : (comResumo ? no('p', 'mb-noticia-resumo mb-sem', 'Resumo indisponível: o veículo divulgou só o título desta matéria.') : '')]);
    };
    const blocos = [];
    grupos.forEach(([categoria, lista], g) => {
      // Duas colunas; cada par de matérias é uma linha que não se parte entre páginas.
      const pares = [];
      // A matéria que sobra sem par ocupa a linha inteira: título à esquerda, resumo à direita.
      for (let i = 0; i < lista.length; i += 2) pares.push(no('div', 'mb-par' + (i + 1 < lista.length ? '' : ' mb-par-um'), lista.slice(i, i + 2).map(materia)));
      const cabeca = [g === 0 ? titulo('Notícias e inteligência de mercado') : null,
        g === 0 ? no('p', 'mb-nota', `Seleção automática montada em ${m ? dataHora(m) : INDISPONIVEL}: ${todas.length} matérias dos feeds públicos de veículos brasileiros e estrangeiros, em ordem de destaque dentro de cada categoria. `
          + (comResumo ? 'Os resumos são redigidos por inteligência artificial a partir do texto que cada veículo distribui no próprio feed; título, veículo e link são os originais.' : 'Resumos editoriais indisponíveis nesta edição; cada título leva à matéria original.')) : null,
        no('h3', 'mb-h3', categoria), pares[0]];
      blocos.push(junto(...cabeca), ...pares.slice(1));
    });
    sec.replaceChildren(...blocos);
  });

  // ----- Maiores altas e baixas: ações do Ibovespa e fundos do IFIX -----
  const TOPO = 10;
  const UNIVERSOS = {
    acoes: { titulo: 'Mercado acionário', calc: 'papeis_ordenados', ref: 'br_papeis_ref', total: 'papeis', nome: 'Companhia', oQue: 'ações da carteira do Ibovespa', lados: ['Maiores altas da bolsa', 'Maiores baixas da bolsa'] },
    fiis: { titulo: 'Fundos imobiliários', calc: 'fiis_ordenados', ref: 'br_fiis_ref', total: 'fundos', nome: 'Fundo', oQue: 'fundos da carteira do IFIX', lados: ['Maiores altas de FIIs', 'Maiores baixas de FIIs'] },
  };
  dash.draw('mb-ranking', (sec) => {
    const u = UNIVERSOS[sec.dataset.universo], todos = linhas(u.calc), ref = linhas(u.ref)[0];
    const cabeca = titulo(u.titulo + ': maiores altas e baixas');
    if (!todos.length) { sec.replaceChildren(junto(cabeca, no('p', 'mb-nota', INDISPONIVEL + ': a B3 não entregou as cotações.'))); return; }
    const fundos = sec.dataset.universo === 'fiis';
    const tipos = fundos ? new Map(linhas('br_fiis_cvm').map((c) => [c.ticker, c.tipo])) : null;
    // A lista já vem ordenada da maior alta para a maior baixa (cálculo do site).
    const altas = todos.filter((p) => p.var_dia > 0).slice(0, TOPO), baixas = todos.filter((p) => p.var_dia < 0).slice(-TOPO).reverse();
    const quadro = (nome, lista, vazio) => no('div', 'mb-quadro', [no('h3', 'mb-h3', nome), lista.length
      ? tabela('mb-tab-ranking', [['#', 'mb-num'], ['Ticker'], [u.nome], ...(fundos ? [['Segmento']] : []), ['Última cotação', 'mb-num'], ['Variação', 'mb-num']], lista.map((r, i) => ({ ...r, posicao: i + 1 })),
        (r) => [[String(r.posicao), 'mb-num mb-base'], [r.ticker, 'mb-forte'], [r.nome, 'mb-nome'], ...(fundos ? [[tipos.has(r.ticker) ? VC.tipoDeFundo(tipos.get(r.ticker)) : 'n/d', 'mb-base']] : []),
          [reais(r.preco), 'mb-num'], [varPct(r.var_dia), 'mb-num mb-var ' + sinalDe(varPct(r.var_dia))]])
      : no('p', 'mb-nota', vazio)]);
    const nota = no('p', 'mb-nota', `Variação no dia, contra o fechamento anterior, entre ${u.oQue}. Cotações da B3 de ${ref ? dataHora(ref.cotado_em) : INDISPONIVEL}, com 15 minutos de atraso`
      + (ref ? `; ${ref[u.total]} de ${ref.carteira} com cotação` : '') + '. Volume financeiro: indisponível na plataforma.'
      + (fundos ? ' Segmento: classificação da plataforma pelo balanço que o fundo entrega à CVM (n/d quando o informe não foi localizado); a variação da cota não inclui o rendimento distribuído.' : ''));
    sec.replaceChildren(junto(cabeca, no('div', 'mb-duas', [quadro(u.lados[0], altas, 'Nenhuma alta entre os ativos com cotação.'), quadro(u.lados[1], baixas, 'Nenhuma baixa entre os ativos com cotação.')]), nota));
  });

  // ----- Notas e fontes -----
  const BLOCOS = {
    curva_di: 'curva DI (B3)', ntnb: 'NTN-B (Tesouro Direto)', fed_funds: 'Fed funds (NY Fed)', treasuries: 'Treasuries (Tesouro americano)', inflacao_br: 'inflação brasileira (Banco Central)',
    ibovespa: 'Ibovespa (B3)', papeis_br: 'ações do Ibovespa (B3)', historico_br: 'dólar PTAX (Banco Central)', ifix: 'IFIX (B3)', fiis: 'fundos do IFIX (B3)', dolar_futuro: 'dólar futuro (B3)',
    fiis_cvm: 'informes dos FIIs (CVM)', focus: 'Focus (Banco Central)', agenda: 'agenda de divulgações (FRED)', fomc: 'calendário do Fed', noticias: 'notícias',
  };
  dash.draw('mb-notas', (sec) => {
    const st = status(), nomes = Object.keys(BLOCOS).filter((n) => st[n]), falhas = nomes.filter((n) => !st[n].ok);
    const fontes = !nomes.length ? INDISPONIVEL : falhas.length
      ? `Fontes que não responderam na última atualização: ${falhas.map((n) => `${BLOCOS[n]}, com dado de ${dataHora(st[n].em)}`).join('; ')}. Nesses casos o relatório traz o dado anterior, marcado com †. As outras ${nomes.length - falhas.length} fontes responderam.`
      : `As ${nomes.length} fontes usadas neste relatório responderam na última atualização.`;
    const link = no('a', '', siteCurto || INDISPONIVEL);
    if (site) link.href = site;
    sec.replaceChildren(junto(titulo('Notas e fontes'),
      no('p', 'mb-nota', fontes),
      no('p', 'mb-nota', 'Fontes: B3 (DI futuro, Ibovespa, IFIX, dólar futuro, ações e fundos), Tesouro Direto (NTN-B), Banco Central (Selic, IPCA, PTAX, Focus), NY Fed e Tesouro americano (Fed funds e Treasuries), CVM (informes dos fundos) e FRED (agenda). '
        + 'Cada indicador traz a data do próprio dado: cotações da B3 são intradiárias, com 15 minutos de atraso; os demais são fechamentos ou dados periódicos.'),
      no('p', 'mb-nota', 'A plataforma não acompanha índices acionários internacionais nem commodities, e por isso eles não aparecem no resumo de mercado.'),
      no('p', 'mb-nota', ['Relatório informativo, montado automaticamente pela Vera Cruz Data a partir de fontes públicas; não é recomendação de investimento. Curvas, séries históricas, metodologia e fórmulas de cada conta estão em ', link, '.'])));
  });

  // ----- Conferência para a rotina que imprime -----
  if (!itens().length) document.body.append(no('p', 'mb-incompleto', 'RELATORIO-INCOMPLETO: o resumo de mercado não pôde ser montado'));

  // Cabeçalho e rodapé das páginas: a data entra aqui porque muda a cada edição (o desenho está em relatorio.css).
  const d = edicao(), a = atualizado(), aspas = (t) => '"' + String(t).replace(/["\\]/g, '') + '"';
  if (d && !isNaN(d)) {
    const estilo = document.createElement('style');
    estilo.textContent = `@page { @top-right { content: ${aspas(dataLonga(d))}; } @bottom-left { content: ${aspas('Vera Cruz Data · ' + siteCurto + ' · dados de ' + (a ? dataHora(a) : diaDaEdicao()))}; } }`
      + ' @page :first { @top-right { content: none; } }';
    document.head.append(estilo);
    document.title = 'Daily Market Briefing · Vera Cruz · ' + diaDaEdicao();
  }

  window.iniciarCurvaDI();

  // Resumo da edição para o email do dia: a frase de abertura, os destaques e a primeira matéria de cada seção.
  // A rotina lê este bloco do documento e o grava na ficha (relatorio.json); o email não refaz conta nenhuma.
  const resumo = {
    resumo: itens().length ? abertura() : '',
    destaques: itens().filter((i) => i.tile).map((i) => ({ rotulo: i.rotulo, valor: i.valor, nota: i.mudanca && !i.semMudancaNoTile ? i.mudanca + ' ' + (i.sub || '') : i.sub || '', ref: 'dado de ' + i.ref })),
    manchetes: [['brasil', 'Brasil'], ['mundo', 'Mundo'], ['imobiliario', 'Mercado imobiliário']].map(([secao, nome]) => {
      const n = linhas('noticias').filter((x) => x.secao === secao).sort((x, y) => x.ordem - y.ordem)[0];
      return n && https(n.link) ? { secao: nome, titulo: n.titulo, fonte: n.fonte, link: n.link } : null;
    }).filter(Boolean),
  };
  const bloco = document.createElement('script');
  bloco.type = 'application/json';
  bloco.id = 'rl-resumo-email';
  bloco.textContent = JSON.stringify(resumo).replace(/</g, '\\u003c');
  document.body.append(bloco);
})();
