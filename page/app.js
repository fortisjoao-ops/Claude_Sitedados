// Horizonte pedido: a curva dos próximos 5 anos, em anos de 252 dias úteis.
const ANOS = 5;
const BASE = 252;

// ---------- Cálculos (cada um aparece em Fontes com a própria fórmula) ----------

dash.calc('curva', {
  title: 'Curva interpolada por spline cúbica',
  description: 'Taxa para cada dia útil entre o primeiro vértice e 5 anos, por spline cúbica natural sobre os vértices DI1: agora, no ajuste anterior e três meses atrás.',
  inputs: ['di1', 'di1_3m'],
  fn: (vertices, vertices3m) => {
    const num = (c) => (c === null || c === undefined || c === '' ? NaN : +c);
    const pontos = vertices
      .map((v) => ({ du: num(v.du), agora: num(v.taxa), ant: num(v.ajuste_ant) }))
      .filter((p) => isFinite(p.du) && isFinite(p.agora) && isFinite(p.ant))
      .sort((a, b) => a.du - b.du);
    if (pontos.length < 3) return [];

    // Spline cúbica natural: passa por todos os pontos, segunda derivada zero nas pontas.
    const spline = (xs, ys) => {
      const n = xs.length;
      const h = [];
      for (let i = 0; i < n - 1; i++) h[i] = xs[i + 1] - xs[i];
      const c = new Array(n).fill(0);
      const d = new Array(n).fill(0);
      const m = new Array(n).fill(0);
      for (let i = 1; i < n - 1; i++) {
        const lado = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
        const den = 2 * (h[i - 1] + h[i]) - h[i - 1] * c[i - 1];
        c[i] = h[i] / den;
        d[i] = (lado - h[i - 1] * d[i - 1]) / den;
      }
      for (let i = n - 2; i >= 1; i--) m[i] = d[i] - c[i] * m[i + 1];
      return (x) => {
        let i = 0;
        while (i < n - 2 && x > xs[i + 1]) i++;
        const a = (xs[i + 1] - x) / h[i];
        const b = (x - xs[i]) / h[i];
        return a * ys[i] + b * ys[i + 1] + ((a * a * a - a) * m[i] + (b * b * b - b) * m[i + 1]) * h[i] * h[i] / 6;
      };
    };

    const dus = pontos.map((p) => p.du);
    const agora = spline(dus, pontos.map((p) => p.agora));
    const anterior = spline(dus, pontos.map((p) => p.ant));

    // Curva de três meses atrás: mesmos prazos em dias úteis, contados a partir da data daquele pregão.
    const pontos3m = (vertices3m || [])
      .map((v) => ({ du: num(v.du), taxa: num(v.taxa_ajuste) }))
      .filter((p) => isFinite(p.du) && isFinite(p.taxa))
      .sort((a, b) => a.du - b.du);
    const tresMeses = pontos3m.length >= 3 ? spline(pontos3m.map((p) => p.du), pontos3m.map((p) => p.taxa)) : null;
    const dentro3m = (du) => tresMeses && du >= pontos3m[0].du && du <= pontos3m[pontos3m.length - 1].du;
    const fim = Math.min(5 * 252, dus[dus.length - 1]); // 5 anos de 252 dias úteis
    const linhas = [];
    for (let du = dus[0]; du <= fim; du++) {
      linhas.push({
        du,
        anos: +(du / 252).toFixed(4),
        taxa: +agora(du).toFixed(4),
        taxa_ant: +anterior(du).toFixed(4),
        taxa_3m: dentro3m(du) ? +tresMeses(du).toFixed(4) : null, // sem extrapolar fora dos vértices daquele dia
      });
    }
    return linhas;
  },
});

dash.calc('prazos', {
  title: 'Taxa interpolada em prazos fixos',
  description: 'Pontos da curva interpolada em prazos redondos, com a variação em pontos-base frente ao ajuste anterior e frente a três meses atrás.',
  inputs: ['curva'],
  fn: (curva) => [
    ['6m', '6 meses', 126], ['1a', '1 ano', 252], ['18m', '18 meses', 378], ['2a', '2 anos', 504],
    ['3a', '3 anos', 756], ['4a', '4 anos', 1008], ['5a', '5 anos', 1260],
  ].map(([prazo, nome, du]) => {
    const p = (curva || []).find((linha) => linha.du === du);
    return p && {
      prazo, nome, du,
      taxa: p.taxa,
      taxa_ant: p.taxa_ant,
      var_bps: +((p.taxa - p.taxa_ant) * 100).toFixed(1),
      taxa_3m: p.taxa_3m,
      var_3m_bps: p.taxa_3m === null ? null : +((p.taxa - p.taxa_3m) * 100).toFixed(1),
    };
  }).filter(Boolean),
});

