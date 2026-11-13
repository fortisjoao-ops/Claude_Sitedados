// ---------- Tabela de NTN-B (aba Curva DI Futuro) ----------
(() => {
  const { num, ok, fmt, sinal, varPct, pct, data, linhas, tabela, INDISPONIVEL } = VC;

  dash.calc('ntnb_var', {
    title: 'Variação do PU das NTN-B',
    description: 'PU da data de referência menos o PU do dia útil anterior e o de três meses antes, em reais e em percentual. Não é retorno total: não ajusta cupom nem atualização do VNA.',
    inputs: ['ntnb'],
    fn: (titulos) => titulos.map((t) => {
      const pu = +t.pu, ant = t.pu_ant === null ? null : +t.pu_ant, m3 = t.pu_3m === null ? null : +t.pu_3m;
      return {
        chave: t.chave, titulo: t.titulo, vencimento: t.vencimento, pu,
        var_dia_rs: ant === null ? null : +(pu - ant).toFixed(2),
        var_dia_pct: ant === null ? null : +((pu / ant - 1) * 100).toFixed(2),
        var_3m_rs: m3 === null ? null : +(pu - m3).toFixed(2),
        var_3m_pct: m3 === null ? null : +((pu / m3 - 1) * 100).toFixed(2),
        taxa_venda: t.taxa_venda === null ? null : +t.taxa_venda,
      };
    }),
  });

  const primeiro = () => linhas('ntnb')[0] || null;
  const campoData = (campo) => (el) => { const t = primeiro(); el.textContent = t && t[campo] ? data(t[campo]) : INDISPONIVEL; };
  dash.draw('ntnb-ref', campoData('data_ref'));
  dash.draw('ntnb-ant', campoData('data_ant'));
  dash.draw('ntnb-3m', campoData('data_3m'));
  dash.draw('ntnb-alvo', campoData('data_alvo_3m'));
  dash.draw('tabela-ntnb', (corpo) => tabela(corpo, linhas('ntnb_var'), 'chave', [
    [(r) => r.titulo, ''], [(r) => data(r.vencimento), ''], [(r) => fmt(r.pu), 'di-num di-strong'],
    [(r) => sinal(r.var_dia_rs, 2, ''), 'di-num'], [(r) => varPct(r.var_dia_pct), 'di-num'],
    [(r) => sinal(r.var_3m_rs, 2, ''), 'di-num'], [(r) => varPct(r.var_3m_pct), 'di-num'],
    [(r) => pct(r.taxa_venda), 'di-num'],
  ]));
})();
