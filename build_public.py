import csv, json, re
page=open('page/index.html').read()
css=open('page/style.css').read()
app=open('page/app.js').read()

# corpo: sem as linhas próprias do dashboard
page=page.replace('<meta name="dash-one-writer">\n','').replace('<link rel="stylesheet" href="style.css">\n','').replace('<script src="app.js"></script>\n','')
old='Esta página mostra uma cópia dessas cotações e só muda quando o arquivo é atualizado.'
assert old in page
page=page.replace(old,'Esta página busca novas cotações três vezes por dia nos dias úteis: às 10h20, 14h20 e 18h20.')
hd='  <header class="di-head">'
assert hd in page
page=page.replace(hd,'  <div class="vc-brand"><img class="vc-logo" src="vera-cruz-logo.svg" alt="Vera Cruz"></div>\n\n'+hd)
page=page.replace(' dash-skeleton','')
foot='''
  <footer class="di-foot">
    <img class="vc-simbolo" src="vera-cruz-simbolo.png" alt="" aria-hidden="true">
    <p>Fonte: B3. Cotações dos contratos DI1 com 15 minutos de atraso e taxas de ajuste do Boletim Diário do Mercado. Página informativa; não é recomendação de investimento.</p>
  </footer>

</div>'''
i=page.rindex('</div>')
page=page[:i].rstrip()+'\n'+foot+page[i+6:]

def rows(path):
    return [{k:(None if v=='' else v) for k,v in r.items()} for r in csv.DictReader(open(path))]
dados={'di1':rows('di1-b3.csv'),'di1_3m':rows('di1-b3-2026-08-11.csv'),'copom':rows('copom.csv'),'cdi_base':[{'taxa':'13.648','em':'2026-11-11'}]}

tokens='''/* Identidade Vera Cruz: fundo branco, Navy dominante, cartões em azul-gelo, Work Sans.
   Layout: logotipo no topo, faixa Navy com o título, destaques em cartões, gráfico largo e tabelas roláveis. */
:root {
  --vc-navy: #1C466C;
  --vc-cinza-nau: #6E6F70;
  --vc-azul-aco: #3D6A92;
  --vc-azul-gelo: #DCE4EA;
  --vc-branco: #FFFFFF;
  --vc-ardosia: #64748B;
  --vc-cinza-claro: #94A3B8;
  --vc-navy-profundo: #0E2238;

  --color-bg: var(--vc-branco);
  --color-panel: var(--vc-azul-gelo);
  --color-fg: var(--vc-navy-profundo);
  --color-fg-muted: var(--vc-ardosia);
  --color-border-line: var(--vc-azul-gelo);
  --serie-1: var(--vc-navy);
  --serie-2: var(--vc-azul-aco);
  --cds-text-secondary: var(--vc-ardosia);
  --cds-chart-grid: var(--vc-azul-gelo);
  --cds-chart-axis: var(--vc-cinza-claro);
  --cds-chart-muted: var(--vc-cinza-nau);
  --cds-chart-reference: var(--vc-cinza-claro);
  --cds-surface-popover: var(--vc-branco);
  --cds-border: #C7D3DE;
  --cds-shadow-popover: 0 6px 22px rgba(14, 34, 56, .16);
  --font-anthropic-sans: "Work Sans", Arial, sans-serif;
  --font-anthropic-serif: "Work Sans", Arial, sans-serif;
  --cds-font-size-caption: 0.8125rem;
  --cds-font-size-body: 0.9375rem;
  --cds-font-size-heading: 1.1875rem;
  --cds-font-size-title: 2rem;
  --cds-font-weight-medium: 600;
  --cds-radius: 6px;
  color-scheme: light;
}
body { background: var(--color-bg); color: var(--color-fg); font-family: var(--font-anthropic-sans); }
.di-wrap {
  max-width: 1040px;
  margin-inline: auto;
  padding-block: 32px 48px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
'''