dash.calc('inclinacao', {
  title: 'Inclinação entre 1 e 5 anos',
  description: 'Taxa interpolada de 5 anos menos a de 1 ano, em pontos-base.',
  inputs: ['prazos'],
  fn: (prazos) => {
    const um = (prazos || []).find((p) => p.prazo === '1a');
    const cinco = (prazos || []).find((p) => p.prazo === '5a');
    return um && cinco ? +((cinco.taxa - um.taxa) * 100).toFixed(1) : null;
  },
});

dash.calc('variacao', {
  title: 'Variação de cada vértice',
  description: 'Taxa do vértice menos a taxa de ajuste do pregão anterior, em pontos-base.',
  inputs: ['di1'],
  fn: (vertices) => vertices
    .filter((v) => v.taxa !== null && v.taxa !== '' && v.ajuste_ant !== null && v.ajuste_ant !== '')
    .map((v) => ({ ticker: v.ticker, var_bps: +((+v.taxa - +v.ajuste_ant) * 100).toFixed(1) })),
});

dash.calc('cdi_por_data', {
  title: 'CDI médio projetado até cada data',
  description: 'Para cada dia dos próximos 5 anos: dias úteis desde a cotação, CDI médio anualizado lido na curva interpolada e CDI acumulado no período.',
  inputs: ['di1', 'curva'],
  fn: (vertices, curva) => {
    if (!vertices.length || !curva || !curva.length) return [];
    const dia = 86400000;
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    // Data da cotação, no horário de Brasília (o texto já vem com o fuso -03:00).
    const [ano0, mes0, dia0] = String(vertices[0].cotacao_em).slice(0, 10).split('-').map(Number);

    // Feriados nacionais: datas fixas mais Carnaval, Sexta-feira Santa e Corpus Christi (contados da Páscoa).
    const pascoa = (ano) => {
      const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
      const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
      const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
      const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
      const mes = Math.floor((h + l - 7 * m + 114) / 31), diaDoMes = ((h + l - 7 * m + 114) % 31) + 1;
      return Date.UTC(ano, mes - 1, diaDoMes);
    };
    const feriados = new Set();
    for (let ano = ano0; ano <= ano0 + 7; ano++) {
      [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25]]
        .forEach(([m, d]) => feriados.add(iso(Date.UTC(ano, m - 1, d))));
      [-48, -47, -2, 60].forEach((desloc) => feriados.add(iso(pascoa(ano) + desloc * dia)));
    }
    const util = (t) => {
      const semana = new Date(t).getUTCDay();
      return semana !== 0 && semana !== 6 && !feriados.has(iso(t));
    };

    const taxaNoDu = new Map(curva.map((linha) => [linha.du, linha.taxa]));
    const primeiro = curva[0];
    const ultimoDu = curva[curva.length - 1].du;
    const linhas = [];
    let t = Date.UTC(ano0, mes0 - 1, dia0);
    let du = 0; // dias úteis da data da cotação (inclusive) até a data da linha (exclusive)
    while (linhas.length < 4000) {
      if (util(t)) du++;
      t += dia;
      if (du > ultimoDu) break;
      if (du < 1) continue;
      const antes = du < primeiro.du;
      const taxa = antes ? primeiro.taxa : taxaNoDu.get(du);
      linhas.push({
        data: iso(t),
        du,
        cdi_medio: taxa,
        cdi_acumulado: +((Math.pow(1 + taxa / 100, du / 252) - 1) * 100).toFixed(4),
        antes_do_primeiro_vertice: antes,
      });
    }
    return linhas;
  },
});

