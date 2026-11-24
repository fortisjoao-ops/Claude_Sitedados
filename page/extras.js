// ---------- Avisos acrescentados a abas que já existiam ----------
(() => {
  const { num, pct, data, mes, ms, linhas } = VC;

  // Curva DI Futuro: aviso quando o calendário conhecido do Copom está perto do fim.
  dash.draw('copom-calendario', (el) => {
    const datas = linhas('copom').map((r) => String(r.data)).sort(), cot = linhas('di1')[0];
    const ultima = datas[datas.length - 1], hoje = cot ? String(cot.cotacao_em).slice(0, 10) : null;
    const meses = ultima && hoje ? (ms(ultima) - ms(hoje)) / (30.44 * 86400000) : NaN;
    el.hidden = !(meses < 6);
    el.textContent = el.hidden ? '' : `O calendário do Copom nesta página vai até ${data(ultima)}. As reuniões seguintes entram quando o Banco Central divulgar as datas; uma rotina mensal confere o calendário oficial.`;
  });

  // Resumo: atalho para o relatório diário em PDF, que a rotina da manhã gera depois da seleção de notícias.
  // A ficha (relatorio.json) diz de que dia é a edição publicada; sem ela, o atalho não aparece.
  let ficha = null, pedida = false;
  dash.draw('relatorio-link', (el) => {
    if (!pedida) {
      pedida = true;
      fetch('relatorio.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { ficha = j; dash.draw('relatorio-link'); }).catch(() => {});
    }
    const valida = ficha && /^\d{4}-\d{2}-\d{2}$/.test(String(ficha.edicao));
    el.hidden = !valida;
    if (!valida) return;
    const link = el.querySelector('a'), nota = el.querySelector('span');
    link.href = 'relatorio-diario.pdf?e=' + ficha.edicao;   // o endereço muda a cada edição, para o navegador não servir a de ontem
    link.download = `relatorio-diario-vera-cruz-${ficha.edicao}.pdf`;
    nota.textContent = `Edição de ${data(ficha.edicao)}` + (+ficha.paginas ? `, ${+ficha.paginas} páginas` : '')
      + ': o resumo do dia, os principais números de cada tema e as notícias selecionadas. É gerado toda manhã, depois da seleção de notícias.';
  });

  // Resumo: inscrição para receber o relatório por email. O pedido vai direto para o formulário criado no Brevo, que guarda a lista
  // e manda o email de confirmação; o site não guarda endereço nenhum. Sem formulário configurado (build_dashboard.py), o campo não aparece.
  dash.draw('inscricao', (form) => {
    const destino = String(window.VC_FORMULARIO || '');
    form.hidden = !/^https:\/\/[a-z0-9.-]+\.(sibforms\.com|brevo\.com)\//.test(destino);
    if (form.hidden || form.dataset.pronto) return;
    form.dataset.pronto = '1';
    const campo = form.querySelector('input[type="email"]'), isca = form.querySelector('.vc-isca'), botao = form.querySelector('button'), estado = form.querySelector('[data-estado]');
    const dizer = (texto, erro) => { estado.textContent = texto; estado.classList.toggle('vc-alerta', !!erro); };
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const email = campo.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { dizer('Confira o endereço de email.', true); campo.focus(); return; }
      if (isca.value) return;   // campo invisível que só robôs preenchem
      const dados = new FormData();
      dados.append('EMAIL', email);
      dados.append('email_address_check', '');
      dados.append('locale', 'en');   // o mesmo valor do formulário criado no Brevo
      botao.disabled = true;
      dizer('Enviando…');
      fetch(destino + (destino.includes('?') ? '&' : '?') + 'isAjax=1', { method: 'POST', body: dados })
        .then((r) => r.json().catch(() => ({})).then((j) => r.ok && j.success !== false))
        .then((aceito) => {
          if (!aceito) { dizer('Não foi possível concluir a inscrição agora. Confira o endereço e tente de novo.', true); return; }
          campo.value = '';
          dizer(`Falta um passo: enviamos uma mensagem para ${email}. Abra e clique no link para confirmar a inscrição.`);
        })
        // Resposta ilegível para o navegador: o pedido pode ter chegado. A mensagem não afirma o que a página não sabe.
        .catch(() => (navigator.onLine === false
          ? dizer('Sem conexão com a internet. Tente de novo em instantes.', true)
          : dizer('Pedido enviado. Se o endereço estiver correto, chega em instantes uma mensagem com o link para confirmar a inscrição.')))
        .then(() => { botao.disabled = false; });
    });
  });

  // Juros EUA: núcleo do PCE, quando a rotina tem a chave do FRED.
  dash.draw('eua-pce', (el) => {
    const serie = linhas('eua_macro').filter((l) => l.serie === 'pce_nucleo').sort((a, b) => (a.periodo < b.periodo ? -1 : 1));
    const em12 = (i) => {
      const atual = serie[i], [a, m] = atual.periodo.split('-');
      const base = serie.find((l) => l.periodo === `${+a - 1}-${m}`);
      return base ? (num(atual.valor) / num(base.valor) - 1) * 100 : null;
    };
    const u = serie.length - 1, agora = u >= 0 ? em12(u) : null, antes = u >= 1 ? em12(u - 1) : null;
    el.textContent = agora === null
      ? 'Núcleo do PCE, a medida de inflação preferida do Fed: indisponível, porque a fonte (FRED, do Fed de St. Louis) exige uma chave de acesso que ainda não foi configurada na rotina de atualização.'
      : `Núcleo do PCE, a medida de inflação preferida do Fed: ${pct(agora)} em 12 meses até ${mes(serie[u].periodo)}` + (antes === null ? '' : ` (mês anterior: ${pct(antes)})`) + '. Fonte: FRED, série PCEPILFE; a variação em 12 meses é conta desta página. Este produto usa a API do FRED®, mas não é endossado nem certificado pelo Federal Reserve Bank de St. Louis.';
  });
})();
