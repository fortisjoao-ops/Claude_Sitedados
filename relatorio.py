# Gera o relatório diário em PDF (site/relatorio-diario.pdf) com os dados gravados em site/index.html.
# Uso: python3 relatorio.py [forcar]
#
# Roda depois do atualizador. Sem "forcar", só gera quando a seleção de notícias de hoje já foi montada e a edição
# de hoje ainda não existe: na prática, uma vez por dia, na rodada da manhã; se ela falhar, a rodada seguinte gera.
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


def conferir(dados, edicao):
    # O arquivo só é publicado se tiver tamanho e número de páginas plausíveis e trouxer o que um relatório completo traz.
    tamanho = os.path.getsize(PROVA)
    if not 40000 <= tamanho <= 6000000: falha('PDF com tamanho fora do esperado (%d bytes)' % tamanho)
    info = subprocess.run(['pdfinfo', PROVA], capture_output=True, text=True).stdout
    paginas = int((re.search(r'^Pages:\s+(\d+)', info, re.M) or [0, 0])[1])
    if not 3 <= paginas <= 20: falha('PDF com %d paginas' % paginas)
    texto = re.sub(r'\s+', ' ', subprocess.run(['pdftotext', '-layout', PROVA, '-'], capture_output=True, text=True).stdout)
    if 'RELATORIO-INCOMPLETO' in texto: falha('a biblioteca de graficos nao carregou')
    ano, mes, dia = (int(x) for x in edicao.split('-'))
    esperado = ['Resumo do dia', 'Juros no Brasil', 'Notícias selecionadas', 'Sobre este relatório', '%d de %s de %d' % (dia, MESES[mes - 1], ano)]
    faltam = [t for t in esperado if t not in texto]
    if faltam: falha('faltou no PDF: ' + '; '.join(faltam))
    titulos = [n['titulo'] for n in dados.get('noticias', [])]
    achados = sum(1 for t in titulos if re.sub(r'\s+', ' ', t)[:28] in texto)
    if titulos and achados < len(titulos) * 0.6: falha('so %d das %d noticias apareceram no PDF' % (achados, len(titulos)))
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
        if montagem != hoje:
            print('RELATORIO: nada a fazer; a selecao de noticias de hoje ainda nao foi montada'); return
        if ficha.get('edicao') == hoje and os.path.exists(PDF):
            print('RELATORIO: nada a fazer; a edicao de hoje ja existe'); return

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
        os.replace(PROVA, PDF)
        json.dump({'edicao': montagem, 'gerado_em': datetime.now(BRT).strftime('%Y-%m-%dT%H:%M:%S-03:00'), 'paginas': paginas, 'bytes': tamanho},
                  open(FICHA, 'w', encoding='utf-8'), ensure_ascii=False)
        open(FICHA, 'a', encoding='utf-8').write('\n')
        print('RELATORIO: gerado; edicao de %s, %d paginas, %d KB' % (montagem, paginas, round(tamanho / 1024)))
    finally:
        for arquivo in (FONTE, PROVA):
            if os.path.exists(arquivo): os.remove(arquivo)


main()
