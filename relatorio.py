# Gera o Daily Market Briefing, o relatório diário em PDF (site/relatorio-diario.pdf), com os dados gravados em site/index.html.
# Uso: python3 relatorio.py [forcar]
#
# Roda depois do atualizador. Sem "forcar", só gera em dia útil, com a seleção de notícias de hoje já montada, as cotações
# de hoje da B3 já gravadas (DI e Ibovespa) e a edição de hoje ainda por fazer: na prática, uma vez por dia, na primeira
# rodada depois da abertura do pregão; se ela falhar, a rodada seguinte gera. Em feriado sem pregão não há edição.
# O PDF é a impressão, pelo Chrome, do documento que build_dashboard.py monta no modo "relatorio": os números e os
# gráficos saem do mesmo código do site. Antes de publicar, o arquivo é conferido; se algo falhar, a edição anterior fica.
# Imprime "RELATORIO: gerado ...", "RELATORIO: nada a fazer ..." ou "RELATORIO: falhou ..." (e, na falha, sai com erro).
#
# Variáveis opcionais: CHROME (caminho do navegador) e RELATORIO_D3 (cópia local do d3, para montar sem acesso ao cdnjs).
import json, os, re, shutil, subprocess, sys
from datetime import datetime, timezone, timedelta

BRT = timezone(timedelta(hours=-3))
PAGINA, PDF, FICHA = 'site/index.html', 'site/relatorio-diario.pdf', 'site/relatorio.json'
FONTE, PROVA = 'site/.relatorio.html', 'site/.relatorio.pdf'   # arquivos de trabalho, apagados no fim
MESES = 'janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro'.split()
D3 = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js'


def falha(motivo):
    print('RELATORIO: falhou: ' + motivo)
    sys.exit(1)


def imprimir(navegador):
    comando = [navegador, '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-pdf-header-footer',
               '--virtual-time-budget=30000', '--print-to-pdf=' + os.path.abspath(PROVA), 'file://' + os.path.abspath(FONTE)]
    try:
        r = subprocess.run(comando, capture_output=True, text=True, timeout=150)
    except subprocess.TimeoutExpired:
        falha('o navegador nao terminou a impressao em 150 segundos')
    if r.returncode != 0 or not os.path.exists(PROVA):
        falha('o navegador nao gerou o PDF (%s)' % (r.stderr.strip().splitlines() or ['sem mensagem'])[-1][:200])


def ler_resumo(navegador):
    # Resumo da edição (frase de abertura, destaques e manchetes) para o email do dia: o documento o deixa pronto num bloco
    # próprio, e aqui o navegador devolve a página já desenhada. Se não der para ler, o relatório sai do mesmo jeito, sem o resumo.
    try:
        r = subprocess.run([navegador, '--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=30000', '--dump-dom',
                            'file://' + os.path.abspath(FONTE)], capture_output=True, text=True, timeout=150)
        bloco = re.search(r'<script type="application/json" id="rl-resumo-email">(.*?)</script>', r.stdout, re.S)
        resumo = json.loads(bloco.group(1))
        if not resumo.get('resumo') or len(resumo.get('destaques') or []) < 4 or 'indispon' in resumo['resumo']: return None
        return resumo
    except Exception:
        return None


def conferir(dados, edicao):
    # O arquivo só é publicado se tiver tamanho e número de páginas plausíveis e trouxer o que um relatório completo traz.
    tamanho = os.path.getsize(PROVA)
    if not 40000 <= tamanho <= 6000000: falha('PDF com tamanho fora do esperado (%d bytes)' % tamanho)
    info = subprocess.run(['pdfinfo', PROVA], capture_output=True, text=True).stdout
    paginas = int((re.search(r'^Pages:\s+(\d+)', info, re.M) or [0, 0])[1])
    if not 2 <= paginas <= 30: falha('PDF com %d paginas' % paginas)
    texto = re.sub(r'\s+', ' ', subprocess.run(['pdftotext', '-layout', PROVA, '-'], capture_output=True, text=True).stdout)
    if 'RELATORIO-INCOMPLETO' in texto: falha('o documento saiu incompleto (biblioteca de calculo ou resumo de mercado)')
    ano, mes, dia = (int(x) for x in edicao.split('-'))
    esperado = ['Daily Market Briefing', 'Resumo de mercado', 'Notícias e inteligência de mercado', 'maiores altas e baixas', 'Notas e fontes', 'Página 1 de %d' % paginas, '%d de %s de %d' % (dia, MESES[mes - 1], ano)]
    faltam = [t for t in esperado if t not in texto]
    if faltam: falha('faltou no PDF: ' + '; '.join(faltam))
    titulos = [n['titulo'] for n in dados.get('noticias', [])]
    # As notícias saem em duas colunas: o texto corrido (sem -layout) mantém cada título inteiro.
    corrido = re.sub(r'\s+', ' ', subprocess.run(['pdftotext', PROVA, '-'], capture_output=True, text=True).stdout)
    achados = sum(1 for t in titulos if re.sub(r'\s+', ' ', t)[:28] in corrido or re.sub(r'\s+', ' ', t)[:28] in texto)
    if titulos and achados < len(titulos) * 0.8: falha('so %d das %d noticias apareceram no PDF' % (achados, len(titulos)))   # o relatório traz todas
    return paginas, tamanho


