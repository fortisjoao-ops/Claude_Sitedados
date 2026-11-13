// ---------- Botões "Baixar em CSV" ----------
// O arquivo é montado no navegador com os mesmos dados e cálculos que a página mostra.
// Formato para abrir direto no Excel em português: ponto e vírgula entre as colunas, vírgula decimal e UTF-8 com marca de ordem.
(() => {
  const { linhas, data, dataHora } = VC;
  const dec = (v) => (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v)) ? '' : String(v).replace('.', ','));
  const dia = (iso) => (iso ? data(iso) : '');
  const celula = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  const ARQUIVOS = {
    // Curva DI interpolada: uma linha por dia útil, com as três curvas do gráfico.
    'curva-di': () => {
      const cot = linhas('di1')[0], tresMeses = linhas('di1_3m')[0];
      const dataDoPrazo = new Map(linhas('cdi_por_data').map((l) => [l.du, l.data]));   // fica a última data de cada prazo, que é o dia útil
      return {
        nome: 'curva-di-' + (cot ? String(cot.cotacao_em).slice(0, 10) : 'sem-data') + '.csv',
        cabecalho: ['Dias úteis', 'Data', `Taxa agora, cotação de ${cot ? dataHora(cot.cotacao_em) : ''} (% a.a.)`, 'Ajuste anterior (% a.a.)',
          `Ajuste de ${dia(tresMeses && tresMeses.data_ref)}, mesmo prazo em dias úteis (% a.a.)`],
        registros: linhas('curva').map((l) => [l.du, dia(dataDoPrazo.get(l.du)), dec(l.taxa), dec(l.taxa_ant), dec(l.taxa_3m)]),
      };
    },
    // Todos os vencimentos de DI cotados, inclusive os que passam de 5 anos.
    'vencimentos-di': () => {
      const cot = linhas('di1')[0], detalhe = new Map(linhas('di1').map((v) => [v.ticker, v]));
      const todos = linhas('di1_longo').length ? linhas('di1_longo') : linhas('di1');
      return {
        nome: 'vencimentos-di-' + (cot ? String(cot.cotacao_em).slice(0, 10) : 'sem-data') + '.csv',
        cabecalho: ['Contrato', 'Vencimento', 'Dias úteis', 'Taxa (% a.a.)', 'Último negócio (% a.a.)', 'Melhor compra (% a.a.)', 'Melhor venda (% a.a.)', 'Ajuste anterior (% a.a.)', 'Contratos negociados'],
        registros: todos.map((v) => {
          const d = detalhe.get(v.ticker) || {};
          return [v.ticker, dia(v.vencimento), v.du, dec(v.taxa), dec(d.ultimo), dec(d.compra), dec(d.venda), dec(v.ajuste_ant), d.negociados === undefined ? '' : d.negociados];
        }),
      };
    },
    // NTN-B: juro real e inflação implícita por vencimento, hoje e três meses atrás.
    'juro-real': () => {
      const d = VC.juroRealDatas ? VC.juroRealDatas() : {};
      return {
        nome: 'ntnb-juro-real-' + (d.td_ref || 'sem-data') + '.csv',
        cabecalho: ['Título', 'Vencimento', `Juro real em ${dia(d.td_ref)} (% a.a.)`, `Juro real em ${dia(d.td_3m)} (% a.a.)`,
          `DI no mesmo vencimento, ajuste de ${dia(d.di_ref)} (% a.a.)`, 'Inflação implícita (% a.a.)',
          `DI no mesmo vencimento, ajuste de ${dia(d.di_3m)} (% a.a.)`, 'Inflação implícita há 3 meses (% a.a.)'],
        registros: linhas('br_real').map((r) => [r.titulo, dia(r.vencimento), dec(r.real), dec(r.real_3m), dec(r.di), dec(r.implicita), dec(r.di_3m), dec(r.implicita_3m)]),
      };
    },
    // Treasuries: rendimento por prazo na data de referência, no dia anterior e três meses antes.
    'treasuries': () => {
      const curva = linhas('eua_curva'), p = curva[0] || {};
      return {
        nome: 'treasuries-' + (p.data || 'sem-data') + '.csv',
        cabecalho: ['Prazo', 'Prazo em anos', `Taxa em ${dia(p.data)} (% a.a.)`, `Taxa em ${dia(p.data_ant)} (% a.a.)`, `Taxa em ${dia(p.data_3m)} (% a.a.)`],
        registros: curva.map((r) => [r.prazo, dec(r.anos), dec(r.taxa), dec(r.taxa_ant), dec(r.taxa_3m)]),
      };
    },
  };

  const montar = (botao) => { const f = ARQUIVOS[botao.dataset.csv]; return f ? f() : null; };

  // Sem dados, o botão fica desligado em vez de baixar um arquivo vazio.
  dash.draw('csv', (botao) => { const a = montar(botao); botao.disabled = !a || !a.registros.length; });

  document.addEventListener('click', (evento) => {
    const botao = evento.target.closest && evento.target.closest('button[data-csv]');
    if (!botao || botao.disabled) return;
    const a = montar(botao);
    if (!a || !a.registros.length) return;
    const texto = '﻿' + [a.cabecalho, ...a.registros].map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = a.nome;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
})();
