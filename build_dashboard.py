# Monta o site (uma página única com abas) a partir dos arquivos em page/.
# Uso: python3 build_dashboard.py <página com os DADOS atuais> <saída.html> [relatorio]
# Com "relatorio", monta o documento do relatório diário (o que a rotina da manhã imprime em PDF) em vez do site.
# Os dados ficam numa única linha "const DADOS = {...};" da página; a montagem copia essa linha da página indicada.
import re, json, sys
src, out = sys.argv[1], sys.argv[2]
RELATORIO = len(sys.argv) > 3 and sys.argv[3] == 'relatorio'
P = lambda n: open('page/' + n, encoding='utf-8').read()

# Endereço público do site: entra na prévia de compartilhamento. Troque aqui quando o site ganhar domínio próprio.
ENDERECO = 'https://veracruzdata.netlify.app/'
TITULO = 'Dash Vera Cruz'
DESCRICAO = 'Curva DI, juro real, juros dos Estados Unidos, inflação, Focus, ações, fundos imobiliários e notícias, atualizados automaticamente.'
FONTES = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&family=Work+Sans:wght@400;500;600&display=swap'

ABAS = [('visao-geral', 'Resumo', 'tab_resumo.html'), ('juros-br', 'Curva DI Futuro', 'tab_curva_di.html'), ('juro-real-br', 'Juro real BR', 'tab_juroreal.html'),
        ('juros-eua', 'Juros EUA', 'tab_eua.html'), ('inflacao-br', 'Inflação BR', 'tab_inflacao.html'), ('focus', 'Focus', 'tab_focus.html'),
        ('dolar', 'Dólar', 'tab_dolar.html'), ('acoes-br', 'Ações BR', 'tab_acoes.html'), ('fiis', 'FIIs', 'tab_fiis.html'),
        ('calculadora', 'Calculadora', 'tab_calculadora.html'), ('historico', 'Histórico', 'tab_historico.html'), ('noticias', 'Notícias', 'tab_noticias.html')]
# A ordem importa: vc.js e a aba Curva DI vêm primeiro; resumo.js usa o que as outras abas calculam.
SCRIPTS = ['ntnb.js', 'eua.js', 'inflacao.js', 'acoes.js', 'noticias.js', 'juroreal.js', 'fiis.js', 'focus.js', 'aovivo.js', 'cambio.js', 'calculadora.js',
           'resumo.js', 'extras.js', 'historico.js', 'csv.js']

pagina = open(src, encoding='utf-8').read()
dados = json.loads(re.search(r'^\s*const DADOS = (\{.*\});[ \t]*$', pagina, re.M).group(1))

# Base da página: guarda os dados, calcula sob demanda e redesenha os elementos marcados com data-draw.
shim = """(() => {
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
    // Troca um conjunto de dados com a página aberta e descarta os cálculos que dependem dele; quem chama redesenha o que precisar.
    definir(id, linhas) {
      DADOS[id] = linhas;
      const sujos = new Set([id]);
      for (let mudou = true; mudou;) {
        mudou = false;
        Object.entries(calculos).forEach(([nome, c]) => { if (!sujos.has(nome) && c.inputs.some((i) => sujos.has(i))) { sujos.add(nome); mudou = true; } });
      }
      sujos.forEach((nome) => { delete valores[nome]; });
    },
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
})();""" % json.dumps(dados, ensure_ascii=False, separators=(',', ':'))

# Troca de aba pelo endereço (#aba): mostra o painel, marca a aba e a traz para a vista na barra de navegação.
abas_js = """(() => {
  const paineis = [...document.querySelectorAll('.vc-painel')], abas = [...document.querySelectorAll('.vc-tab')], barra = document.querySelector('.vc-tabs');
  const mostrar = (evento) => {
    const alvo = paineis.find((p) => '#' + p.id === location.hash) || paineis[0];
    paineis.forEach((p) => { p.hidden = p !== alvo; });
    abas.forEach((a) => { if (a.getAttribute('href') === '#' + alvo.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const ativa = abas.find((a) => a.getAttribute('aria-current') === 'page');
    if (ativa && barra) barra.scrollTo({ left: Math.max(0, ativa.offsetLeft - (barra.clientWidth - ativa.offsetWidth) / 2), behavior: evento ? 'smooth' : 'auto' });
    // Ao trocar de aba com a página rolada, volta ao começo do conteúdo novo.
    if (evento) { const cabeca = document.querySelector('.vc-cabeca'), topo = cabeca ? cabeca.offsetTop + cabeca.offsetHeight : 0; if (window.scrollY > topo) window.scrollTo(0, topo); }
  };
  // Quando as abas não cabem na largura, a barra rola e ganha um esmaecimento à direita enquanto houver abas escondidas.
  const sobra = () => { if (barra) barra.classList.toggle('vc-tabs-mais', barra.scrollWidth - barra.clientWidth - barra.scrollLeft > 4); barra.classList.toggle('vc-tabs-antes', barra.scrollLeft > 4); };
  if (barra) barra.addEventListener('scroll', sobra, { passive: true });
  window.addEventListener('resize', sobra);
  // Clique num link para uma aba: troca o painel sem o salto de âncora do navegador, que esconderia o título sob a barra fixa.
  // Quem está no alto da página continua onde está; quem já rolou volta ao começo do conteúdo (regra acima, em mostrar).
  document.addEventListener('click', (e) => {
    const link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!link || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const destino = link.getAttribute('href');
    if (!paineis.some((p) => '#' + p.id === destino)) return;
    e.preventDefault();
    if (location.hash === destino) return;
    history.pushState(null, '', destino);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  window.addEventListener('hashchange', mostrar);
  mostrar();
  sobra();
  window.iniciarCurvaDI();
})();"""