dash.calc('copom_implicito', {
  title: 'Mudanças embutidas na curva por reunião do Copom',
  description: 'CDI médio que a curva interpolada embute entre cada reunião do Copom e a seguinte, e a mudança arredondada em passos de 0,25 ponto percentual.',
  inputs: ['curva', 'cdi_por_data', 'copom', 'cdi_base'],
  fn: (curva, cdiPorData, reunioes, cdiBase) => {
    if (!curva || !curva.length || !cdiPorData || !cdiPorData.length || !reunioes.length) return [];
    const num = (c) => (c === null || c === undefined || c === '' ? NaN : +c);

    // Dias úteis da cotação até cada data, já calculados em "cdi_por_data".
    const duAte = new Map(cdiPorData.map((l) => [l.data, l.du]));
    const dia = 86400000;
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    // A decisão sai na noite do segundo dia da reunião; a taxa nova vale a partir do dia útil seguinte.
    const vigencia = (decisao) => {
      let t = Date.parse(decisao + 'T00:00:00Z') + dia;
      for (let i = 0; i < 10; i++, t += dia) {
        const hoje = duAte.get(iso(t)), amanha = duAte.get(iso(t + dia));
        if (hoje === undefined || amanha === undefined) return null; // reunião passada ou fora do horizonte
        if (amanha > hoje) return iso(t);
      }
      return null;
    };
    const lista = reunioes.map((r) => String(r.data)).sort()
      .map((decisao) => ({ decisao, vig: vigencia(decisao) }))
      .filter((r) => r.vig)
      .map((r) => ({ ...r, m: duAte.get(r.vig) }));
    if (!lista.length) return [];

    // ln do fator acumulado do CDI entre a cotação e um prazo em dias úteis, lido na curva interpolada.
    const primeiroDu = curva[0].du, ultimoDu = curva[curva.length - 1].du;
    const taxaNoDu = new Map(curva.map((l) => [l.du, l.taxa]));
    const ln = (taxa) => Math.log(1 + taxa / 100);
    // CDI de hoje: o CDI médio até a primeira decisão valer. Antes do primeiro vértice a curva não chega; vale o último CDI guardado.
    const base = lista[0].m >= primeiroDu ? taxaNoDu.get(lista[0].m) : (cdiBase && cdiBase.length ? num(cdiBase[0].taxa) : NaN);
    if (!isFinite(base)) return [];
    const lnFator = (du) => (du / 252) * ln(du >= primeiroDu ? taxaNoDu.get(du) : base);

    let anterior = base, nivelAnterior = base;
    const linhas = [];
    for (let k = 0; k < lista.length; k++) {
      const ini = lista[k].m;
      // Até a vigência da reunião seguinte; depois da última reunião do calendário, 30 dias úteis à frente.
      const fim = k + 1 < lista.length ? lista[k + 1].m : ini + 30;
      if (fim > ultimoDu || fim <= ini) break;
      const depois = (Math.exp(((lnFator(fim) - lnFator(ini)) * 252) / (fim - ini)) - 1) * 100;
      // O arredondamento é feito no nível acumulado, para a soma das barras não se afastar do que a curva embute.
      const nivel = base + Math.round((depois - base) / 0.25) * 0.25;
      linhas.push({
        reuniao: lista[k].decisao,
        vigencia: lista[k].vig,
        du_ate_vigencia: ini,
        cdi_antes: +anterior.toFixed(4),
        cdi_depois: +depois.toFixed(4),
        mudanca_bps: +((depois - anterior) * 100).toFixed(1),
        mudanca_arredondada: +(nivel - nivelAnterior).toFixed(2),
        acumulado_arredondado: +(nivel - base).toFixed(2),
        cdi_projetado: +nivel.toFixed(4),
      });
      anterior = depois;
      nivelAnterior = nivel;
    }
    return linhas;
  },
});

// ---------- Formatação ----------

const num = (c) => (c === null || c === undefined || c === '' ? NaN : +c);
const nf = (casas) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const nf0 = nf(0), nf1 = nf(1), nf2 = nf(2), nf3 = nf(3);
const pct = (v) => (isFinite(v) ? nf2.format(v) + '%' : '—');
const pct3 = (v) => (v !== null && isFinite(v) ? nf3.format(v) + '%' : '—');
const bps = (v) => (v !== null && isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v)) + ' bps' : '—');
const pp = (v) => (v === null || !isFinite(v) ? '—' : v === 0 ? '0 p.p.' : (v > 0 ? '+' : '−') + nf2.format(Math.abs(v)) + ' p.p.');
const inteiro = (v) => (isFinite(v) ? nf0.format(v) : '—');
const dataCurta = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
const diaSP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const horaSP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const vencimento = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  return isNaN(d) ? '—' : dataCurta.format(d);
};

// A cor da série segue o tema do dashboard.
document.querySelectorAll('.di-page').forEach((p) => {
  p.style.setProperty('--di-c0', dash.colors[0]);
  p.style.setProperty('--di-c1', dash.colors[1] || dash.colors[0]);
});

// ---------- Números ----------

const linhaDoPrazo = (el) => {
  const g = dash.data('prazos');
  const [campo, valor] = (el.dataset.where || '').split('=');
  const linha = g.status === 'ok' && g.data ? g.data.find((r) => String(r[campo]) === valor) : null;
  return { g, linha };
};

dash.draw('taxa-prazo', (el) => {
  const { g, linha } = linhaDoPrazo(el);
  if (g.status !== 'loading') el.classList.remove('dash-skeleton');
  el.textContent = linha ? pct(linha.taxa) : '—';
});

