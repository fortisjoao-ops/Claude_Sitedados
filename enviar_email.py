# Envia por email, pelo Brevo, a edição do dia do relatório diário para a lista de inscritos.
# Uso: python3 enviar_email.py
#
# Roda depois de o relatório ser gravado no repositório. Só envia quando a edição publicada é a de hoje, a ficha dela
# (site/relatorio.json) traz o resumo e o Brevo ainda não tem a campanha do dia. A campanha leva a data no nome, e é por
# esse nome que a rotina sabe se já enviou: rodar de novo no mesmo dia não manda o email duas vezes. Antes de enviar,
# espera o site servir a edição nova, para o link do email não abrir o PDF de ontem.
# Imprime "EMAIL: enviado ...", "EMAIL: nada a fazer ..." ou "EMAIL: falhou ..." (e, na falha, sai com erro).
#
# Variáveis de ambiente:
#   BREVO_KEY    chave da API do Brevo (segredo do GitHub; nunca em arquivo). Sem ela, não faz nada.
#   BREVO_LISTA  número da lista de inscritos no Brevo. Sem ele, não faz nada.
#   EMAIL_MODO   "rascunho": cria a campanha do dia no Brevo sem enviar, para conferir o email na conta.
#   BREVO_API    endereço da API, para teste (o padrão é o do Brevo).
import html, json, os, re, sys, time, urllib.error, urllib.request
from datetime import datetime, timezone, timedelta

BRT = timezone(timedelta(hours=-3))
FICHA = 'site/relatorio.json'
REMETENTE = {'name': 'Vera Cruz', 'email': 'contato@veracruzasset.com.br'}
API = (os.environ.get('BREVO_API') or 'https://api.brevo.com/v3').rstrip('/')
DIAS = 'segunda-feira terça-feira quarta-feira quinta-feira sexta-feira sábado domingo'.split()
MESES = 'janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro'.split()
NAVY, TINTA, TINTA2, TINTA3, LINHA, PAPEL = '#1C466C', '#17202A', '#46505B', '#656C74', '#D6D1C6', '#F5F3EE'
SERIFA = "Georgia, 'Times New Roman', serif"
SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif"


def falha(motivo):
    print('EMAIL: falhou: ' + motivo)
    sys.exit(1)


def endereco_do_site():
    # O endereço público fica num lugar só: no começo de build_dashboard.py.
    m = re.search(r"^ENDERECO = '(https://[^']+)'", open('build_dashboard.py', encoding='utf-8').read(), re.M)
    if not m: falha('endereco do site nao encontrado em build_dashboard.py')
    return m.group(1)