brand_css='''
/* ---- Vera Cruz ---- */
.vc-brand { display: flex; align-items: center; }
.vc-logo { display: block; height: 64px; width: auto; min-width: 130px; }

.di-page .di-head {
  position: relative;
  overflow: hidden;
  gap: 10px;
  padding: 28px 32px 26px;
  background: var(--vc-navy);
  border-radius: var(--cds-radius);
  color: var(--vc-branco);
}
.di-page .di-head > * { position: relative; z-index: 1; }
.di-page .di-head::after {
  content: "";
  position: absolute;
  z-index: 0;
  right: 36px;
  top: 50%;
  width: 168px;
  height: 168px;
  transform: translateY(-50%);
  background: url("vera-cruz-marca-dagua.png") center / contain no-repeat;
  opacity: .28;
  pointer-events: none;
}
.di-page .di-title { font-weight: 600; letter-spacing: -0.01em; color: var(--vc-branco); }
.di-page .di-lede { color: var(--vc-branco); }
.di-page .di-lede b { font-weight: 600; }
.di-page .di-stamp { color: var(--vc-azul-gelo); }
.di-page .di-stamp span { color: var(--vc-branco); }

.di-page .di-tile, .di-page .di-query { border-color: transparent; }
.di-page .di-tile-label, .di-page .di-tile-sub, .di-page .di-query .di-note, .di-page .di-field { color: var(--vc-navy); }
.di-page .di-tile-sub span, .di-page .di-result-item .di-tile-label span { color: var(--vc-navy-profundo); font-weight: 500; }
.di-page .di-tile-num { font-weight: 600; color: var(--vc-navy); letter-spacing: -0.01em; }
.di-page .di-h2 { color: var(--vc-navy); }
.di-page .di-date { border-color: var(--vc-cinza-claro); }

.di-page .di-table th { padding: 9px 12px; background: var(--vc-navy); color: var(--vc-branco); border-bottom: 0; }
.di-page .di-table td { padding: 8px 12px; }
.di-page .di-table th:last-child, .di-page .di-table td:last-child { padding-right: 12px; }
.di-page .di-table th:first-child { border-top-left-radius: 4px; }
.di-page .di-table th:last-child { border-top-right-radius: 4px; }
.di-page .di-details summary { color: var(--vc-navy); font-weight: 500; }

.di-foot { display: flex; align-items: center; gap: 16px; border-top: 1px solid var(--vc-azul-gelo); padding-top: 20px; color: var(--vc-ardosia); font-size: var(--cds-font-size-caption); line-height: 1.5; }
.di-foot p { margin: 0; max-width: 68ch; }
.vc-simbolo { display: block; flex: none; width: 48px; height: 48px; }

@media (max-width: 720px) {
  .vc-logo { height: 52px; }
  .di-page .di-head { padding: 22px 20px; }
  .di-page .di-head::after { display: none; }
  .di-page { --cds-font-size-title: 1.625rem; }
}
'''

shim='''(() => {
  const DADOS = %s;
  const calculos = {}, valores = {}, desenhos = {}, avisos = [];
  const desenhar = (nome) => document.querySelectorAll('[data-draw="' + nome + '"]').forEach((el) => desenhos[nome](el));
  window.dash = {
    colors: ['var(--serie-1)', 'var(--serie-2)'],
    data(id) {
      if (DADOS[id]) return { status: 'ok', data: DADOS[id] };
      const c = calculos[id];
      if (!c) return { status: 'missing', data: null };
      if (!(id in valores)) valores[id] = c.fn(...c.inputs.map((entrada) => window.dash.data(entrada).data));
      return { status: 'ok', data: valores[id] };
    },
    calc(id, definicao) { calculos[id] = definicao; },
    draw(nome, fn) { if (fn) desenhos[nome] = fn; else if (desenhos[nome]) desenhar(nome); },
    onData(fn) { avisos.push(fn); },
  };
  window.iniciarCurvaDI = () => {
    avisos.forEach((fn) => fn());
    Object.keys(desenhos).forEach(desenhar);
    // O gráfico é redesenhado quando a largura da página muda.
    let largura = 0;
    document.querySelectorAll('.di-chart').forEach((el) => new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - largura) < 1) return;
      largura = el.clientWidth;
      desenhar('grafico');
    }).observe(el));
  };
})();''' % json.dumps(dados,ensure_ascii=False,separators=(',',':'))

head='''<title>Curva DI Futuro</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap">
'''
D3='<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>'
def build(d3tag, fonts=True):
    h=head if fonts else head.replace(head.splitlines()[2]+'\n','')
    return (h+'<style>\n'+tokens+css+brand_css+'</style>\n<div class="di-wrap">\n'+page.strip()+'\n</div>\n'+d3tag+'\n<script>\n'+shim+'\n</script>\n<script>\n(() => {\n'+app+'\nwindow.iniciarCurvaDI();\n})();\n</script>\n')
open('public/curva-di-futuro.html','w').write(build(D3))
local='<script>'+open('harness/node_modules/d3/dist/d3.min.js').read()+'</script>'
open('harness/public-test.html','w').write('<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-size:14px}[hidden]{display:none!important}img{max-width:100%}</style></head><body>'+build(local,False)+'</body></html>')
import os; print(os.path.getsize('public/curva-di-futuro.html'))
