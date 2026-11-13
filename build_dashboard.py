# Monta a página única do dashboard (nove abas) a partir dos arquivos em page/.
# Uso: python3 build_dashboard.py <pagina-com-DADOS-atuais.html> <saida.html> [d3-local.js]
import re, json, sys
src, out = sys.argv[1], sys.argv[2]
d3local = sys.argv[3] if len(sys.argv) > 3 else None
P = lambda n: open('page/' + n, encoding='utf-8').read()

antigo = open('build_public.py', encoding='utf-8').read()
tokens = re.search(r"tokens='''(.*?)'''", antigo, re.S).group(1)
brand_css = re.search(r"brand_css='''(.*?)'''", antigo, re.S).group(1)

# Aba 1: o conteúdo atual, sem a casca do dashboard original.
aba1 = P('index.html').replace('<meta name="dash-one-writer">\n', '').replace('<link rel="stylesheet" href="style.css">\n', '').replace('<script src="app.js"></script>\n', '')
aba1 = aba1.replace(' dash-skeleton', '')
velho = 'Esta página mostra uma cópia dessas cotações e só muda quando o arquivo é atualizado.'
assert velho in aba1
aba1 = aba1.replace(velho, 'Esta página busca novas cotações três vezes por dia nos dias úteis: às 10h20, 14h20 e 18h20.')
assert aba1.lstrip().startswith('<div class="di-page">')
aba1 = aba1.strip()[len('<div class="di-page">'):]
aba1 = aba1[:aba1.rindex('</div>')].strip('\n')

ABAS = [('visao-geral', 'Resumo', P('tab_resumo.html')), ('juros-br', 'Curva DI Futuro', aba1), ('juro-real-br', 'Juro real BR', P('tab_juroreal.html')),
        ('juros-eua', 'Juros EUA', P('tab_eua.html')), ('inflacao-br', 'Inflação BR', P('tab_inflacao.html')), ('focus', 'Focus', P('tab_focus.html')),
        ('acoes-br', 'Ações BR', P('tab_acoes.html')), ('fiis', 'FIIs', P('tab_fiis.html')), ('noticias', 'Notícias', P('tab_noticias.html'))]

pagina = open(src, encoding='utf-8').read()
m = re.search(r'^\s*const DADOS = (\{.*\});[ \t]*$', pagina, re.M)
dados = json.loads(m.group(1))

shim = '''(() => {
  const DADOS = %s;
  const calculos = {}, valores = {}, desenhos = {}, avisos = [];
  const desenhar = (nome) => document.querySelectorAll('[data-draw="' + nome + '"]').forEach((el) => {
    try { desenhos[nome](el); } catch (erro) { console.error('desenho ' + nome, erro); el.textContent = 'indisponível'; }
  });
  window.dash = {
    colors: ['var(--serie-1)', 'var(--serie-2)'],
    data(id) {
      if (id in DADOS) return { status: 'ok', data: DADOS[id] };
      const c = calculos[id];
      if (!c) return { status: 'missing', data: null };
      if (!(id in valores)) {
        try { valores[id] = c.fn(...c.inputs.map((entrada) => { const d = window.dash.data(entrada).data; return d === null || d === undefined ? [] : d; })); }
        catch (erro) { console.error('cálculo ' + id, erro); valores[id] = null; }
      }
      return valores[id] === null ? { status: 'error', data: null } : { status: 'ok', data: valores[id] };
    },
    calc(id, definicao) { calculos[id] = definicao; },
    draw(nome, fn) { if (fn) desenhos[nome] = fn; else if (desenhos[nome]) desenhar(nome); },
    onData(fn) { avisos.push(fn); },
  };
  window.iniciarCurvaDI = () => {
    avisos.forEach((fn) => { try { fn(); } catch (erro) { console.error(erro); } });
    Object.keys(desenhos).forEach(desenhar);
    // Cada gráfico é redesenhado quando a sua largura muda (inclusive quando a aba dele é aberta).
    document.querySelectorAll('.di-chart[data-draw]').forEach((el) => {
      let largura = el.clientWidth;
      new ResizeObserver(() => {
        if (!el.clientWidth || Math.abs(el.clientWidth - largura) < 1) return;
        largura = el.clientWidth;
        try { desenhos[el.dataset.draw] && desenhos[el.dataset.draw](el); } catch (erro) { console.error(erro); }
      }).observe(el);
    });
  };
})();''' % json.dumps(dados, ensure_ascii=False, separators=(',', ':'))

abas_js = '''(() => {
  const paineis = [...document.querySelectorAll('.vc-painel')], abas = [...document.querySelectorAll('.vc-tab')];
  const mostrar = () => {
    const alvo = paineis.find((p) => '#' + p.id === location.hash) || paineis[0];
    paineis.forEach((p) => { p.hidden = p !== alvo; });
    abas.forEach((a) => { if (a.getAttribute('href') === '#' + alvo.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  };
  window.addEventListener('hashchange', mostrar);
  mostrar();
  window.iniciarCurvaDI();
})();'''

head = '''<title>Curva DI Futuro</title>
<meta name="claude:viewport-fit-sides" content="cover">
''' + ('' if d3local else '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap">\n')
nav = '\n'.join('      <a class="vc-tab" href="#%s">%s</a>' % (i, t) for i, t, _ in ABAS)
paineis = '\n\n'.join('<div class="di-page vc-painel" id="%s"%s>\n%s\n</div>' % (i, '' if k == 0 else ' hidden', c.strip('\n')) for k, (i, t, c) in enumerate(ABAS))
corpo = '''<div class="di-wrap">
  <div class="vc-top">
    <div class="vc-brand"><img class="vc-logo" src="vera-cruz-logo.svg" alt="Vera Cruz"></div>
    <nav class="vc-tabs" aria-label="Abas do dashboard">
%s
    </nav>
  </div>

%s

  <footer class="di-foot">
    <img class="vc-simbolo" src="vera-cruz-simbolo.png" alt="" aria-hidden="true">
    <p>Página informativa; não é recomendação de investimento. A fonte e a data de cada número estão na aba correspondente.</p>
  </footer>
</div>
''' % (nav, paineis)
d3tag = ('<script>' + open(d3local, encoding='utf-8').read() + '</script>') if d3local else '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>'
scripts = '<script>\n' + shim + '\n</script>\n<script>\n' + P('vc.js') + '\n</script>\n<script>\n(() => {\n' + P('app.js') + '\n})();\n</script>\n'
for n in ('ntnb.js', 'eua.js', 'inflacao.js', 'acoes.js', 'noticias.js', 'juroreal.js', 'fiis.js', 'focus.js', 'resumo.js', 'extras.js'):
    scripts += '<script>\n' + P(n) + '\n</script>\n'
scripts += '<script>\n' + abas_js + '\n</script>\n'
html_final = head + '<style>\n' + tokens + P('style.css') + brand_css + P('tabs.css') + '</style>\n' + corpo + d3tag + '\n' + scripts
if d3local:
    html_final = '<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-size:14px}[hidden]{display:none!important}img{max-width:100%}</style></head><body>' + html_final + '</body></html>'
open(out, 'w', encoding='utf-8').write(html_final)
print(len(html_final), 'bytes;', len(json.dumps(dados, ensure_ascii=False, separators=(',', ':'))), 'de dados')