def main():
    forcar = len(sys.argv) > 1 and sys.argv[1] == 'forcar'
    pagina = open(PAGINA, encoding='utf-8').read()
    dados = json.loads(re.search(r'^\s*const DADOS = (\{.*\});[ \t]*$', pagina, re.M).group(1))
    montagem = ((dados.get('noticias_montagem') or [{}])[0].get('montada_em') or '')[:10]
    hoje = datetime.now(BRT).strftime('%Y-%m-%d')
    try: ficha = json.load(open(FICHA, encoding='utf-8'))
    except Exception: ficha = {}
    if not re.match(r'\d{4}-\d{2}-\d{2}$', montagem): falha('a pagina nao tem selecao de noticias')
    if not forcar:
        agora = datetime.now(BRT)
        de_hoje = lambda chave, campo: str((dados.get(chave) or [{}])[0].get(campo, ''))[:10] == hoje
        di, ibovespa = de_hoje('di1', 'cotacao_em'), de_hoje('br_ibov', 'cotado_em')
        if agora.weekday() >= 5:
            print('RELATORIO: nada a fazer; o relatorio sai so em dia util'); return
        if ficha.get('edicao') == hoje and os.path.exists(PDF):
            print('RELATORIO: nada a fazer; a edicao de hoje ja existe'); return
        if montagem != hoje:
            print('RELATORIO: nada a fazer; a selecao de noticias de hoje ainda nao foi montada'); return
        # A edição sai com as cotações do dia: DI e Ibovespa de hoje. Depois das 11h basta uma das duas, para uma fonte fora do ar
        # não segurar o relatório; sem nenhuma (feriado, ou B3 sem responder), não há edição.
        if not (di and ibovespa) and not ((di or ibovespa) and agora.hour >= 11):
            print('RELATORIO: nada a fazer; a B3 ainda nao tem as cotacoes de hoje (DI: %s; Ibovespa: %s)' % ('sim' if di else 'nao', 'sim' if ibovespa else 'nao')); return

    navegador = os.environ.get('CHROME') or next((c for c in map(shutil.which, ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) if c), None)
    if not navegador: falha('nenhum navegador Chrome ou Chromium encontrado')
    try:
        r = subprocess.run([sys.executable, 'build_dashboard.py', PAGINA, FONTE, 'relatorio'], capture_output=True, text=True)
        if r.returncode != 0: falha('a montagem do documento falhou (%s)' % (r.stderr.strip().splitlines() or ['sem mensagem'])[-1][:200])
        if os.environ.get('RELATORIO_D3'):
            html = open(FONTE, encoding='utf-8').read()
            open(FONTE, 'w', encoding='utf-8').write(html.replace(D3, 'file://' + os.path.abspath(os.environ['RELATORIO_D3'])))
        imprimir(navegador)
        paginas, tamanho = conferir(dados, montagem)
        resumo = ler_resumo(navegador)
        os.replace(PROVA, PDF)
        ficha = {'edicao': montagem, 'gerado_em': datetime.now(BRT).strftime('%Y-%m-%dT%H:%M:%S-03:00'), 'paginas': paginas, 'bytes': tamanho}
        if resumo: ficha.update(resumo)
        json.dump(ficha, open(FICHA, 'w', encoding='utf-8'), ensure_ascii=False)
        open(FICHA, 'a', encoding='utf-8').write('\n')
        print('RELATORIO: gerado; edicao de %s, %d paginas, %d KB%s' % (montagem, paginas, round(tamanho / 1024), '' if resumo else '; sem o resumo para o email'))
    finally:
        for arquivo in (FONTE, PROVA):
            if os.path.exists(arquivo): os.remove(arquivo)


main()