dash.draw('var-prazo', (el) => {
  const { linha } = linhaDoPrazo(el);
  el.textContent = linha ? bps(linha.var_bps) : '—';
});

dash.draw('inclinacao', (el) => {
  const g = dash.data('inclinacao');
  if (g.status !== 'loading') el.classList.remove('dash-skeleton');
  el.textContent = g.status === 'ok' && g.data !== null ? bps(g.data) : '—';
});

dash.draw('quando', (el) => {
  const g = dash.data('di1');
  const d = g.status === 'ok' && g.data.length ? new Date(g.data[0].cotacao_em) : null;
  el.textContent = d && !isNaN(d) ? diaSP.format(d) + ' às ' + horaSP.format(d) : '—';
});

// ---------- CDI médio projetado até uma data ----------

// Data escolhida no campo (AAAA-MM-DD). Sem escolha, vale um ano corrido depois da data da cotação.
let alvo = null;
const linhasCdi = () => {
  const g = dash.data('cdi_por_data');
  return g.status === 'ok' && g.data ? g.data : [];
};
const dataPadrao = (linhas) => {
  const d = new Date(linhas[0].data + 'T00:00:00Z'); // a primeira linha é o dia seguinte ao da cotação
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
};
const linhaAlvo = () => {
  const linhas = linhasCdi();
  if (!linhas.length) return null;
  const padrao = dataPadrao(linhas);
  return (alvo && linhas.find((r) => r.data === alvo)) || linhas.find((r) => r.data === padrao) || linhas[linhas.length - 1];
};
const marcar = (el, linha) => {
  if (linha) el.dataset.where = 'data=' + linha.data;
  else delete el.dataset.where;
};
const mostrarNotaCurto = () => {
  const linha = linhaAlvo();
  document.querySelectorAll('.di-nota-curto').forEach((p) => { p.hidden = !(linha && linha.antes_do_primeiro_vertice); });
};
dash.onData(mostrarNotaCurto);

dash.draw('data-alvo', (campo) => {
  const linhas = linhasCdi();
  campo.disabled = !linhas.length;
  if (!linhas.length) return;
  campo.min = linhas[0].data;
  campo.max = linhas[linhas.length - 1].data;
  const atual = linhaAlvo();
  if (document.activeElement !== campo) campo.value = atual ? atual.data : '';
  campo.onchange = () => {
    // Só aceita uma data inteira e dentro do intervalo; uma data pela metade é ignorada.
    if (!campo.value || !campo.validity.valid) return;
    alvo = campo.value;
    mostrarNotaCurto();
    ['cdi-data', 'cdi-medio', 'cdi-acum', 'cdi-du', 'grafico'].forEach((nome) => dash.draw(nome));
  };
  campo.onblur = () => {
    const emUso = linhaAlvo();
    if (emUso) campo.value = emUso.data;
  };
});

dash.draw('cdi-data', (el) => {
  const linha = linhaAlvo();
  el.textContent = linha ? vencimento(linha.data) : '—';
});
dash.draw('cdi-medio', (el) => {
  const linha = linhaAlvo();
  marcar(el, linha);
  el.textContent = linha ? pct(linha.cdi_medio) : '—';
});
dash.draw('cdi-acum', (el) => {
  const linha = linhaAlvo();
  marcar(el, linha);
  el.textContent = linha ? pct(linha.cdi_acumulado) : '—';
});
dash.draw('cdi-du', (el) => {
  const linha = linhaAlvo();
  marcar(el, linha);
  el.textContent = linha ? inteiro(linha.du) : '—';
});

dash.draw('data-3m', (el) => {
  const g = dash.data('di1_3m');
  el.textContent = g.status === 'ok' && g.data.length ? vencimento(g.data[0].data_ref) : '—';
});

// ---------- Reuniões do Copom ----------

const linhasCopom = () => {
  const g = dash.data('copom_implicito');
  return g.status === 'ok' && g.data ? g.data : [];
};
dash.draw('copom-ultima', (el) => {
  const linhas = linhasCopom();
  el.textContent = linhas.length ? vencimento(linhas[linhas.length - 1].reuniao) : '—';
});
dash.draw('copom-acumulado', (el) => {
  const linhas = linhasCopom();
  const ultima = linhas[linhas.length - 1];
  marcar2(el, ultima);
  el.textContent = ultima ? pp(ultima.acumulado_arredondado) : '—';
});
dash.draw('copom-base', (el) => {
  const linhas = linhasCopom();
  marcar2(el, linhas[0]);
  el.textContent = linhas.length ? pct(linhas[0].cdi_antes) : '—';
});
function marcar2(el, linha) {
  if (linha) el.dataset.where = 'reuniao=' + linha.reuniao;
  else delete el.dataset.where;
}

