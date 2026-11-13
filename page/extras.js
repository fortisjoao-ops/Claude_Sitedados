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
      : `Núcleo do PCE, a medida de inflação preferida do Fed: ${pct(agora)} em 12 meses até ${mes(serie[u].periodo)}` + (antes === null ? '' : ` (mês anterior: ${pct(antes)})`) + '. Fonte: FRED, série PCEPILFE; a variação em 12 meses é conta desta página.';
  });
})();
