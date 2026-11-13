// Utilidades comuns às abas novas: formatação brasileira, tabelas, gráfico de linhas e estado das fontes.
window.VC = (() => {
  const num = (c) => (c === null || c === undefined || c === '' ? NaN : +c);
  const nfBase = (casas) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const nf = (casas) => { const f = nfBase(casas); return { format: (v) => f.format(v).replace('-', '−') }; };
  const INDISPONIVEL = 'indisponível';
  const ok = (v) => v !== null && v !== undefined && isFinite(v);
  const fmt = (v, casas = 2) => (ok(v) ? nf(casas).format(v) : INDISPONIVEL);
  const pct = (v, casas = 2) => (ok(v) ? nf(casas).format(v) + '%' : INDISPONIVEL);
  const sinal = (v, casas, sufixo) => (ok(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + nf(casas).format(Math.abs(v)) + sufixo : INDISPONIVEL);
  const bps = (v, casas = 0) => sinal(v, casas, ' bps');
  const varPct = (v, casas = 2) => sinal(v, casas, '%');
  const reais = (v, casas = 2) => (ok(v) ? 'R$ ' + nf(casas).format(v) : INDISPONIVEL);

  const dataFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
  const diaSP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  const diaCurtoSP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const horaSP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // "2026-11-10" -> "10/11/2026" (data sem hora, lida como UTC para não voltar um dia)
  const data = (iso) => { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z'); return iso && !isNaN(d) ? dataFmt.format(d) : INDISPONIVEL; };
  // "2026-11-12T11:35:27-03:00" -> "12/11/2026 às 11:35" no horário de Brasília
  const dataHora = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? diaSP.format(d) + ' às ' + horaSP.format(d) : INDISPONIVEL; };
  const diaHora = (iso) => { const d = new Date(iso); return iso && !isNaN(d) ? diaCurtoSP.format(d) + ' ' + horaSP.format(d) : INDISPONIVEL; };
  // "2026-10" -> "out/2026"
  const mes = (ym) => { const [a, m] = String(ym).split('-').map(Number); return a && m ? MESES[m - 1] + '/' + a : INDISPONIVEL; };
  const ms = (iso) => Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');

  const linhas = (id) => { const g = dash.data(id); return g && g.status === 'ok' && Array.isArray(g.data) ? g.data : []; };
  const valor = (id) => { const g = dash.data(id); return g && g.status === 'ok' ? g.data : null; };

  // Preenche um <tbody>: cada coluna é [função que devolve o texto, classe opcional].
  const tabela = (corpo, registros, chave, colunas) => {
    if (!registros.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = colunas.length;
      td.className = 'vc-vazio';
      td.textContent = INDISPONIVEL;
      tr.append(td);
      corpo.replaceChildren(tr);
      return;
    }
    corpo.replaceChildren(...registros.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.key = encodeURIComponent(r[chave]);
      colunas.forEach(([texto, classe]) => {
        const td = document.createElement('td');
        if (classe) td.className = classe;
        td.textContent = texto(r);
        tr.append(td);
      });
      return tr;
    }));
  };

  // Linha "atualizado em…" de cada bloco, com aviso quando a última tentativa falhou.
  dash.draw('fonte', (el) => {
    const status = valor('status') || {};
    const nomes = (el.dataset.bloco || '').split(' ').filter(Boolean);
    const estados = nomes.map((n) => status[n]).filter(Boolean);
    if (!estados.length) { el.textContent = 'Ainda sem registro de atualização para este bloco.'; el.classList.remove('vc-alerta'); return; }
    const falha = estados.find((s) => !s.ok);
    const ultima = estados.map((s) => s.em).filter(Boolean).sort().pop();
    if (falha) {
      el.textContent = `Aviso: a tentativa de atualização de ${dataHora(falha.falhou_em)} falhou. ` +
        (ultima ? `Os dados mostrados são os da atualização de ${dataHora(ultima)}.` : 'Ainda não há dado desta fonte.');
      el.classList.add('vc-alerta');
    } else {
      el.textContent = `Última busca na fonte: ${dataHora(ultima)}.`;
      el.classList.remove('vc-alerta');
    }
  });

  const aviso = (el, texto) => {
    const p = document.createElement('p');
    p.className = 'di-chart-msg';
    p.textContent = texto;
    el.replaceChildren(p);
  };

  // Gráfico de linhas genérico, no mesmo desenho do gráfico da curva DI.
  // cfg = { rotulo, x: {escala, dominio, marcas:[{v, rotulo}]}, y: {dominio, casas, sufixo, passo}, series: [{classe, pontos:[{x,y}], curva, marcadores}],
  //         faixas: [{y0, y1, classe}], linhasX: [{x, classe}], dica: (x) => ({titulo, sub, linhas:[[rotulo, valor]], pontos:[{y, classe}]}), encaixes: [x…] }
  const grafico = (el, cfg) => {
    const W = Math.max(280, el.clientWidth || 640);
    const H = Math.round(Math.max(cfg.alturaMin || 240, Math.min(cfg.alturaMax || 400, W * (cfg.proporcao || 0.46))));
    const estreito = W < 520;
    const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', cfg.rotulo);
    const tip = document.createElement('div');
    tip.className = 'di-tip';
    tip.hidden = true;
    el.replaceChildren(svg.node(), tip);

    const todos = cfg.series.flatMap((s) => s.pontos.map((p) => p.y)).filter(ok);
    let [lo, hi] = cfg.y.dominio || d3.extent(todos);
    if (!cfg.y.dominio) { const folga = Math.max((hi - lo) * 0.1, cfg.y.folgaMin || 0.02); lo -= folga; hi += folga; }
    const y = d3.scaleLinear().domain([lo, hi]);
    if (!cfg.y.dominio) y.nice(estreito ? 4 : 6);
    const marcasY = cfg.y.passo ? d3.range(Math.ceil(y.domain()[0] / cfg.y.passo) * cfg.y.passo, y.domain()[1] + 1e-9, cfg.y.passo * (estreito && cfg.y.passoEstreito ? cfg.y.passoEstreito : 1))
      : y.ticks(estreito ? 4 : 6);
    const casasY = cfg.y.casas !== undefined ? cfg.y.casas : Math.min(3, d3.precisionFixed(marcasY.length > 1 ? marcasY[1] - marcasY[0] : 0.1));
    const rotuloY = (t) => nf(casasY).format(t) + (cfg.y.sufixo || '');
    const medidor = svg.append('text').attr('opacity', 0);
    let largura = 0;
    marcasY.forEach((t) => { medidor.text(rotuloY(t)); largura = Math.max(largura, medidor.node().getComputedTextLength()); });
    medidor.remove();
    const m = { top: 14, right: 16, bottom: 30, left: Math.ceil(largura || 44) + 10 };
    y.range([H - m.bottom, m.top]);
    const x = (cfg.x.escala === 'sqrt' ? d3.scaleSqrt() : d3.scaleLinear()).domain(cfg.x.dominio).range([m.left, W - m.right]);

    (cfg.faixas || []).forEach((f) => {
      if (!ok(f.y0) || !ok(f.y1)) return;
      const a = Math.max(y.range()[1], Math.min(y(f.y0), y(f.y1))), b = Math.min(y.range()[0], Math.max(y(f.y0), y(f.y1)));
      if (b > a) svg.append('rect').attr('class', f.classe || 'vc-faixa').attr('x', m.left).attr('width', W - m.left - m.right).attr('y', a).attr('height', b - a);
    });
    const eixoY = svg.append('g');
    marcasY.forEach((t) => {
      eixoY.append('line').attr('class', 'di-grid').attr('x1', m.left).attr('x2', W - m.right).attr('y1', y(t)).attr('y2', y(t));
      eixoY.append('text').attr('x', m.left - 8).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(rotuloY(t));
    });
    svg.append('line').attr('class', 'di-axis').attr('x1', m.left).attr('x2', W - m.right).attr('y1', H - m.bottom).attr('y2', H - m.bottom);
    const eixoX = svg.append('g');
    let ultimoFim = -Infinity;
    cfg.x.marcas.forEach((t) => {
      const px = x(t.v);
      if (px < m.left - 1 || px > W - m.right + 1) return;
      const texto = eixoX.append('text').attr('x', px).attr('y', H - m.bottom + 19).attr('text-anchor', 'middle').text(estreito && t.curto ? t.curto : t.rotulo);
      const larg = texto.node().getComputedTextLength();
      let ini = px - larg / 2;
      if (ini < m.left - 14) { texto.attr('text-anchor', 'start').attr('x', m.left - 14); ini = m.left - 14; }
      if (px + larg / 2 > W - 2) { texto.attr('text-anchor', 'end').attr('x', W - 2); ini = W - 2 - larg; }
      if (ini < ultimoFim + 6) { texto.remove(); return; }   // rótulos não se encostam
      ultimoFim = ini + larg;
      eixoX.append('line').attr('class', 'di-axis').attr('x1', px).attr('x2', px).attr('y1', H - m.bottom).attr('y2', H - m.bottom + 5);
    });
    (cfg.linhasX || []).forEach((l) => {
      if (ok(l.x)) svg.append('line').attr('class', l.classe || 'di-ref').attr('x1', x(l.x)).attr('x2', x(l.x)).attr('y1', m.top).attr('y2', H - m.bottom);
    });

    const curvas = { monotona: d3.curveMonotoneX, degrau: d3.curveStepAfter, reta: d3.curveLinear };
    cfg.series.forEach((s) => {
      const pts = s.pontos.filter((p) => ok(p.x) && ok(p.y));
      if (!pts.length) return;
      svg.append('path').attr('class', s.classe).attr('d', d3.line().x((p) => x(p.x)).y((p) => y(p.y)).curve(curvas[s.curva || 'reta'])(pts));
      if (s.marcadores) {
        svg.append('g').selectAll('circle').data(pts.filter((p) => p.marca !== false)).join('circle')
          .attr('class', s.classeMarcador || 'di-dot').attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.y)).attr('r', estreito ? 2.6 : 3.2);
      }
      if (s.rotulos) {
        svg.append('g').selectAll('text').data(pts.filter((p) => p.rotulo)).join('text')
          .attr('class', 'di-bar-label').attr('x', (p) => x(p.x)).attr('y', (p) => y(p.y) - 9).attr('text-anchor', 'middle').text((p) => p.rotulo);
      }
    });

    if (cfg.dica) {
      const foco = svg.append('g').attr('visibility', 'hidden');
      const cruz = foco.append('line').attr('class', 'di-cross').attr('y1', m.top).attr('y2', H - m.bottom);
      const bolas = foco.append('g');
      const mostrar = (evento) => {
        const [px] = d3.pointer(evento, svg.node());
        let xv = x.invert(Math.max(m.left, Math.min(W - m.right, px)));
        if (cfg.encaixes && cfg.encaixes.length) xv = d3.least(cfg.encaixes, (e) => Math.abs(x(e) - px));
        const info = cfg.dica(xv);
        if (!info) return;
        const cx = x(info.x !== undefined ? info.x : xv);
        foco.attr('visibility', 'visible');
        cruz.attr('x1', cx).attr('x2', cx);
        bolas.selectAll('circle').data((info.pontos || []).filter((p) => ok(p.y))).join('circle')
          .attr('class', (p) => p.classe || 'di-focus').attr('r', 4.5).attr('cx', cx).attr('cy', (p) => y(p.y));
        const cabeca = document.createElement('div');
        cabeca.className = 'di-tip-head';
        cabeca.textContent = info.titulo;
        const partes = [cabeca];
        if (info.sub) { const sub = document.createElement('div'); sub.className = 'di-tip-sub'; sub.textContent = info.sub; partes.push(sub); }
        info.linhas.forEach(([rotulo, texto]) => {
          const div = document.createElement('div');
          div.className = 'di-tip-row';
          const a = document.createElement('span'), b = document.createElement('span');
          a.textContent = rotulo; b.textContent = texto;
          div.append(a, b);
          partes.push(div);
        });
        tip.replaceChildren(...partes);
        tip.hidden = false;
        const escala = (svg.node().getBoundingClientRect().width || W) / W;
        const larguraTip = tip.offsetWidth;
        const esquerda = cx * escala + 14 + larguraTip > el.clientWidth ? cx * escala - 14 - larguraTip : cx * escala + 14;
        tip.style.left = Math.max(0, esquerda) + 'px';
        tip.style.top = Math.max(0, m.top * escala) + 'px';
      };
      svg.append('rect').attr('class', 'di-hit').attr('x', m.left).attr('y', m.top).attr('width', W - m.left - m.right).attr('height', H - m.top - m.bottom)
        .on('pointermove', mostrar).on('pointerdown', mostrar)
        .on('pointerleave', () => { foco.attr('visibility', 'hidden'); tip.hidden = true; });
    }
    return { svg, x, y, m, W, H, estreito };
  };

  return { num, nf, ok, fmt, pct, sinal, bps, varPct, reais, data, dataHora, diaHora, mes, ms, MESES, linhas, valor, tabela, aviso, grafico, INDISPONIVEL };
})();