dash.draw('copom', (el) => {
  const g = dash.data('copom_implicito');
  const linhas = linhasCopom();
  if (!linhas.length) {
    const aviso = document.createElement('p');
    aviso.className = 'di-chart-msg';
    aviso.textContent = g.status === 'error' ? 'Falha ao carregar' : g.status === 'ok' ? 'Não há reunião do Copom com data conhecida dentro da curva' : '—';
    el.replaceChildren(aviso);
    return;
  }

  const W = Math.max(280, el.clientWidth || 640);
  const H = Math.round(Math.max(220, Math.min(300, W * 0.34)));
  const estreito = W < 560;
  const svg = d3.create('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img')
    .attr('aria-label', 'Mudança de juros embutida na curva DI em cada reunião do Copom, arredondada em passos de 0,25 ponto percentual.');
  const tip = document.createElement('div');
  tip.className = 'di-tip';
  tip.hidden = true;
  el.replaceChildren(svg.node(), tip);

  const maior = Math.max(0.5, d3.max(linhas, (r) => Math.abs(r.mudanca_arredondada)));
  const marcasY = d3.range(-maior, maior + 0.001, 0.25).map((t) => +t.toFixed(2));
  const rotuloY = (t) => (t === 0 ? '0' : (t > 0 ? '+' : '−') + nf2.format(Math.abs(t)));
  const medidor = svg.append('text').attr('opacity', 0);
  let largura = 0;
  marcasY.forEach((t) => { medidor.text(rotuloY(t)); largura = Math.max(largura, medidor.node().getComputedTextLength()); });
  medidor.remove();

  const m = { top: 18, right: 8, bottom: 40, left: Math.ceil(largura || 36) + 10 };
  const y = d3.scaleLinear().domain([-maior - 0.125, maior + 0.125]).range([H - m.bottom, m.top]);
  const x = d3.scaleBand().domain(linhas.map((r) => r.reuniao)).range([m.left, W - m.right]).paddingInner(0.38).paddingOuter(0.2);

  const eixoY = svg.append('g');
  marcasY.forEach((t) => {
    eixoY.append('line').attr('class', t === 0 ? 'di-axis' : 'di-grid').attr('x1', m.left).attr('x2', W - m.right).attr('y1', y(t)).attr('y2', y(t));
    eixoY.append('text').attr('x', m.left - 8).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(rotuloY(t));
  });

  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const partes = (isoData) => { const [a, mes, d] = isoData.split('-').map(Number); return { a, mes: meses[mes - 1], d }; };
  const eixoX = svg.append('g');
  linhas.forEach((r) => {
    const p = partes(r.reuniao);
    const cx = x(r.reuniao) + x.bandwidth() / 2;
    eixoX.append('text').attr('x', cx).attr('y', H - m.bottom + 17).attr('text-anchor', 'middle').text(estreito ? p.mes : `${p.d} ${p.mes}`);
    eixoX.append('text').attr('x', cx).attr('y', H - m.bottom + 33).attr('text-anchor', 'middle').text(estreito ? String(p.a).slice(2) : p.a);
  });

  // Barras: sem mudança vira um traço na linha do zero.
  svg.append('g').selectAll('rect').data(linhas).join('rect')
    .attr('class', (r) => (r.mudanca_arredondada === 0 ? 'di-bar-zero' : 'di-bar'))
    .attr('x', (r) => x(r.reuniao)).attr('width', x.bandwidth())
    .attr('y', (r) => (r.mudanca_arredondada === 0 ? y(0) - 1.5 : y(Math.max(0, r.mudanca_arredondada))))
    .attr('height', (r) => (r.mudanca_arredondada === 0 ? 3 : Math.abs(y(r.mudanca_arredondada) - y(0))))
    .attr('rx', 1.5);
  svg.append('g').selectAll('text').data(linhas).join('text')
    .attr('class', 'di-bar-label')
    .attr('x', (r) => x(r.reuniao) + x.bandwidth() / 2)
    .attr('y', (r) => (r.mudanca_arredondada < 0 ? y(r.mudanca_arredondada) + 15 : y(r.mudanca_arredondada) - 7))
    .attr('text-anchor', 'middle')
    .text((r) => rotuloY(r.mudanca_arredondada));

  const linhaTip = (rotulo, valor) => {
    const div = document.createElement('div');
    div.className = 'di-tip-row';
    const a = document.createElement('span');
    const b = document.createElement('span');
    a.textContent = rotulo;
    b.textContent = valor;
    div.append(a, b);
    return div;
  };
  const mostrar = (evento, r) => {
    const cabeca = document.createElement('div');
    cabeca.className = 'di-tip-head';
    cabeca.textContent = `Copom de ${vencimento(r.reuniao)}`;
    const sub = document.createElement('div');
    sub.className = 'di-tip-sub';
    sub.textContent = `vale a partir de ${vencimento(r.vigencia)}`;
    tip.replaceChildren(cabeca, sub,
      linhaTip('CDI implícito antes', pct(r.cdi_antes)),
      linhaTip('CDI implícito depois', pct(r.cdi_depois)),
      linhaTip('Mudança embutida', bps(r.mudanca_bps)),
      linhaTip('Arredondada', pp(r.mudanca_arredondada)),
      linhaTip('Acumulado arredondado', pp(r.acumulado_arredondado)));
    tip.hidden = false;
    const escala = (svg.node().getBoundingClientRect().width || W) / W;
    const cx = (x(r.reuniao) + x.bandwidth() / 2) * escala;
    const larguraTip = tip.offsetWidth;
    const esquerda = cx + 14 + larguraTip > el.clientWidth ? cx - 14 - larguraTip : cx + 14;
    tip.style.left = Math.max(0, esquerda) + 'px';
    tip.style.top = Math.max(0, m.top * escala) + 'px';
  };
  svg.append('g').selectAll('rect').data(linhas).join('rect')
    .attr('class', 'di-hit')
    .attr('x', (r) => x(r.reuniao) - x.step() * 0.19).attr('width', x.step())
    .attr('y', m.top).attr('height', H - m.top - 4)
    .on('pointermove', mostrar)
    .on('pointerdown', mostrar)
    .on('pointerleave', () => { tip.hidden = true; });
});

