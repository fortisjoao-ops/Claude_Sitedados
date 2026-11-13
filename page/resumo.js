// ---------- Aba Resumo ----------
(() => {
  const { num, nf, ok, fmt, pct, sinal, bps, varPct, reais, data, dataHora, diaHora, mes, linhas, valor, tabela, INDISPONIVEL } = VC;
  const bps1 = (v) => bps(v, 1);
  const pp = (v) => sinal(v, 2, ' p.p.');
  const d = (iso) => (iso ? data(iso) : INDISPONIVEL);

  // Cada item junta o número, a mudança, com o que ele é comparado e a data do dado. As contas vêm dos cálculos das outras abas.
  const itens = () => {
    const lista = [];
    const por = (item) => lista.push(item);

    const cot = linhas('di1')[0], tresMeses = linhas('di1_3m')[0];
    const quandoDI = cot ? dataHora(cot.cotacao_em) : INDISPONIVEL;
    [['di1', '1a', 'DI de 1 ano', true], ['di2', '2a', 'DI de 2 anos', false], ['di5', '5a', 'DI de 5 anos', true]].forEach(([id, prazo, rotulo, tile]) => {
      const p = linhas('prazos').find((r) => r.prazo === prazo);
      por({ id, rotulo, aba: 'juros-br', janela: 'dia', tile, valor: p ? pct(p.taxa) : INDISPONIVEL, mudanca: p ? bps1(p.var_bps) : INDISPONIVEL, comparado: 'ajuste anterior', ref: quandoDI, sub: 'contra o ajuste anterior' });
      if (id === 'di5') por({ id: 'di5_3m', rotulo, aba: 'juros-br', janela: 'longa', valor: p ? pct(p.taxa) : INDISPONIVEL, mudanca: p ? bps1(p.var_3m_bps) : INDISPONIVEL, comparado: 'ajuste de ' + d(tresMeses && tresMeses.data_ref), ref: quandoDI });
    });

    const datasReal = VC.juroRealDatas ? VC.juroRealDatas() : {};
    [['real5', 5, false], ['real10', 10, true]].forEach(([id, anos, tile]) => {
      const r = VC.juroReal ? VC.juroReal(String(anos)) : null;
      const rotulo = r ? `Juro real, ${r.titulo} ${r.vencimento.slice(0, 4)}` : `Juro real de ${anos} anos`;
      por({ id, rotulo, aba: 'juro-real-br', janela: 'dia', tile, valor: r ? pct(r.real) : INDISPONIVEL, mudanca: r ? bps(r.var_dia_bps) : INDISPONIVEL, comparado: 'taxa de ' + d(datasReal.td_ant), ref: d(datasReal.td_ref), sub: 'no dia' });
      if (anos === 10) {
        por({ id: 'real10_3m', rotulo, aba: 'juro-real-br', janela: 'longa', valor: r ? pct(r.real) : INDISPONIVEL, mudanca: r ? bps(r.var_3m_bps) : INDISPONIVEL, comparado: 'taxa de ' + d(datasReal.td_3m), ref: d(datasReal.td_ref) });
        por({ id: 'implicita10', rotulo: r ? `Inflação implícita até ${r.vencimento.slice(0, 4)}` : 'Inflação implícita de 10 anos', aba: 'juro-real-br', janela: 'longa', valor: r ? pct(r.implicita) : INDISPONIVEL,
          mudanca: r ? bps(r.var_implicita_3m_bps) : INDISPONIVEL, comparado: 'conta de ' + d(datasReal.td_3m), ref: d(datasReal.td_ref) });
      }
    });

    const selic = linhas('br_parametros').find((p) => p.chave === 'selic');
    const focusSelic = VC.focus ? VC.focus('Selic', 0) : null, focusIpca = VC.focus ? VC.focus('IPCA', 0) : null;
    por({ id: 'selic', rotulo: 'Selic, meta', aba: 'inflacao-br', tile: true, valor: selic ? pct(num(selic.valor)) : INDISPONIVEL, mudanca: null,
      sub: focusSelic ? `Focus para o fim de ${focusSelic.ano}: ${pct(focusSelic.mediana)}` : 'Focus: ' + INDISPONIVEL, ref: selic ? d(selic.ref) : INDISPONIVEL });

    const meses = linhas('inflacao_meses').filter((m) => m.ipca_12m !== null && m.ipca_12m !== undefined);
    const ipca = meses[meses.length - 1], ipcaAnt = meses[meses.length - 2];
    por({ id: 'ipca12', rotulo: 'IPCA em 12 meses', aba: 'inflacao-br', janela: 'longa', tile: true, valor: ipca ? pct(ipca.ipca_12m) : INDISPONIVEL,
      mudanca: ipca && ipcaAnt ? pp(+(ipca.ipca_12m - ipcaAnt.ipca_12m).toFixed(2)) : INDISPONIVEL, comparado: ipcaAnt ? mes(ipcaAnt.mes) : INDISPONIVEL, ref: ipca ? mes(ipca.mes) : INDISPONIVEL,
      sub: focusIpca ? `Focus para ${focusIpca.ano}: ${pct(focusIpca.mediana)}` : 'Focus: ' + INDISPONIVEL, semMudancaNoTile: true });

    [0, 1].forEach((i) => ['IPCA', 'Selic'].forEach((ind) => {
      const f = VC.focus ? VC.focus(ind, i) : null;
      if (!f) return;
      por({ id: `focus_${ind}_${i}`, rotulo: `Focus, ${ind === 'IPCA' ? 'IPCA de' : 'Selic no fim de'} ${f.ano}`, aba: 'focus', janela: 'longa', valor: pct(f.mediana), mudanca: pp(f.mudanca), comparado: 'coleta de ' + d(f.data_4s), ref: d(f.data) });
    }));

    const fed = linhas('eua_fed')[0];
    por({ id: 'fed', rotulo: 'Fed funds, faixa-alvo', aba: 'juros-eua', tile: true, menor: true, valor: fed ? `${fmt(num(fed.alvo_min))}% a ${fmt(num(fed.alvo_max))}%` : INDISPONIVEL, mudanca: null,
      sub: fed ? `taxa efetiva de ${pct(num(fed.effr))}` : '', ref: fed ? d(fed.data) : INDISPONIVEL });

    [['t2', '2 Yr', 'Treasury de 2 anos', false], ['t10', '10 Yr', 'Treasury de 10 anos', true]].forEach(([id, prazo, rotulo, tile]) => {
      const t = linhas('eua_curva').find((r) => r.prazo === prazo);
      por({ id, rotulo, aba: 'juros-eua', janela: 'dia', tile, valor: t ? pct(t.taxa) : INDISPONIVEL, mudanca: t ? bps(t.var_dia_bps) : INDISPONIVEL, comparado: 'fechamento de ' + d(t && t.data_ant), ref: d(t && t.data), sub: 'no dia' });
      if (id === 't10') por({ id: 't10_3m', rotulo, aba: 'juros-eua', janela: 'longa', valor: t ? pct(t.taxa) : INDISPONIVEL, mudanca: t ? bps(t.var_3m_bps) : INDISPONIVEL, comparado: 'fechamento de ' + d(t && t.data_3m), ref: d(t && t.data) });
    });

    [['ibov', 'br_ibov', 'ibov_variacoes', 'Ibovespa', 'acoes-br', 0], ['ifix', 'br_ifix', 'ifix_variacoes', 'IFIX', 'fiis', 2]].forEach(([id, fonte, calc, rotulo, aba, casas]) => {
      const c = linhas(fonte)[0], v = (campo) => linhas(calc).find((x) => x.campo === campo);
      const nivel = c ? nf(casas).format(num(c.nivel)) : INDISPONIVEL, quando = c ? dataHora(c.cotado_em) : INDISPONIVEL;
      por({ id, rotulo, aba, janela: 'dia', tile: true, valor: nivel, mudanca: v('dia') ? varPct(v('dia').variacao) : INDISPONIVEL, comparado: 'fechamento anterior', ref: quando, sub: 'no dia' });
      por({ id: id + '_ano', rotulo, aba, janela: 'longa', valor: nivel, mudanca: v('ano') ? varPct(v('ano').variacao) : INDISPONIVEL, comparado: 'fechamento de ' + d(v('ano') && v('ano').base_data), ref: quando });
    });

    const ptax = linhas('br_dolar'), dolar = ptax[ptax.length - 1], vd = (campo) => linhas('dolar_variacoes').find((x) => x.campo === campo);
    por({ id: 'dolar', rotulo: 'Dólar PTAX, venda', aba: 'acoes-br', janela: 'dia', tile: true, menor: true, valor: dolar ? reais(num(dolar.valor), 4) : INDISPONIVEL, mudanca: vd('dia') ? varPct(vd('dia').variacao) : INDISPONIVEL,
      comparado: 'PTAX de ' + d(vd('dia') && vd('dia').base_data), ref: dolar ? d(dolar.data) : INDISPONIVEL, sub: 'no dia' });
    por({ id: 'dolar_ano', rotulo: 'Dólar PTAX, venda', aba: 'acoes-br', janela: 'longa', valor: dolar ? reais(num(dolar.valor), 4) : INDISPONIVEL, mudanca: vd('ano') ? varPct(vd('ano').variacao) : INDISPONIVEL,
      comparado: 'PTAX de ' + d(vd('ano') && vd('ano').base_data), ref: dolar ? d(dolar.data) : INDISPONIVEL });
    return lista;
  };

  dash.draw('rs-valor', (el) => { const i = itens().find((x) => x.id === el.dataset.item); el.textContent = i ? i[el.dataset.campo] || INDISPONIVEL : INDISPONIVEL; });

  dash.draw('rs-tiles', (el) => {
    const no = (tag, classe, texto) => { const n = document.createElement(tag); if (classe) n.className = classe; if (texto !== undefined) n.textContent = texto; return n; };
    el.replaceChildren(...itens().filter((i) => i.tile).map((i) => {
      const a = no('a', 'di-tile vc-tile-link');
      a.href = '#' + i.aba;
      const sub = no('div', 'di-tile-sub');
      if (i.mudanca && !i.semMudancaNoTile) sub.append(no('span', '', i.mudanca), ' ' + i.sub);
      else sub.append(i.sub || '');
      a.append(no('div', 'di-tile-label', i.rotulo), no('div', 'di-tile-num' + (i.menor ? ' vc-num-menor' : ''), i.valor), sub, no('div', 'di-tile-sub vc-tile-ref', 'dado de ' + i.ref));
      return a;
    }));
  });

  dash.draw('rs-tabela', (corpo) => tabela(corpo, itens().filter((i) => i.janela === corpo.dataset.janela), 'id', [
    [(r) => r.rotulo, ''], [(r) => r.valor, 'di-num di-strong'], [(r) => r.mudanca || INDISPONIVEL, 'di-num di-strong'], [(r) => r.comparado, ''], [(r) => r.ref, ''],
  ]));

  dash.draw('rs-manchetes', (lista) => {
    const SECOES = [['brasil', 'Brasil'], ['mundo', 'Mundo'], ['imobiliario', 'Mercado imobiliário']];
    const nos = SECOES.map(([secao, nome]) => {
      const n = linhas('noticias').filter((x) => x.secao === secao).sort((a, b) => a.ordem - b.ordem)[0];
      if (!n) return null;
      const li = document.createElement('li'), a = document.createElement('a'), meta = document.createElement('span');
      a.textContent = n.titulo;
      if (/^https:\/\//.test(n.link)) a.href = n.link;   // só endereços https vindos do feed
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      meta.className = 'vc-noticia-meta';
      meta.textContent = `${nome} · ${n.fonte} · ${diaHora(n.data)}`;
      li.append(a, meta);
      return li;
    }).filter(Boolean);
    if (!nos.length) { const li = document.createElement('li'); li.className = 'vc-vazio'; li.textContent = INDISPONIVEL; nos.push(li); }
    lista.replaceChildren(...nos);
  });

  // Agenda: decisões do Copom e do FOMC (já usadas nas outras abas) e divulgações dos EUA pelo calendário do FRED.
  dash.draw('rs-agenda', (corpo) => {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());   // AAAA-MM-DD em Brasília
    const EVENTOS = {
      payroll: ['Payroll: emprego nos Estados Unidos', 'FRED (divulgação do BLS)'],
      cpi: ['CPI: inflação ao consumidor nos Estados Unidos', 'FRED (divulgação do BLS)'],
      pce: ['PCE: renda e gastos pessoais nos Estados Unidos, com o núcleo do PCE', 'FRED (divulgação do BEA)'],
    };
    const itens = [];
    linhas('copom').map((r) => String(r.data)).filter((d) => d >= hoje).sort().slice(0, 2)
      .forEach((d) => itens.push({ chave: 'copom ' + d, data: d, evento: 'Copom: decisão da taxa Selic', fonte: 'Banco Central' }));
    linhas('eua_fomc').filter((r) => r.data >= hoje).sort((a, b) => (a.data < b.data ? -1 : 1)).slice(0, 2)
      .forEach((r) => itens.push({ chave: 'fomc ' + r.data, data: r.data, evento: 'FOMC: decisão dos Fed funds' + (r.sep ? ', com projeções e dot plot novos' : ''), fonte: 'Federal Reserve' }));
    linhas('agenda').filter((r) => r.data >= hoje && EVENTOS[r.evento])
      .forEach((r) => itens.push({ chave: r.chave, data: r.data, evento: EVENTOS[r.evento][0], fonte: EVENTOS[r.evento][1] }));
    itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    const faltam = (d) => { const n = Math.round((VC.ms(d) - VC.ms(hoje)) / 86400000); return n === 0 ? 'hoje' : n === 1 ? '1 dia' : n + ' dias'; };
    tabela(corpo, itens, 'chave', [[(r) => data(r.data), 'di-strong'], [(r) => r.evento, ''], [(r) => faltam(r.data), 'di-num'], [(r) => r.fonte, '']]);
  });

  const BLOCOS = {
    curva_di: 'curva DI (B3)', ntnb: 'NTN-B (Tesouro Direto)', fed_funds: 'Fed funds (NY Fed)', treasuries: 'Treasuries (Tesouro americano)', fomc: 'dot plot e calendário do Fed',
    futuros_fed: 'futuros de Fed funds (Yahoo Finance)', macro_eua: 'inflação e emprego dos EUA (BLS)', inflacao_br: 'inflação brasileira (Banco Central)', ibovespa: 'Ibovespa (B3)',
    papeis_br: 'ações do Ibovespa (B3)', historico_br: 'dólar e histórico do Ibovespa', ifix: 'IFIX (B3)', fiis: 'fundos do IFIX (B3)', historico_fii: 'CDI e histórico do IFIX',
    focus: 'Focus (Banco Central)', agenda: 'agenda de divulgações (FRED)', noticias: 'notícias',
  };
  dash.draw('rs-fontes', (el) => {
    const status = valor('status') || {}, nomes = Object.keys(BLOCOS).filter((n) => status[n]);
    if (!nomes.length) { el.textContent = INDISPONIVEL; return; }
    const falhas = nomes.filter((n) => !status[n].ok);
    el.classList.toggle('vc-alerta', falhas.length > 0);
    el.textContent = falhas.length
      ? `Falharam na última tentativa: ${falhas.map((n) => BLOCOS[n]).join('; ')}. Nesses blocos a página mostra o dado anterior, com aviso na aba correspondente. As outras ${nomes.length - falhas.length} fontes responderam.`
      : `As ${nomes.length} fontes responderam na última tentativa de atualização.`;
  });
})();
