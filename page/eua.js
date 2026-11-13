// ---------- Aba Juros EUA ----------
(() => {
  const { num, ok, pct, bps, sinal, fmt, data, dataHora, mes, ms, linhas, tabela, aviso, grafico, MESES, INDISPONIVEL } = VC;

  const PRAZOS = { '1 Mo': '1 mês', '1.5 Month': '6 semanas', '2 Mo': '2 meses', '3 Mo': '3 meses', '4 Mo': '4 meses', '6 Mo': '6 meses', '1 Yr': '1 ano', '2 Yr': '2 anos',
    '3 Yr': '3 anos', '5 Yr': '5 anos', '7 Yr': '7 anos', '10 Yr': '10 anos', '20 Yr': '20 anos', '30 Yr': '30 anos' };
  const CURTOS = { '1 Mo': '1m', '3 Mo': '3m', '6 Mo': '6m', '1 Yr': '1a', '2 Yr': '2a', '3 Yr': '3a', '5 Yr': '5a', '7 Yr': '7a', '10 Yr': '10a', '20 Yr': '20a', '30 Yr': '30a' };

  // ----- Cálculos -----
  dash.calc('eua_curva', {
    title: 'Curva dos Treasuries por prazo',
    description: 'Rendimento de cada prazo na data de referência, no dia anterior e três meses antes, com as variações em pontos-base.',
    inputs: ['eua_ust'],
    fn: (ust) => {
      const porPrazo = {};
      ust.forEach((r) => {
        const p = porPrazo[r.prazo] = porPrazo[r.prazo] || { prazo: r.prazo, anos: +r.anos };
        p[r.papel] = +r.taxa;
        p['data_' + r.papel] = r.data;
      });
      return Object.values(porPrazo).filter((p) => isFinite(p.ref)).sort((a, b) => a.anos - b.anos).map((p) => ({
        prazo: p.prazo, anos: p.anos, data: p.data_ref,
        taxa: p.ref,
        taxa_ant: p.ant === undefined ? null : p.ant, data_ant: p.data_ant || null,
        var_dia_bps: p.ant === undefined ? null : +((p.ref - p.ant) * 100).toFixed(1),
        taxa_3m: p['3m'] === undefined ? null : p['3m'], data_3m: p.data_3m || null,
        var_3m_bps: p['3m'] === undefined ? null : +((p.ref - p['3m']) * 100).toFixed(1),
      }));
    },
  });

  dash.calc('eua_resumo', {
    title: 'Treasuries de 2, 10 e 30 anos e spread',
    description: 'Taxas dos prazos de referência e a diferença entre 10 e 2 anos, em pontos-base.',
    inputs: ['eua_curva'],
    fn: (curva) => {
      const de = (prazo) => (curva || []).find((r) => r.prazo === prazo);
      const t2 = de('2 Yr'), t10 = de('10 Yr'), t30 = de('30 Yr');
      const linha = (item, r) => r && { item, valor: r.taxa, var_dia_bps: r.var_dia_bps, var_3m_bps: r.var_3m_bps };
      const spread = t2 && t10 ? {
        item: 'spread',
        valor: +((t10.taxa - t2.taxa) * 100).toFixed(1),
        var_dia_bps: t10.taxa_ant === null || t2.taxa_ant === null ? null : +(((t10.taxa - t2.taxa) - (t10.taxa_ant - t2.taxa_ant)) * 100).toFixed(1),
        var_3m_bps: t10.taxa_3m === null || t2.taxa_3m === null ? null : +(((t10.taxa - t2.taxa) - (t10.taxa_3m - t2.taxa_3m)) * 100).toFixed(1),
      } : null;
      return [linha('t2', t2), linha('t10', t10), linha('t30', t30), spread].filter(Boolean);
    },
  });

  dash.calc('eua_implicita', {
    title: 'Juro real e inflação implícita',
    description: 'Treasury nominal menos o TIPS de mesmo prazo, na data de referência e três meses antes.',
    inputs: ['eua_real', 'eua_ust'],
    fn: (real, nominal) => {
      const taxa = (base, papel, anos) => { const r = base.find((x) => x.papel === papel && +x.anos === anos); return r ? +r.taxa : null; };
      return [...new Set(real.filter((r) => r.papel === 'ref').map((r) => +r.anos))].sort((a, b) => a - b).map((anos) => {
        const n = taxa(nominal, 'ref', anos), r = taxa(real, 'ref', anos), n3 = taxa(nominal, '3m', anos), r3 = taxa(real, '3m', anos);
        return {
          anos, nominal: n, real: r,
          implicita: n === null || r === null ? null : +(n - r).toFixed(2),
          implicita_3m: n3 === null || r3 === null ? null : +(n3 - r3).toFixed(2),
        };
      });
    },
  });

  dash.calc('eua_mediana', {
    title: 'Mediana do dot plot por ano',
    description: 'Projeção do meio dos participantes do FOMC para cada ano, com a menor e a maior projeção.',
    inputs: ['eua_dots'],
    fn: (dots) => {
      const porAno = {};
      dots.forEach((d) => { for (let i = 0; i < +d.participantes; i++) (porAno[d.ano] = porAno[d.ano] || []).push(+d.taxa); });
      return Object.entries(porAno).map(([ano, taxas]) => {
        taxas.sort((a, b) => a - b);
        const n = taxas.length, meio = Math.floor(n / 2);
        return { ano, mediana: n % 2 ? taxas[meio] : +((taxas[meio - 1] + taxas[meio]) / 2).toFixed(4), menor: taxas[0], maior: taxas[n - 1], participantes: n };
      }).sort((a, b) => (a.ano > b.ano ? 1 : -1));
    },
  });

  dash.calc('eua_trajetoria', {
    title: 'Trajetória dos Fed funds embutida nos futuros',
    description: 'Taxa efetiva média esperada depois de cada reunião do FOMC, ajustada às médias mensais embutidas nos futuros de Fed funds de 30 dias.',
    inputs: ['eua_zq', 'eua_fomc'],
    fn: (contratos, reunioes) => {
      if (!contratos.length || !reunioes.length) return [];
      const dia = 86400000;
      const hoje = String(contratos[0].cotado_em).slice(0, 10);
      const ultimaDoCalendario = reunioes.map((r) => r.data).sort().pop();
      // Só entram contratos de meses cobertos pelo calendário divulgado do FOMC.
      const usados = contratos.filter((c) => c.mes <= ultimaDoCalendario.slice(0, 7) && isFinite(+c.preco));
      const ultimoMes = usados.map((c) => c.mes).sort().pop();
      const futuras = reunioes.map((r) => r.data).filter((d) => d >= hoje && d.slice(0, 7) <= ultimoMes).sort();
      if (usados.length < 3 || !futuras.length) return [];
      // A taxa nova vale a partir do dia seguinte à decisão.
      const vigencias = futuras.map((d) => Date.parse(d + 'T00:00:00Z') + dia);
      const n = futuras.length + 1;   // nível de hoje mais um nível depois de cada reunião

      // Cada contrato dá uma equação: média do mês = soma (dias em cada nível / dias do mês) x nível.
      const A = [], b = [];
      usados.forEach((c) => {
        const [ano, mes] = c.mes.split('-').map(Number);
        const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
        const linha = new Array(n).fill(0);
        for (let d = 1; d <= dias; d++) {
          const t = Date.UTC(ano, mes - 1, d);
          linha[vigencias.filter((v) => v <= t).length] += 1 / dias;
        }
        A.push(linha);
        b.push(100 - +c.preco);
      });
      // Mínimos quadrados com penalidade pequena para saltos entre níveis vizinhos (resolve meses sem contrato).
      const M = Array.from({ length: n }, () => new Array(n + 1).fill(0));
      A.forEach((linha, i) => { for (let j = 0; j < n; j++) { for (let k = 0; k < n; k++) M[j][k] += linha[j] * linha[k]; M[j][n] += linha[j] * b[i]; } });
      const penalidade = 0.02;
      for (let j = 0; j < n - 1; j++) { M[j][j] += penalidade; M[j + 1][j + 1] += penalidade; M[j][j + 1] -= penalidade; M[j + 1][j] -= penalidade; }
      for (let col = 0; col < n; col++) {   // eliminação de Gauss
        let piv = col;
        for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        if (Math.abs(M[piv][col]) < 1e-12) return [];
        [M[col], M[piv]] = [M[piv], M[col]];
        for (let r = 0; r < n; r++) {
          if (r === col) continue;
          const f = M[r][col] / M[col][col];
          for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
        }
      }
      const niveis = M.map((linha, j) => linha[n] / linha[j]);
      return futuras.map((reuniao, k) => ({
        reuniao,
        vigencia: new Date(vigencias[k]).toISOString().slice(0, 10),
        taxa_hoje: +niveis[0].toFixed(3),
        taxa_antes: +niveis[k].toFixed(3),
        taxa_depois: +niveis[k + 1].toFixed(3),
        mudanca_bps: +((niveis[k + 1] - niveis[k]) * 100).toFixed(1),
        acumulado_bps: +((niveis[k + 1] - niveis[0]) * 100).toFixed(1),
        contratos: usados.length,
      }));
    },
  });

  dash.calc('eua_macro_resumo', {
    title: 'Inflação e emprego dos EUA',
    description: 'Inflação ao consumidor em 12 meses, desemprego e criação de vagas, a partir das séries do BLS.',
    inputs: ['eua_macro'],
    fn: (macro) => {
      const serie = (nome) => macro.filter((r) => r.serie === nome).sort((a, b) => (a.periodo > b.periodo ? 1 : -1));
      const anoAntes = (periodo) => (+periodo.slice(0, 4) - 1) + periodo.slice(4);
      const em12 = (pontos, i) => {
        if (i < 0) return null;
        const base = pontos.find((p) => p.periodo === anoAntes(pontos[i].periodo));
        return base ? +((+pontos[i].valor / +base.valor - 1) * 100).toFixed(2) : null;
      };
      const saida = [];
      [['cpi', 'Inflação ao consumidor (CPI), 12 meses'], ['cpi_nucleo', 'Núcleo do CPI, 12 meses']].forEach(([nome, rotulo]) => {
        const p = serie(nome);
        if (p.length) saida.push({ indicador: rotulo, ref: p[p.length - 1].periodo, valor: em12(p, p.length - 1), anterior: em12(p, p.length - 2), unidade: '%' });
      });
      const des = serie('desemprego');
      if (des.length) saida.push({ indicador: 'Taxa de desemprego', ref: des[des.length - 1].periodo, valor: +des[des.length - 1].valor, anterior: des.length > 1 ? +des[des.length - 2].valor : null, unidade: '%' });
      const pay = serie('payroll');
      if (pay.length > 2) saida.push({ indicador: 'Vagas criadas no mês (payroll), em mil', ref: pay[pay.length - 1].periodo,
        valor: +pay[pay.length - 1].valor - +pay[pay.length - 2].valor, anterior: +pay[pay.length - 2].valor - +pay[pay.length - 3].valor, unidade: 'mil' });
      return saida;
    },
  });

  // ----- Números do topo -----
  const fed = () => linhas('eua_fed')[0] || null;
  const item = (nome) => linhas('eua_resumo').find((r) => r.item === nome) || null;
  dash.draw('eua-faixa', (el) => { const f = fed(); el.textContent = f ? `${fmt(num(f.alvo_min))}% a ${fmt(num(f.alvo_max))}%` : INDISPONIVEL; });
  dash.draw('eua-effr', (el) => { const f = fed(); el.textContent = f ? pct(num(f.effr)) : INDISPONIVEL; });
  dash.draw('eua-effr-data', (el) => { const f = fed(); el.textContent = f ? data(f.data) : INDISPONIVEL; });
  dash.draw('eua-taxa', (el) => { const r = item(el.dataset.item); el.textContent = r ? pct(r.valor) : INDISPONIVEL; });
  dash.draw('eua-var', (el) => { const r = item(el.dataset.item); el.textContent = r ? bps(r.var_dia_bps) : INDISPONIVEL; });
  dash.draw('eua-spread', (el) => { const r = item('spread'); el.textContent = r ? bps(r.valor) : INDISPONIVEL; });
  dash.draw('eua-ust-data', (el) => { const c = linhas('eua_curva')[0]; el.textContent = c ? data(c.data) : INDISPONIVEL; });
  dash.draw('eua-ust-data-3m', (el) => { const c = linhas('eua_curva').find((r) => r.data_3m); el.textContent = c ? data(c.data_3m) : INDISPONIVEL; });
  dash.draw('eua-sep-data', (el) => { const d = linhas('eua_dots')[0]; el.textContent = d ? data(d.reuniao) : INDISPONIVEL; });
  dash.draw('eua-zq-data', (el) => { const c = linhas('eua_zq')[0]; el.textContent = c ? dataHora(c.cotado_em) + ' (horário de Brasília)' : INDISPONIVEL; });

  // ----- Curva dos Treasuries -----
  dash.draw('eua-grafico-curva', (el) => {
    const curva = linhas('eua_curva');
    if (curva.length < 3) return aviso(el, INDISPONIVEL);
    const de = (anos) => d3.least(curva, (r) => Math.abs(Math.sqrt(r.anos) - Math.sqrt(anos)));
    grafico(el, {
      rotulo: 'Curva de rendimentos dos Treasuries por prazo, na data de referência e três meses antes.',
      x: { escala: 'sqrt', dominio: [0, 30], marcas: curva.filter((r) => CURTOS[r.prazo]).map((r) => ({ v: r.anos, rotulo: PRAZOS[r.prazo], curto: CURTOS[r.prazo] })) },
      y: { sufixo: '%', folgaMin: 0.05 },
      series: [
        { classe: 'di-line-3m', curva: 'monotona', pontos: curva.map((r) => ({ x: r.anos, y: r.taxa_3m })) },
        { classe: 'di-line', curva: 'monotona', marcadores: true, pontos: curva.map((r) => ({ x: r.anos, y: r.taxa })) },
      ],
      encaixes: curva.map((r) => r.anos),
      dica: (anos) => {
        const r = de(anos);
        return { x: r.anos, titulo: `Treasury de ${PRAZOS[r.prazo] || r.prazo}`, pontos: [{ y: r.taxa }, { y: r.taxa_3m, classe: 'di-focus-3m' }],
          linhas: [[data(r.data), pct(r.taxa)], ['Dia anterior', pct(r.taxa_ant)], ['Variação no dia', bps(r.var_dia_bps)], ['3 meses atrás', pct(r.taxa_3m)], ['Variação em 3 meses', bps(r.var_3m_bps)]] };
      },
    });
  });
  dash.draw('eua-tabela-curva', (corpo) => tabela(corpo, linhas('eua_curva'), 'prazo', [
    [(r) => PRAZOS[r.prazo] || r.prazo, ''], [(r) => pct(r.taxa), 'di-num di-strong'], [(r) => pct(r.taxa_ant), 'di-num'], [(r) => bps(r.var_dia_bps), 'di-num'],
    [(r) => pct(r.taxa_3m), 'di-num'], [(r) => bps(r.var_3m_bps), 'di-num'],
  ]));
  dash.draw('eua-tabela-real', (corpo) => tabela(corpo, linhas('eua_implicita'), 'anos', [
    [(r) => r.anos + ' anos', ''], [(r) => pct(r.nominal), 'di-num'], [(r) => pct(r.real), 'di-num'], [(r) => pct(r.implicita), 'di-num di-strong'], [(r) => pct(r.implicita_3m), 'di-num'],
  ]));

  // ----- Dot plot e trajetória de mercado, na mesma escala -----
  const dominioJuros = () => {
    const valores = linhas('eua_dots').map((d) => +d.taxa).concat(linhas('eua_trajetoria').flatMap((r) => [r.taxa_antes, r.taxa_depois]));
    const f = fed();
    if (f) valores.push(num(f.alvo_min), num(f.alvo_max));
    const v = valores.filter(ok);
    if (!v.length) return null;
    return [Math.floor((d3.min(v) - 0.126) * 4) / 4, Math.ceil((d3.max(v) + 0.126) * 4) / 4];
  };
  const faixaAlvo = () => { const f = fed(); return f ? [{ y0: num(f.alvo_min), y1: num(f.alvo_max), classe: 'vc-faixa' }] : []; };

  dash.draw('eua-grafico-dots', (el) => {
    const dots = linhas('eua_dots'), medianas = linhas('eua_mediana'), dominio = dominioJuros();
    if (!dots.length || !dominio) return aviso(el, INDISPONIVEL);
    const anos = medianas.map((r) => r.ano);
    // O gráfico genérico desenha eixos, grade e a faixa-alvo; os pontos entram por cima.
    const g = grafico(el, {
      rotulo: 'Dot plot do Fed: projeção de cada participante do FOMC para os Fed funds no fim de cada ano, com a mediana.',
      x: { dominio: [0, anos.length], marcas: anos.map((a, i) => ({ v: i + 0.5, rotulo: a, curto: a === 'Longo prazo' ? 'Longo' : a })) },
      y: { dominio, sufixo: '%', passo: 0.25, passoEstreito: 2, casas: 2 },
      series: [], faixas: faixaAlvo(), alturaMin: 280, alturaMax: 420, proporcao: 0.5,
    });
    const largura = g.x(1) - g.x(0);
    const raio = g.estreito ? 3 : 4;
    const maior = d3.max(dots, (d) => +d.participantes);
    const passo = Math.min(raio * 2 + 2, (largura - 16) / maior);
    const bolas = [];
    dots.forEach((d) => {
      const col = anos.indexOf(d.ano), n = +d.participantes;
      for (let i = 0; i < n; i++) bolas.push({ cx: g.x(col + 0.5) + (i - (n - 1) / 2) * passo, cy: g.y(+d.taxa) });
    });
    const marcas = g.svg.append('g');
    medianas.forEach((r, i) => {
      marcas.append('line').attr('class', 'vc-mediana').attr('x1', g.x(i) + 6).attr('x2', g.x(i + 1) - 6).attr('y1', g.y(r.mediana)).attr('y2', g.y(r.mediana));
    });
    g.svg.append('g').selectAll('circle').data(bolas).join('circle').attr('class', 'vc-dot').attr('cx', (b) => b.cx).attr('cy', (b) => b.cy).attr('r', raio);
  });
  dash.draw('eua-tabela-mediana', (corpo) => tabela(corpo, linhas('eua_mediana'), 'ano', [
    [(r) => r.ano, ''], [(r) => pct(r.mediana, 3), 'di-num di-strong'], [(r) => pct(r.menor, 3), 'di-num'], [(r) => pct(r.maior, 3), 'di-num'], [(r) => String(r.participantes), 'di-num'],
  ]));

  dash.draw('eua-grafico-mercado', (el) => {
    const traj = linhas('eua_trajetoria'), dominio = dominioJuros(), cot = linhas('eua_zq')[0];
    if (!traj.length || !dominio || !cot) return aviso(el, INDISPONIVEL);
    const inicio = ms(cot.cotado_em), fim = ms(traj[traj.length - 1].vigencia) + 35 * 86400000;
    const degraus = [{ x: inicio, y: traj[0].taxa_antes, marca: false }].concat(traj.map((r) => ({ x: ms(r.vigencia), y: r.taxa_depois, rotulo: VC.fmt(r.taxa_depois) })));
    degraus.push({ x: fim, y: traj[traj.length - 1].taxa_depois, marca: false });
    const marcas = [];
    const d0 = new Date(inicio);
    for (let k = 1; ; k++) {
      const t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k, 1);
      if (t > fim) break;
      const d = new Date(t);
      marcas.push({ v: t, rotulo: MESES[d.getUTCMonth()] + '/' + String(d.getUTCFullYear()).slice(2) });
    }
    grafico(el, {
      rotulo: 'Trajetória da taxa efetiva dos Fed funds embutida nos futuros, por reunião do FOMC.',
      x: { dominio: [inicio, fim], marcas },
      y: { dominio, sufixo: '%', passo: 0.25, passoEstreito: 2, casas: 2 },
      series: [{ classe: 'di-line', curva: 'degrau', marcadores: true, rotulos: !(el.clientWidth < 520), pontos: degraus }],
      faixas: faixaAlvo(), alturaMin: 280, alturaMax: 420, proporcao: 0.5,
      encaixes: traj.map((r) => ms(r.vigencia)),
      dica: (xv) => {
        const r = d3.least(traj, (t) => Math.abs(ms(t.vigencia) - xv));
        return { x: ms(r.vigencia), titulo: `FOMC de ${data(r.reuniao)}`, pontos: [{ y: r.taxa_depois }],
          linhas: [['Taxa embutida antes', pct(r.taxa_antes)], ['Taxa embutida depois', pct(r.taxa_depois)], ['Mudança embutida', bps(r.mudanca_bps)], ['Acumulado', bps(r.acumulado_bps)]] };
      },
    });
  });
  dash.draw('eua-tabela-mercado', (corpo) => tabela(corpo, linhas('eua_trajetoria'), 'reuniao', [
    [(r) => data(r.reuniao), ''], [(r) => pct(r.taxa_antes), 'di-num'], [(r) => pct(r.taxa_depois), 'di-num di-strong'], [(r) => bps(r.mudanca_bps), 'di-num'], [(r) => bps(r.acumulado_bps), 'di-num'],
  ]));

  // ----- Inflação, emprego e calendário -----
  dash.draw('eua-tabela-macro', (corpo) => {
    const valor = (r, v) => (r.unidade === '%' ? pct(v, r.indicador.startsWith('Taxa') ? 1 : 2) : sinal(v, 0, ' mil'));
    tabela(corpo, linhas('eua_macro_resumo'), 'indicador', [[(r) => r.indicador, ''], [(r) => mes(r.ref), ''], [(r) => valor(r, r.valor), 'di-num di-strong'], [(r) => valor(r, r.anterior), 'di-num']]);
  });
  dash.draw('eua-tabela-fomc', (corpo) => {
    const cot = linhas('eua_zq')[0], f = fed();
    const hoje = cot ? String(cot.cotado_em).slice(0, 10) : (f ? f.data : '');
    tabela(corpo, linhas('eua_fomc').filter((r) => r.data >= hoje), 'data', [[(r) => data(r.data), ''], [(r) => (r.sep ? 'sim' : 'não'), '']]);
  });
})();