// ---------- Tabelas ----------

const linhaDeTabela = (chave, celulas) => {
  const tr = document.createElement('tr');
  tr.dataset.key = encodeURIComponent(chave);
  celulas.forEach(([texto, classe]) => {
    const td = document.createElement('td');
    if (classe) td.className = classe;
    td.textContent = texto;
    tr.append(td);
  });
  return tr;
};

dash.draw('tabela-prazos', (corpo) => {
  const g = dash.data('prazos');
  const linhas = g.status === 'ok' && g.data ? g.data : [];
  corpo.replaceChildren(...linhas.map((r) => linhaDeTabela(r.prazo, [
    [r.nome, ''],
    [inteiro(r.du), 'di-num'],
    [pct3(r.taxa), 'di-num di-strong'],
    [pct3(r.taxa_ant), 'di-num'],
    [bps(r.var_bps), 'di-num'],
    [pct3(r.taxa_3m), 'di-num'],
    [bps(r.var_3m_bps), 'di-num'],
  ])));
});

dash.draw('tabela-vertices', (corpo) => {
  const g = dash.data('di1');
  const v = dash.data('variacao');
  const variacao = new Map((v.status === 'ok' && v.data ? v.data : []).map((r) => [r.ticker, r.var_bps]));
  const linhas = g.status === 'ok' ? g.data : [];
  corpo.replaceChildren(...linhas.map((r) => linhaDeTabela(r.ticker, [
    [r.ticker, ''],
    [vencimento(r.vencimento), ''],
    [inteiro(num(r.du)), 'di-num'],
    [pct3(num(r.taxa)), 'di-num di-strong'],
    [pct3(num(r.ultimo)), 'di-num'],
    [pct3(num(r.compra)), 'di-num'],
    [pct3(num(r.venda)), 'di-num'],
    [pct3(num(r.ajuste_ant)), 'di-num'],
    [bps(variacao.has(r.ticker) ? variacao.get(r.ticker) : NaN), 'di-num'],
    [inteiro(num(r.negociados)), 'di-num'],
  ])));
});

// ---------- Gráfico ----------

