// ---------- Aba Notícias ----------
(() => {
  const { dataHora, diaHora, linhas, valor, INDISPONIVEL } = VC;
  const montagem = () => linhas('noticias_montagem')[0] || null;

  dash.draw('not-montagem', (el) => { const m = montagem(); el.textContent = m ? dataHora(m.montada_em) : INDISPONIVEL; });

  dash.draw('noticias', (lista) => {
    const itens = linhas('noticias').filter((n) => n.secao === lista.dataset.secao).sort((a, b) => a.ordem - b.ordem);
    if (!itens.length) {
      const li = document.createElement('li');
      li.className = 'vc-vazio';
      li.textContent = 'indisponível: nenhuma matéria desta seção nos feeds consultados';
      lista.replaceChildren(li);
      return;
    }
    lista.replaceChildren(...itens.map((n) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.textContent = n.titulo;
      if (/^https:\/\//.test(n.link)) a.href = n.link;   // só endereços https vindos do feed
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const meta = document.createElement('span');
      meta.className = 'vc-noticia-meta';
      meta.textContent = `${n.fonte} · ${diaHora(n.data)}`;
      li.append(a, meta);
      return li;
    }));
  });

  // Aviso quando a seleção tem mais de 26 horas ou a última montagem falhou.
  dash.onData(() => {
    const m = montagem(), status = (valor('status') || {}).noticias;
    const velha = m ? Date.now() - Date.parse(m.montada_em) > 26 * 3600 * 1000 : true;
    document.querySelectorAll('.vc-aviso-noticias').forEach((p) => { p.hidden = !(velha || (status && !status.ok)); });
  });
})();