def brevo(metodo, caminho, corpo=None, tolerar=()):
    # Devolve (código, resposta em JSON ou None). Erros de rede e respostas que não sejam 2xx encerram a rotina sem enviar,
    # a não ser os códigos em "tolerar", que voltam para quem chamou decidir.
    dados = json.dumps(corpo).encode('utf-8') if corpo is not None else None
    pedido = urllib.request.Request(API + caminho, data=dados, method=metodo,
                                    headers={'api-key': os.environ['BREVO_KEY'], 'accept': 'application/json', 'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(pedido, timeout=40) as r:
            texto = r.read().decode('utf-8', 'replace')
            return r.status, (json.loads(texto) if texto.strip() else None)
    except urllib.error.HTTPError as e:
        detalhe = e.read().decode('utf-8', 'replace')[:300].replace('\n', ' ')
        if e.code in tolerar: return e.code, {'message': detalhe}
        falha('o Brevo respondeu %d em %s %s (%s)' % (e.code, metodo, caminho.split('?')[0], detalhe))
    except Exception as e:
        falha('sem resposta do Brevo em %s %s (%s)' % (metodo, caminho.split('?')[0], type(e).__name__))


def esperar_o_site(site, edicao, gerado_em, minutos=8):
    # O site só serve a edição nova depois que o Netlify publica o commit da rodada. Sem isso, o email não sai.
    # Confere também o horário de geração: numa edição refeita no mesmo dia, a data sozinha já bateria com a versão antiga.
    fim = time.time() + minutos * 60
    while True:
        try:
            pedido = urllib.request.Request(site + 'relatorio.json?t=%d' % time.time(), headers={'user-agent': 'curva-dashboard-updater/1.0', 'cache-control': 'no-cache'})
            with urllib.request.urlopen(pedido, timeout=20) as r:
                no_site = json.loads(r.read().decode('utf-8'))
                if no_site.get('edicao') == edicao and no_site.get('gerado_em') == gerado_em: return
        except Exception:
            pass
        if time.time() > fim: falha('o site ainda nao serve a edicao de %s; o email fica para a proxima rodada' % edicao)
        time.sleep(15)


def montar_email(ficha, site):
    # Email em tabelas e estilos embutidos, que é o que os programas de email entendem. Os números vêm prontos da ficha.
    e = lambda t: html.escape(str(t), quote=True)
    ano, mes, dia = (int(x) for x in ficha['edicao'].split('-'))
    quando = datetime(ano, mes, dia)
    data_longa = '%s, %d de %s de %d' % (DIAS[quando.weekday()], dia, MESES[mes - 1], ano)
    pdf = '%srelatorio-diario.pdf?e=%s' % (site, ficha['edicao'])
    rotulo = "font-family:%s;font-size:11px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;color:%s;" % (SANS, TINTA2)

    def destaque(d):
        return ('<td width="50%%" valign="top" style="padding:14px 12px 14px 0;border-top:1px solid %s;">'
                '<div style="%s">%s</div>'
                '<div style="font-family:%s;font-size:26px;line-height:32px;color:%s;">%s</div>'
                '<div style="font-family:%s;font-size:13px;line-height:19px;color:%s;">%s</div>'
                '<div style="font-family:%s;font-size:12px;line-height:18px;color:%s;">%s</div></td>'
                % (TINTA, rotulo, e(d.get('rotulo', '')), SERIFA, TINTA, e(d.get('valor', '')), SANS, TINTA2, e(d.get('nota', '')), SANS, TINTA3, e(d.get('ref', ''))))
    destaques = ficha.get('destaques') or []
    linhas = ''.join('<tr>%s%s</tr>' % (destaque(destaques[i]), destaque(destaques[i + 1]) if i + 1 < len(destaques) else '<td width="50%"></td>')
                     for i in range(0, len(destaques), 2))

    manchetes = ''.join(
        '<tr><td style="padding:12px 0;border-top:1px solid %s;">'
        '<div style="%s">%s · %s</div>'
        '<a href="%s" style="font-family:%s;font-size:18px;line-height:24px;color:%s;text-decoration:none;">%s</a></td></tr>'
        % (LINHA, rotulo, e(m['secao']), e(m['fonte']), e(m['link']), SERIFA, TINTA, e(m['titulo']))
        for m in (ficha.get('manchetes') or []) if re.match(r'https://', str(m.get('link', ''))))
    bloco_manchetes = ('<tr><td style="padding:34px 0 8px;font-family:%s;font-size:22px;line-height:28px;color:%s;">Manchetes</td></tr>%s'
                       '<tr><td style="padding:10px 0 0;border-top:1px solid %s;font-family:%s;font-size:12px;line-height:18px;color:%s;">'
                       'A primeira matéria de cada seção da seleção de notícias do dia. O título leva ao texto original.</td></tr>'
                       % (SERIFA, TINTA, manchetes, LINHA, SANS, TINTA3)) if manchetes else ''

    paginas = (', %d páginas' % int(ficha['paginas'])) if str(ficha.get('paginas', '')).isdigit() or isinstance(ficha.get('paginas'), int) else ''
    corpo = '''<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Market Briefing · Vera Cruz</title></head>
<body style="margin:0;padding:0;background:%(papel)s;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">%(resumo)s</div>
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background:%(papel)s;"><tr><td align="center" style="padding:0 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%%;max-width:600px;">
  <tr><td style="height:3px;line-height:3px;font-size:0;background:%(navy)s;">&nbsp;</td></tr>
  <tr><td style="padding:22px 0 18px;border-bottom:1px solid %(tinta)s;">
    <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="bottom"><a href="%(site)s"><img src="%(site)svera-cruz-logo.png" width="150" alt="Vera Cruz" style="display:block;border:0;width:150px;height:auto;"></a></td>
      <td valign="bottom" align="right" style="font-family:%(sans)s;font-size:12px;line-height:18px;color:%(tinta3)s;">
        <span style="letter-spacing:1.2px;text-transform:uppercase;color:%(tinta)s;">Daily Market Briefing</span><br>%(data)s</td>
    </tr></table></td></tr>
  <tr><td style="padding:34px 0 0;font-family:%(serifa)s;font-size:40px;line-height:44px;color:%(tinta)s;">Resumo do dia</td></tr>
  <tr><td style="padding:14px 0 0;font-family:%(serifa)s;font-size:19px;line-height:28px;color:%(tinta)s;">%(resumo)s</td></tr>
  <tr><td style="padding:26px 0 30px;">
    <a href="%(pdf)s" style="display:inline-block;padding:13px 22px;background:%(navy)s;font-family:%(sans)s;font-size:14px;line-height:18px;font-weight:bold;color:#ffffff;text-decoration:none;">Abrir o Daily Market Briefing em PDF</a>
    <div style="padding-top:10px;font-family:%(sans)s;font-size:12px;line-height:18px;color:%(tinta3)s;">Edição de %(data_curta)s%(paginas)s: resumo de mercado, agenda, notícias do dia com resumo e as maiores altas e baixas de ações e fundos imobiliários.</div></td></tr>
  <tr><td><table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0">%(linhas)s</table></td></tr>
  <tr><td style="padding:6px 0 0;border-top:1px solid %(tinta)s;font-family:%(sans)s;font-size:12px;line-height:18px;color:%(tinta3)s;">Cotações de bolsa, DI e dólar futuro de hoje, com os 15 minutos de atraso da B3. O que ainda não saiu hoje vem do último fechamento publicado; cada número traz a data do próprio dado.</td></tr>
  %(manchetes)s
  <tr><td style="padding:34px 0 0;font-family:%(sans)s;font-size:14px;line-height:22px;color:%(tinta)s;">Gráficos interativos, tabelas completas e séries históricas: <a href="%(site)s" style="color:%(navy)s;">%(site_curto)s</a></td></tr>
  <tr><td style="padding:30px 0 40px;"><div style="border-top:1px solid %(tinta)s;padding-top:14px;font-family:%(sans)s;font-size:12px;line-height:18px;color:%(tinta3)s;">
    Relatório informativo, montado automaticamente a partir de fontes públicas; não é recomendação de investimento.<br><br>
    Você recebe este email porque se inscreveu em %(site_curto)s para receber o Daily Market Briefing. Para sair da lista, <a href="{{ unsubscribe }}" style="color:%(tinta2)s;">cancele a inscrição</a>.</div></td></tr>
</table></td></tr></table>
</body>
</html>''' % {'papel': PAPEL, 'navy': NAVY, 'tinta': TINTA, 'tinta2': TINTA2, 'tinta3': TINTA3, 'serifa': SERIFA, 'sans': SANS, 'site': e(site),
              'site_curto': e(site.replace('https://', '').rstrip('/')), 'data': e(data_longa), 'data_curta': '%02d/%02d/%d' % (dia, mes, ano), 'paginas': paginas,
              'resumo': e(ficha['resumo']), 'pdf': e(pdf), 'linhas': linhas, 'manchetes': bloco_manchetes}
    assunto = 'Daily Market Briefing · Vera Cruz · %02d/%02d/%d' % (dia, mes, ano)
    return assunto, corpo


def main():
    chave, lista = os.environ.get('BREVO_KEY', '').strip(), os.environ.get('BREVO_LISTA', '').strip()
    rascunho = os.environ.get('EMAIL_MODO', '').strip() == 'rascunho'
    if not chave or not re.match(r'[1-9]\d*$', lista):
        print('EMAIL: nada a fazer; o envio nao esta configurado (%s)' % ('falta a chave do Brevo' if not chave else 'falta o numero da lista')); return
    try: ficha = json.load(open(FICHA, encoding='utf-8'))
    except Exception: ficha = {}
    hoje = datetime.now(BRT).strftime('%Y-%m-%d')
    edicao = str(ficha.get('edicao', ''))
    if edicao != hoje:
        print('EMAIL: nada a fazer; a edicao de hoje ainda nao foi gerada'); return
    if not ficha.get('resumo') or not ficha.get('destaques'):
        print('EMAIL: nada a fazer; a ficha da edicao de hoje nao traz o resumo'); return

    # A campanha do dia já existe? Enviada ou na fila: nada a fazer. Rascunho (de um teste, ou de um envio que parou no meio):
    # o conteúdo é trocado pelo desta edição antes de enviar; se o Brevo não aceitar a troca, sai uma campanha nova.
    nome = 'Relatório diário %s' % edicao
    codigo, resposta = brevo('GET', '/emailCampaigns?type=classic&limit=50&offset=0&sort=desc&excludeHtmlContent=true')
    if not isinstance(resposta, dict) or ('campaigns' not in resposta and resposta.get('count', 0) != 0):
        falha('nao foi possivel conferir as campanhas ja criadas no Brevo; nada foi enviado')
    do_dia = [c for c in (resposta.get('campaigns') or []) if str(c.get('name', '')).startswith(nome)]
    if any(c.get('status') != 'draft' for c in do_dia):
        print('EMAIL: nada a fazer; o email da edicao de %s ja foi enviado ou esta na fila' % edicao); return

    site = endereco_do_site()
    assunto, corpo = montar_email(ficha, site)
    pedido = {'subject': assunto, 'sender': REMETENTE, 'replyTo': REMETENTE['email'], 'previewText': ficha['resumo'][:180],
              'htmlContent': corpo, 'recipients': {'listIds': [int(lista)]}}
    campanha = None
    if do_dia:
        codigo, resposta = brevo('PUT', '/emailCampaigns/%s' % do_dia[0].get('id'), dict(pedido, name=do_dia[0].get('name')), tolerar=(400, 404, 405))
        if codigo < 300: campanha = do_dia[0].get('id')
        else: nome = '%s (%s)' % (nome, datetime.now(BRT).strftime('%Hh%M'))   # o rascunho antigo fica no Brevo, sem ser enviado
    if not campanha:
        codigo, resposta = brevo('POST', '/emailCampaigns', dict(pedido, name=nome), tolerar=(400,))
        if codigo == 400:
            # O Brevo não cria campanha para uma lista vazia: sem inscritos, não há email a mandar.
            if 'no contacts' in str((resposta or {}).get('message', '')).lower():
                print('EMAIL: nada a fazer; a lista ainda nao tem inscritos confirmados'); return
            falha('o Brevo recusou a campanha (%s)' % (resposta or {}).get('message', ''))
        campanha = (resposta or {}).get('id')
    if not campanha: falha('o Brevo nao devolveu o numero da campanha')
    if rascunho:
        print('EMAIL: rascunho pronto no Brevo (campanha %s, "%s"); nada foi enviado' % (campanha, nome)); return

    esperar_o_site(site, edicao, ficha.get('gerado_em'))
    brevo('POST', '/emailCampaigns/%s/sendNow' % campanha)
    print('EMAIL: enviado; edicao de %s, campanha %s' % (edicao, campanha))


if __name__ == '__main__':
    main()