dash.draw('grafico', (el) => {
  const v = dash.data('di1');
  const c = dash.data('curva');
  const pronto = v.status === 'ok' && c.status === 'ok' && c.data && c.data.length > 1;
  if (!pronto) {
    const aviso = document.createElement('p');
    aviso.className = 'di-chart-msg';
    aviso.textContent = v.status === 'error' || c.status === 'error' ? 'Falha ao carregar'
      : v.status === 'ok' && c.status === 'ok' ? 'Não há vértices suficientes para interpolar' : '—';
    el.replaceChildren(aviso);
    return;
  }

  const curva = c.data;
  const fimDu = ANOS * BASE;
  const pontos = v.data
    .map((r) => ({ ticker: r.ticker, venc: r.vencimento, du: num(r.du), taxa: num(r.taxa), neg: num(r.negociados) }))
    .filter((p) => isFinite(p.du) && isFinite(p.taxa) && p.du <= fimDu);

  const W = Math.max(280, el.clientWidth || 640);
  const H = Math.round(Math.max(260, Math.min(420, W * 0.5)));
  const estreito = W < 520;

  const svg = d3.create('svg')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('role', 'img')
    .attr('aria-label', `Curva de juros DI interpolada por spline, do primeiro vértice até ${ANOS} anos, com os vértices DI1, a curva do ajuste anterior e a curva de três meses atrás.`);
  const tip = document.createElement('div');
  tip.className = 'di-tip';
  tip.hidden = true;
  el.replaceChildren(svg.node(), tip);

  // Escala vertical com folga, e margem esquerda medida pelo rótulo mais largo.
  const valores = curva.flatMap((r) => [r.taxa, r.taxa_ant, r.taxa_3m]).concat(pontos.map((p) => p.taxa)).filter((t) => t !== null);
  const [lo, hi] = d3.extent(valores);
  const folga = Math.max((hi - lo) * 0.1, 0.02);
  const y = d3.scaleLinear().domain([lo - folga, hi + folga]).nice(estreito ? 4 : 6);
  const marcasY = y.ticks(estreito ? 4 : 6);
  const casasY = Math.min(3, d3.precisionFixed(marcasY.length > 1 ? marcasY[1] - marcasY[0] : 0.1));
  const rotuloY = (t) => nf(casasY).format(t) + '%';
  const medidor = svg.append('text').attr('opacity', 0);
  let largura = 0;
  marcasY.forEach((t) => { medidor.text(rotuloY(t)); largura = Math.max(largura, medidor.node().getComputedTextLength()); });
  medidor.remove();

  const m = { top: 14, right: 14, bottom: 30, left: Math.ceil(largura || 44) + 10 };
  y.range([H - m.bottom, m.top]);
  const x = d3.scaleLinear().domain([0, ANOS]).range([m.left, W - m.right]);

  // Grade e eixos.
  const eixoY = svg.append('g');
  marcasY.forEach((t) => {
    eixoY.append('line').attr('class', 'di-grid').attr('x1', m.left).attr('x2', W - m.right).attr('y1', y(t)).attr('y2', y(t));
    eixoY.append('text').attr('x', m.left - 8).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(rotuloY(t));
  });
  svg.append('line').attr('class', 'di-axis').attr('x1', m.left).attr('x2', W - m.right).attr('y1', H - m.bottom).attr('y2', H - m.bottom);
  const eixoX = svg.append('g');
  d3.range(0, ANOS + 1).forEach((a) => {
    eixoX.append('line').attr('class', 'di-axis').attr('x1', x(a)).attr('x2', x(a)).attr('y1', H - m.bottom).attr('y2', H - m.bottom + 5);
    eixoX.append('text')
      .attr('x', x(a)).attr('y', H - m.bottom + 19)
      .attr('text-anchor', a === 0 ? 'start' : a === ANOS ? 'end' : 'middle')
      .text(a === 0 ? 'hoje' : estreito ? a + 'a' : a === 1 ? '1 ano' : a + ' anos');
  });

  // Curvas.
  const linha = (campo) => d3.line().defined((r) => r[campo] !== null).x((r) => x(r.du / BASE)).y((r) => y(r[campo]));
  svg.append('path').attr('class', 'di-line-3m').attr('d', linha('taxa_3m')(curva));
  svg.append('path').attr('class', 'di-line-ant').attr('d', linha('taxa_ant')(curva));
  svg.append('path').attr('class', 'di-line').attr('d', linha('taxa')(curva));

  // Vértices; os contratos de janeiro levam o código ao lado.
  const naCurva = (du) => curva[Math.max(0, Math.min(curva.length - 1, Math.round(du) - curva[0].du))];
  const raio = estreito ? 2.6 : 3.2;
  svg.append('g').selectAll('circle').data(pontos).join('circle')
    .attr('class', (p) => (p.neg > 0 ? 'di-dot' : 'di-ring'))
    .attr('cx', (p) => x(p.du / BASE)).attr('cy', (p) => y(p.taxa)).attr('r', raio);
  svg.append('g').selectAll('text').data(pontos.filter((p) => /^DI1F\d\d$/.test(p.ticker))).join('text')
    .attr('x', (p) => x(p.du / BASE))
    .attr('y', (p) => y(p.taxa) + (naCurva(p.du).taxa_ant >= p.taxa ? 17 : -9))
    .attr('text-anchor', 'middle')
    .text((p) => p.ticker.slice(3));

  // Data consultada no campo acima: linha vertical e ponto na taxa lida.
  const consulta = linhaAlvo();
  if (consulta) {
    const cxRef = x(consulta.du / BASE);
    svg.append('line').attr('class', 'di-ref').attr('x1', cxRef).attr('x2', cxRef).attr('y1', m.top).attr('y2', H - m.bottom);
    svg.append('circle').attr('class', 'di-ref-dot').attr('cx', cxRef).attr('cy', y(consulta.cdi_medio)).attr('r', 4.5);
  }

  // Leitura por ponteiro: linha vertical, ponto em cada curva e caixa com os valores.
  const foco = svg.append('g').attr('visibility', 'hidden');
  const cruz = foco.append('line').attr('class', 'di-cross').attr('y1', m.top).attr('y2', H - m.bottom);
  const foco3m = foco.append('circle').attr('class', 'di-focus-3m').attr('r', 4);
  const focoAnt = foco.append('circle').attr('class', 'di-focus-ant').attr('r', 4);
  const focoAgora = foco.append('circle').attr('class', 'di-focus').attr('r', 4.5);

  const linhaTip = (rotulo, valor) => {
    const div = document.createElement('div');
    div.className = 'di-tip-row';
    const a = document.createElement('span');
    const b = document.createElement('span');
    a.textContent = rotulo;
    b.textContent = valor;
    div.append(a, b);
    return div;
  };

  const mostrar = (evento) => {
    const [px] = d3.pointer(evento, svg.node());
    let du = Math.round(x.invert(px) * BASE);
    const perto = d3.least(pontos, (p) => Math.abs(x(p.du / BASE) - px));
    const vertice = perto && Math.abs(x(perto.du / BASE) - px) <= 7 ? perto : null;
    if (vertice) du = vertice.du;
    du = Math.max(curva[0].du, Math.min(curva[curva.length - 1].du, du));
    const r = naCurva(du);
    const cx = x(r.du / BASE);

    foco.attr('visibility', 'visible');
    cruz.attr('x1', cx).attr('x2', cx);
    focoAgora.attr('cx', cx).attr('cy', y(r.taxa));
    focoAnt.attr('cx', cx).attr('cy', y(r.taxa_ant));
    foco3m.attr('cx', cx).attr('cy', r.taxa_3m === null ? y(r.taxa) : y(r.taxa_3m)).attr('visibility', r.taxa_3m === null ? 'hidden' : null);

    const cabeca = document.createElement('div');
    cabeca.className = 'di-tip-head';
    cabeca.textContent = vertice ? `${vertice.ticker} · vence em ${vencimento(vertice.venc)}` : `${nf2.format(r.du / BASE)} anos`;
    const sub = document.createElement('div');
    sub.className = 'di-tip-sub';
    sub.textContent = `${inteiro(r.du)} dias úteis` + (vertice ? '' : ' · interpolado');
    tip.replaceChildren(cabeca, sub,
      linhaTip('Agora', pct3(r.taxa)),
      linhaTip('Ajuste anterior', pct3(r.taxa_ant)),
      linhaTip('Variação no dia', bps((r.taxa - r.taxa_ant) * 100)),
      linhaTip('3 meses atrás', pct3(r.taxa_3m)),
      linhaTip('Variação em 3 meses', bps(r.taxa_3m === null ? null : (r.taxa - r.taxa_3m) * 100)));
    tip.hidden = false;

    // A caixa fica dentro do gráfico: vira para a esquerda quando falta espaço.
    const escala = (svg.node().getBoundingClientRect().width || W) / W;
    const larguraTip = tip.offsetWidth;
    const esquerda = cx * escala + 14 + larguraTip > el.clientWidth ? cx * escala - 14 - larguraTip : cx * escala + 14;
    tip.style.left = Math.max(0, esquerda) + 'px';
    tip.style.top = Math.max(0, Math.min(y(r.taxa) * escala - tip.offsetHeight - 12, el.clientHeight - tip.offsetHeight)) + 'px';
  };
  const esconder = () => { foco.attr('visibility', 'hidden'); tip.hidden = true; };

  svg.append('rect').attr('class', 'di-hit')
    .attr('x', m.left).attr('y', m.top).attr('width', W - m.left - m.right).attr('height', H - m.top - m.bottom)
    .on('pointermove', mostrar)
    .on('pointerdown', mostrar)
    .on('pointerleave', esconder);
});