nav = '\n'.join('    <a class="vc-tab" href="#%s">%s</a>' % (i, t) for i, t, _ in ABAS)
links = '\n'.join('        <li><a href="#%s">%s</a></li>' % (i, t) for i, t, _ in ABAS)
paineis = '\n\n'.join('<div class="di-page vc-painel" id="%s"%s>\n%s\n</div>' % (i, '' if k == 0 else ' hidden', P(arq).strip('\n')) for k, (i, t, arq) in enumerate(ABAS))

cabeca = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="%(d)s">
<meta name="theme-color" content="#1C466C">
<link rel="icon" type="image/png" href="icone.png">
<link rel="apple-touch-icon" href="icone.png">
<link rel="canonical" href="%(u)s">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Vera Cruz">
<meta property="og:title" content="%(t)s">
<meta property="og:description" content="%(d)s">
<meta property="og:url" content="%(u)s">
<meta property="og:image" content="%(u)sprevia.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<title>%(t)s</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="%(f)s">
""" % {'d': DESCRICAO, 'u': ENDERECO, 't': TITULO, 'f': FONTES}

corpo = """</head>
<body>
<div class="di-wrap">
  <header class="vc-cabeca">
    <a class="vc-brand" href="#visao-geral" aria-label="Vera Cruz: ir para o resumo"><img class="vc-logo" src="vera-cruz-logo.svg" alt="Vera Cruz"></a>
    <p class="vc-cabeca-meta"><span class="vc-cabeca-rotulo">Dados de mercado</span><span data-draw="vc-atualizado"></span></p>
  </header>
  <nav class="vc-tabs" aria-label="Abas do dashboard">
%s
  </nav>

%s

  <footer class="di-foot">
    <div class="vc-rodape-marca">
      <img class="vc-simbolo" src="vera-cruz-simbolo.png" alt="" aria-hidden="true">
      <p>Página informativa; não é recomendação de investimento. A fonte e a data de cada número estão na aba correspondente.</p>
    </div>
    <nav class="vc-rodape-nav" aria-label="Seções do site">
      <span class="vc-rodape-titulo">Seções</span>
      <ul class="vc-rodape-links">
%s
      </ul>
    </nav>
  </footer>
</div>
""" % (nav, paineis, links)

scripts = '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>\n'
scripts += '<script>\n' + shim + '\n</script>\n<script>\n' + P('vc.js') + '\n</script>\n<script>\n(() => {\n' + P('app.js') + '\n})();\n</script>\n'
for n in SCRIPTS:
    scripts += '<script>\n' + P(n) + '\n</script>\n'
scripts += '<script>\n' + abas_js + '\n</script>\n'

html_final = cabeca + '<style>\n' + P('estilo.css') + '</style>\n' + corpo + scripts + '</body>\n</html>\n'

def sem_regras_do_site(css):
    # A largura da folha A4 é menor que a de um tablet: sem isto, o relatório herdaria o desenho de celular do site.
    # Também sai o bloco de impressão do site, que é para quem imprime uma aba pelo navegador.
    saida, i = [], 0
    for m in re.finditer(r'@media\s*(\(max-width[^{]*|print\s*)\{', css):
        if m.start() < i: continue
        nivel, j = 1, m.end()
        while nivel:
            nivel += {'{': 1, '}': -1}.get(css[j], 0); j += 1
        saida.append(css[i:m.start()]); i = j
    return ''.join(saida) + css[i:]

if RELATORIO:
    # Relatório diário: o modelo (relatorio.html) na frente e as abas inteiras guardadas, fora da vista, em #rl-origem.
    # relatorio.js traz das abas os trechos que o modelo pede e descarta o resto; os scripts são os mesmos do site,
    # sem a troca de abas e sem a releitura ao vivo da B3, para o PDF sair igual aos dados gravados.
    guardadas = '\n\n'.join('<div class="di-page vc-painel" id="%s">\n%s\n</div>' % (i, P(arq).strip('\n')) for i, t, arq in ABAS)
    cabeca_rl = '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<title>Relatório diário Vera Cruz</title>\n<link rel="stylesheet" href="%s">\n' % FONTES
    scripts_rl = scripts[:scripts.rindex('<script>\n' + abas_js)].replace('<script>\n' + shim, '<script>\nwindow.VC_ESTATICO = true;\nwindow.VC_ENDERECO = %s;\n</script>\n<script>\n' % json.dumps(ENDERECO) + shim, 1)
    html_final = (cabeca_rl + '<style>\n' + sem_regras_do_site(P('estilo.css')) + P('relatorio.css') + '</style>\n</head>\n<body>\n' + P('relatorio.html')
                  + '<div id="rl-origem" hidden>\n' + guardadas + '\n</div>\n' + scripts_rl + '<script>\n' + P('relatorio.js') + '\n</script>\n</body>\n</html>\n')
open(out, 'w', encoding='utf-8').write(html_final)
print(len(html_final), 'bytes;', len(json.dumps(dados, ensure_ascii=False, separators=(',', ':'))), 'de dados')
