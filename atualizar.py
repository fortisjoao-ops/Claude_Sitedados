# Atualizador do dashboard Vera Cruz (abas: Curva DI Futuro, Juros EUA, Inflação BR, Ações BR, Notícias).
# Uso: python3 -I atualizar.py <pagina.html> <saida.html> [noticias]
#   - sem o terceiro argumento: atualiza os dados de mercado e mantém a seleção de notícias.
#   - com "noticias": atualiza tudo e monta de novo a seleção de notícias.
# Imprime UPDATED (e grava a saída) ou UNCHANGED (e não grava nada).
# Cada bloco falha sozinho: se uma fonte cai, o bloco anterior é mantido e o erro fica registrado em DADOS.status.
import sys, re, json, subprocess, tempfile, os, calendar, csv, html, unicodedata, base64, time
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import xml.etree.ElementTree as ET

UA = 'curva-dashboard-updater/1.0'
BRT = timezone(timedelta(hours=-3))

# ---------------------------------------------------------------- utilidades
def easter(y):
    a=y%19;b=y//100;c=y%100;d=b//4;e=b%4;f=(b+8)//25;g=(b-f+1)//3
    h=(19*a+b-d-g+15)%30;i=c//4;k=c%4;l=(32+2*e+2*i-h-k)%7;m=(a+11*h+22*l)//451
    return date(y,(h+l-7*m+114)//31,(h+l-7*m+114)%31+1)
def holidays(y):
    e=easter(y)
    return {date(y,1,1), e-timedelta(48), e-timedelta(47), e-timedelta(2), date(y,4,21), date(y,5,1),
            e+timedelta(60), date(y,9,7), date(y,10,12), date(y,11,2), date(y,11,15), date(y,11,20), date(y,12,25)}
HOL=set()
for y in range(2025,2050): HOL|=holidays(y)
def bd(d): return d.weekday()<5 and d not in HOL
def du(d0,d1):
    n=0;d=d0
    while d<d1:
        if bd(d): n+=1
        d+=timedelta(1)
    return n
def next_bd(d):
    d+=timedelta(1)
    while not bd(d): d+=timedelta(1)
    return d
def s(v): return None if v is None else str(v)
def curl(url,out,timeout=280,data=None,headers=()):
    cmd=['curl','-sS','-L','-m',str(timeout),'-A',UA,'-o',out,'-w','%{http_code}']
    for h in headers: cmd+=['-H',h]
    if data is not None: cmd+=['-d',data]
    r=subprocess.run(cmd+[url],capture_output=True,text=True)
    return r.stdout.strip()[-3:]
def baixar(url,out,timeout=120,**kw):
    code=''
    for tentativa in range(3):
        code=curl(url,out,timeout,**kw)
        if code=='200' and os.path.exists(out) and os.path.getsize(out)>0: return out
        if code in ('401','403','404','429'): break   # recusa da fonte: nao insistir
        time.sleep(2+3*tentativa)
    raise RuntimeError('%s respondeu %s'%(url.split('/')[2],code or 'sem resposta'))
def meses_antes(d,n):
    y,m=d.year,d.month-n
    while m<=0: y,m=y-1,m+12
    return date(y,m,min(d.day,calendar.monthrange(y,m)[1]))
def agora_br(): return datetime.now(BRT).replace(microsecond=0)

# Historico diario: cada bloco deixa aqui o que leu (por data), e o fim da rodada acrescenta ao arquivo indicado em HISTORICO.
HIST={'di':{},'ntnb':{},'ust':{}}
UST_ANO_ANTERIOR=False   # vira True quando o arquivo de historico ainda tem poucos dias de Treasuries

# ---------------------------------------------------------------- Curva DI (B3)
def quotes(tmp):
    path=os.path.join(tmp,'di1.json')
    code=curl('https://cotacao.b3.com.br/mds/api/v1/DerivativeQuotation/DI1',path,60)
    if code!='200': raise RuntimeError('cotacao.b3.com.br respondeu '+code)
    d=json.load(open(path))
    if d['BizSts']['cd']!='OK': raise RuntimeError('B3 sem cotacoes: '+str(d['BizSts']))
    stamp=d['Msg']['dtTm']; today=date.fromisoformat(stamp[:10]); iso=stamp.replace(' ','T')+'-03:00'
    rows=[]
    for x in d['Scty']:
        if x['mkt']['cd']!='FUT': continue
        q=x.get('SctyQtn',{}); a=x['asset']['AsstSummry']; mat=date.fromisoformat(a['mtrtyCode'])
        bid=x.get('buyOffer',{}).get('price'); ask=x.get('sellOffer',{}).get('price'); last=q.get('curPrc')
        if bid is not None and ask is not None: taxa=round((bid+ask)/2,4); orig='media compra/venda'
        elif last is not None: taxa=last; orig='ultimo negocio'
        else: continue
        n=du(today,mat)
        if n<=0 or q.get('prvsDayAdjstmntPric') is None: continue
        rows.append(dict(ticker=x['symb'],vencimento=mat.isoformat(),du=n,taxa=taxa,origem_taxa=orig,ultimo=last,compra=bid,venda=ask,
            ajuste_ant=q.get('prvsDayAdjstmntPric'),negociados=a.get('traddCtrctsQty') or 0,em_aberto=a.get('opnCtrcts'),cotacao_em=iso))
    rows.sort(key=lambda r:r['du'])
    keep=[]
    for r in rows:
        keep.append(r)
        if r['du']>=5*252: break
    if len(keep)<20 or keep[-1]['du']<5*252 or not all(0<r['taxa']<60 for r in keep): raise RuntimeError('cotacoes incompletas ou fora do esperado')
    ant=today-timedelta(1)
    while not bd(ant): ant-=timedelta(1)
    longos=[dict(ticker=r['ticker'],vencimento=r['vencimento'],du=s(r['du']),taxa=s(r['taxa']),ajuste_ant=s(r['ajuste_ant']),data_ajuste_ant=ant.isoformat(),
        ultimo=s(r['ultimo']),compra=s(r['compra']),venda=s(r['venda']),negociados=s(r['negociados'])) for r in rows]
    # ajuste oficial do pregao anterior, com os dias uteis contados a partir daquele pregao
    HIST['di'][ant.isoformat()]=[[r['vencimento'],du(ant,date.fromisoformat(r['vencimento'])),r['ajuste_ant']] for r in rows]
    return today,[{k:s(v) for k,v in r.items()} for r in keep],longos

MONTH=dict(zip('FGHJKMNQUVXZ',range(1,13)))
def maturity(t):
    d=date(2000+int(t[4:6]),MONTH[t[3]],1)
    while not bd(d): d+=timedelta(1)
    return d
def num(t): return None if t=='-' else float(t.replace('.','').replace(',','.'))
def three_months_before(d):
    t=meses_antes(d,3)
    while not bd(t): t-=timedelta(1)
    return t
def settlement(ref,tmp):
    # Boletim Diário do Mercado da B3, capítulo "Derivativos de bolsa", tabela "Negócios consolidados do pregão".
    pdf=os.path.join(tmp,'bdi.pdf'); txt=os.path.join(tmp,'bdi.txt')
    code=curl('https://arquivos.b3.com.br/bdi/download/bdi/%s/BDI_03-4_%s.pdf'%(ref.isoformat(),ref.strftime('%Y%m%d')),pdf)
    if code!='200': raise RuntimeError('boletim de %s respondeu %s'%(ref,code))
    subprocess.run(['pdftotext','-layout',pdf,txt],check=True)
    rows={}
    for line in open(txt,encoding='utf-8',errors='replace'):
        m=re.match(r'^(DI1[FGHJKMNQUVXZ]\d\d)\s+(BR\w+)\s+FINANCIAL\s+(.*)$',line)
        if not m: continue
        tok=m.group(3).split()
        if len(tok)<9: continue
        try: pu,taxa=num(tok[6]),num(tok[7])
        except ValueError: continue
        if pu is None or taxa is None: continue
        t=m.group(1); mat=maturity(t); n=du(ref,mat)
        if n<=0: continue
        if abs(((100000/pu)**(252/n)-1)*100-taxa)>0.01: raise RuntimeError('taxa de ajuste nao confere com o PU em '+t)
        rows[t]=dict(ticker=t,vencimento=mat.isoformat(),du=n,taxa_ajuste=taxa,pu_ajuste=pu,data_ref=ref.isoformat())
    rows=sorted(rows.values(),key=lambda r:r['du']); keep=[]
    for r in rows:
        keep.append(r)
        if r['du']>=5*252: break
    if len(keep)<20 or keep[-1]['du']<5*252: raise RuntimeError('boletim de %s sem contratos DI1 suficientes'%ref)
    longos=[dict(ticker=r['ticker'],vencimento=r['vencimento'],du=s(r['du']),taxa_ajuste=s(r['taxa_ajuste']),data_ref=r['data_ref']) for r in rows]
    return [{k:s(v) for k,v in r.items()} for r in keep],longos

def copom_novas(dados,notes):
    # Datas novas de decisao do Copom chegam pela variavel COPOM_ADICIONAR (AAAA-MM-DD separadas por virgula), depois de conferidas no site do Banco Central.
    pedido=[x.strip() for x in os.environ.get('COPOM_ADICIONAR','').split(',') if x.strip()]
    if not pedido: return
    tem={r['data'] for r in dados.get('copom',[])}; hoje=agora_br().date(); novas=[]
    for x in pedido:
        d=date.fromisoformat(x)
        if d.weekday()!=2: raise RuntimeError('data do Copom que nao cai numa quarta-feira: '+x)
        if not hoje<d<=date(hoje.year+2,12,31): raise RuntimeError('data do Copom fora do intervalo esperado: '+x)
        if x not in tem: novas.append(x)
    if len(novas)>9: raise RuntimeError('datas demais do Copom de uma vez')
    if novas:
        dados['copom']=sorted(dados.get('copom',[])+[{'data':x} for x in novas],key=lambda r:r['data'])
        notes.append('Copom: %d reunioes novas (%s)'%(len(novas),', '.join(novas)))
def bloco_curva_di(dados,tmp,notes):
    try: copom_novas(dados,notes)
    except Exception as e: notes.append('Copom NAO alterado (%s)'%str(e)[:90])
    today,novo,longos=quotes(tmp)
    if longos!=dados.get('di1_longo'): dados['di1_longo']=longos
    strip=lambda rows:[{k:v for k,v in r.items() if k!='cotacao_em'} for r in rows]
    if strip(novo)!=strip(dados['di1']):
        dados['di1']=novo; notes.append('cotacoes DI de '+novo[0]['cotacao_em'])
    # CDI vigente: a taxa do primeiro vertice, quando ele vence antes de a proxima decisao do Copom entrar em vigor.
    vig=sorted(next_bd(date.fromisoformat(r['data'])) for r in dados.get('copom',[]))
    futuras=[v for v in vig if v>today]
    if not futuras or int(novo[0]['du'])<=du(today,futuras[0]):
        if not dados.get('cdi_base') or dados['cdi_base'][0]['taxa']!=novo[0]['taxa']:
            dados['cdi_base']=[{'taxa':novo[0]['taxa'],'em':today.isoformat()}]; notes.append('CDI base '+novo[0]['taxa'])
    alvo=three_months_before(today)
    if dados['di1_3m'][0]['data_ref']!=alvo.isoformat() or not dados.get('di1_3m_longo'):
        try:
            dados['di1_3m'],dados['di1_3m_longo']=settlement(alvo,tmp); notes.append('curva de 3 meses atras de '+alvo.isoformat())
        except Exception as e:
            notes.append('curva de 3 meses atras mantida em %s (%s)'%(dados['di1_3m'][0]['data_ref'],e))

# ---------------------------------------------------------------- NTN-B (Tesouro Direto)
TD_URL='https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv'
TD_TIPOS={'Tesouro IPCA+ com Juros Semestrais':'NTN-B','Tesouro IPCA+':'NTN-B Principal'}
def dmy(t): return date(int(t[6:10]),int(t[3:5]),int(t[0:2]))
def brnum(t):
    t=(t or '').strip()
    return None if t=='' else float(t.replace('.','').replace(',','.'))
def bloco_ntnb(dados,tmp,notes):
    path=baixar(TD_URL,os.path.join(tmp,'td.csv'),300)
    corte=date.today()-timedelta(days=400)
    por={}; datas=set()
    with open(path,encoding='latin-1',newline='') as f:
        rd=csv.reader(f,delimiter=';'); cab=next(rd)
        if cab[:3]!=['Tipo Titulo','Data Vencimento','Data Base'] or 'PU Base Manha' not in cab: raise RuntimeError('layout do arquivo do Tesouro Direto mudou')
        ipu=cab.index('PU Base Manha'); itx=cab.index('Taxa Venda Manha')
        for r in rd:
            if len(r)<=ipu or r[0] not in TD_TIPOS: continue
            d=dmy(r[2])
            if d<corte: continue
            pu=brnum(r[ipu])
            if not pu: continue
            por.setdefault((TD_TIPOS[r[0]],dmy(r[1]).isoformat()),{})[d]=(pu,brnum(r[itx]))
            datas.add(d)
    if len(datas)<3: raise RuntimeError('arquivo do Tesouro Direto sem datas recentes')
    for (titulo,venc),serie in por.items():
        for d,(pu,taxa) in serie.items():
            if taxa is not None: HIST['ntnb'].setdefault(d.isoformat(),{})[titulo+' '+venc]=taxa
    ref=max(datas); ant=max(d for d in datas if d<ref)
    alvo=meses_antes(ref,3); anteriores=[d for d in datas if d<=alvo]
    d3=max(anteriores) if anteriores else None
    linhas=[]
    for (titulo,venc),serie in sorted(por.items(),key=lambda kv:(kv[0][0],kv[0][1])):
        if ref not in serie: continue
        pu,taxa=serie[ref]
        linhas.append(dict(chave=titulo+' '+venc,titulo=titulo,vencimento=venc,data_ref=ref.isoformat(),pu=s(pu),taxa_venda=s(taxa),
            data_ant=ant.isoformat(),pu_ant=s(serie[ant][0]) if ant in serie else None,taxa_ant=s(serie[ant][1]) if ant in serie else None,
            taxa_3m=s(serie[d3][1]) if d3 and d3 in serie else None,
            data_alvo_3m=alvo.isoformat(),data_3m=d3.isoformat() if d3 else None,pu_3m=s(serie[d3][0]) if d3 and d3 in serie else None))
    if not linhas: raise RuntimeError('nenhuma NTN-B na data de referencia')
    if linhas!=dados.get('ntnb'): dados['ntnb']=linhas; notes.append('NTN-B de '+ref.isoformat())

# ---------------------------------------------------------------- Juros EUA
def bloco_fed_funds(dados,tmp,notes):
    d=json.load(open(baixar('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/2.json',os.path.join(tmp,'effr.json'),60)))
    linhas=[dict(data=r['effectiveDate'],effr=s(r['percentRate']),alvo_min=s(r['targetRateFrom']),alvo_max=s(r['targetRateTo'])) for r in d['refRates']]
    if not linhas: raise RuntimeError('NY Fed sem dados')
    if linhas!=dados.get('eua_fed'): dados['eua_fed']=linhas; notes.append('Fed funds de '+linhas[0]['data'])

UST_URL='https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/%d/all?type=%s&field_tdr_date_value=%d&page&_format=csv'
ANOS={'1 Mo':1/12,'1.5 Month':0.125,'2 Mo':2/12,'3 Mo':0.25,'4 Mo':4/12,'6 Mo':0.5,'1 Yr':1,'2 Yr':2,'3 Yr':3,'5 Yr':5,'7 Yr':7,'10 Yr':10,'20 Yr':20,'30 Yr':30,
       '5 YR':5,'7 YR':7,'10 YR':10,'20 YR':20,'30 YR':30}
def tesouro_eua(tmp,tipo,ano):
    serie={}
    with open(baixar(UST_URL%(ano,tipo,ano),os.path.join(tmp,'%s_%d.csv'%(tipo,ano)),90),encoding='utf-8-sig',newline='') as f:
        rd=csv.reader(f); cab=next(rd)
        if cab[0]!='Date': raise RuntimeError('layout do Tesouro americano mudou')
        for r in rd:
            if not r or not re.match(r'\d\d/\d\d/\d{4}$',r[0]): continue
            d=date(int(r[0][6:]),int(r[0][:2]),int(r[0][3:5]))
            serie[d]={cab[i]:float(r[i]) for i in range(1,len(cab)) if i<len(r) and r[i].strip() not in ('','N/A') and cab[i] in ANOS}
    return serie
def curvas_eua(tmp,tipo):
    hoje=date.today(); serie=tesouro_eua(tmp,tipo,hoje.year)
    if len(serie)<2 or meses_antes(hoje,3).year<hoje.year or (UST_ANO_ANTERIOR and tipo=='daily_treasury_yield_curve'): serie.update(tesouro_eua(tmp,tipo,hoje.year-1))
    if tipo=='daily_treasury_yield_curve':
        for d,curva in serie.items(): HIST['ust'][d.isoformat()]=dict(curva)
    datas=sorted(serie); ref=datas[-1]; ant=datas[-2]
    alvo=meses_antes(ref,3); d3=max([d for d in datas if d<=alvo],default=None)
    linhas=[]
    for papel,d in (('ref',ref),('ant',ant),('3m',d3)):
        if d is None: continue
        for prazo,taxa in serie[d].items():
            linhas.append(dict(chave=papel+' '+prazo,papel=papel,data=d.isoformat(),prazo=prazo,anos=s(round(ANOS[prazo],4)),taxa=s(taxa)))
    return ref,linhas
def bloco_treasuries(dados,tmp,notes):
    ref,nominal=curvas_eua(tmp,'daily_treasury_yield_curve')
    if nominal!=dados.get('eua_ust'): dados['eua_ust']=nominal; notes.append('Treasuries de '+ref.isoformat())
    ref,real=curvas_eua(tmp,'daily_treasury_real_yield_curve')
    if real!=dados.get('eua_real'): dados['eua_real']=real; notes.append('TIPS de '+ref.isoformat())

MESES_EN={m:i for i,m in enumerate(['January','February','March','April','May','June','July','August','September','October','November','December'],1)}
MESES_EN.update({m[:3]:i for m,i in list(MESES_EN.items())})
def bloco_fomc(dados,tmp,notes):
    h=open(baixar('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',os.path.join(tmp,'fomccal.htm'),90),encoding='utf-8',errors='replace').read()
    marcas=[(m.start(),int(m.group(1))) for m in re.finditer(r'(20\d\d) FOMC Meetings',h)]
    posicoes=sorted(p for p,_ in marcas)
    reunioes=[]
    for pos,ano in marcas:
        if ano<date.today().year: continue
        fim=min([p for p in posicoes if p>pos],default=len(h)); seg=h[pos:fim]
        meses=re.findall(r'fomc-meeting__month[^>]*>\s*(?:<strong>)?\s*([^<]+)',seg)
        dias=re.findall(r'fomc-meeting__date[^>]*>\s*([^<]+)',seg)
        for mes,dia in zip(meses,dias):
            mes=mes.strip(); dia=dia.strip()
            if re.search(r'notation|unscheduled|cancel',dia,re.I): continue
            nums=re.findall(r'\d+',dia)
            nome=mes.split('/')[-1].strip()
            if not nums or nome not in MESES_EN: continue
            reunioes.append(dict(data=date(ano,MESES_EN[nome],int(nums[-1])).isoformat(),sep='*' in dia))
    reunioes.sort(key=lambda r:r['data'])
    if len(reunioes)<4: raise RuntimeError('calendario do FOMC nao reconhecido')
    if reunioes!=dados.get('eua_fomc'): dados['eua_fomc']=reunioes; notes.append('calendario do FOMC')
    proj=sorted(set(re.findall(r'fomcprojtabl(\d{8})\.htm',h)))
    if not proj: raise RuntimeError('link das projecoes do Fed nao encontrado')
    ult=proj[-1]; reuniao='%s-%s-%s'%(ult[:4],ult[4:6],ult[6:])
    if dados.get('eua_dots') and dados['eua_dots'][0].get('reuniao')==reuniao: return
    pg=open(baixar('https://www.federalreserve.gov/monetarypolicy/fomcprojtabl%s.htm'%ult,os.path.join(tmp,'sep.htm'),90),encoding='utf-8',errors='replace').read()
    dots=None
    for t in re.findall(r'<table.*?</table>',pg,re.S):
        if 'Midpoint of target range' not in t: continue
        linhas=[[html.unescape(re.sub(r'<[^>]+>','',c)).strip() for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>',tr,re.S)] for tr in re.findall(r'<tr.*?</tr>',t,re.S)]
        cab=next((l for l in linhas if any(re.fullmatch(r'20\d\d',c) for c in l)),None)
        if not cab: continue
        colunas=[c for c in cab if re.fullmatch(r'20\d\d',c) or c.lower().startswith('longer')]
        dots=[]
        for l in linhas:
            if not l or not re.fullmatch(r'\d+\.\d+',l[0]): continue
            cont=l[1:]
            for i,col in enumerate(colunas):
                if i<len(cont) and re.fullmatch(r'\d+',cont[i]):
                    dots.append(dict(chave=('longo' if col.lower().startswith('longer') else col)+' '+l[0],reuniao=reuniao,
                        ano='Longo prazo' if col.lower().startswith('longer') else col,taxa=l[0],participantes=cont[i]))
        break
    if not dots: raise RuntimeError('tabela do dot plot nao reconhecida')
    dados['eua_dots']=dots; notes.append('dot plot de '+reuniao)

CODIGO_MES='FGHJKMNQUVXZ'
def bloco_futuros_fed(dados,tmp,notes):
    # O Yahoo limita pedidos seguidos (429): os contratos vao um a um, com pausa, e o que falhar fica com a cotacao anterior.
    hoje=date.today(); linhas=[]; novos=0
    anteriores={r['contrato']:r for r in dados.get('eua_zq',[])}
    for k in range(0,15):
        y,m=hoje.year+(hoje.month-1+k)//12,(hoje.month-1+k)%12+1
        sym='ZQ%s%02d.CBT'%(CODIGO_MES[m-1],y%100)
        p=os.path.join(tmp,sym+'.json')
        linha=None
        for tentativa in range(2):
            codigo=curl('https://query1.finance.yahoo.com/v8/finance/chart/%s?range=5d&interval=1d'%sym,p,30)
            if codigo=='200':
                try:
                    meta=json.load(open(p))['chart']['result'][0]['meta']; preco=float(meta['regularMarketPrice'])
                    quando=datetime.fromtimestamp(int(meta['regularMarketTime']),timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
                    if 80<preco<100: linha=dict(contrato=sym[:5],mes='%04d-%02d'%(y,m),preco=s(preco),cotado_em=quando)
                except Exception: linha=None
                break
            if codigo=='404': break          # contrato sem cotacao no Yahoo
            time.sleep(6)                     # 429 ou falha passageira: espera e tenta mais uma vez
        time.sleep(1.2)
        if linha: novos+=1
        elif sym[:5] in anteriores: linha=anteriores[sym[:5]]
        if linha: linhas.append(linha)
    if novos<3 or len(linhas)<6: raise RuntimeError('poucos contratos de Fed funds com cotacao nova (%d)'%novos)
    if linhas!=dados.get('eua_zq'): dados['eua_zq']=linhas; notes.append('futuros de Fed funds (%d contratos)'%len(linhas))

BLS={'CUSR0000SA0':'cpi','CUSR0000SA0L1E':'cpi_nucleo','LNS14000000':'desemprego','CES0000000001':'payroll'}
def bloco_macro_eua(dados,tmp,notes):
    # As chaves, quando existem, chegam por variavel de ambiente (BLS_KEY e FRED_KEY); nunca ficam neste arquivo, que e publico.
    ano=date.today().year; chave=os.environ.get('BLS_KEY','').strip()
    pedido={'seriesid':list(BLS),'startyear':str(ano-2),'endyear':str(ano)}
    if chave: pedido['registrationkey']=chave
    d=json.load(open(baixar('https://api.bls.gov/publicAPI/%s/timeseries/data/'%('v2' if chave else 'v1'),os.path.join(tmp,'bls.json'),90,data=json.dumps(pedido),headers=['Content-Type: application/json'])))
    if d.get('status')!='REQUEST_SUCCEEDED': raise RuntimeError('BLS: '+str(d.get('message'))[:120])
    linhas=[]
    for serie in d['Results']['series']:
        nome=BLS.get(serie['seriesID'])
        pontos=sorted((p['year']+'-'+p['period'][1:],p['value']) for p in serie['data'] if re.fullmatch(r'M(0[1-9]|1[0-2])',p['period']) and p['value'] not in ('-',''))
        for periodo,valor in pontos[-15:]:
            linhas.append(dict(chave=nome+' '+periodo,serie=nome,periodo=periodo,valor=valor))
    if len(linhas)<40: raise RuntimeError('BLS devolveu poucas observacoes')
    fred=os.environ.get('FRED_KEY','').strip()
    antigas=[l for l in dados.get('eua_macro',[]) if l.get('serie')=='pce_nucleo']
    if fred:
        try:
            url='https://api.stlouisfed.org/fred/series/observations?series_id=PCEPILFE&file_type=json&observation_start=%d-01-01&api_key=%s'%(ano-2,fred)
            obs=json.load(open(baixar(url,os.path.join(tmp,'pce.json'),60)))['observations']
            pts=[(o['date'][:7],o['value']) for o in obs if o.get('value') not in ('.','',None)]
            if len(pts)>=13: antigas=[dict(chave='pce_nucleo '+p,serie='pce_nucleo',periodo=p,valor=v) for p,v in pts[-15:]]
        except Exception as e: notes.append('nucleo do PCE mantido (%s)'%str(e)[:60].replace(fred,'***'))
    linhas+=antigas
    if linhas!=dados.get('eua_macro'): dados['eua_macro']=linhas; notes.append('indicadores do BLS')

# ---------------------------------------------------------------- Inflação BR e dólar (Banco Central, SGS)
def sgs(tmp,codigo,dias):
    fim=date.today(); ini=fim-timedelta(days=dias)
    url='https://api.bcb.gov.br/dados/serie/bcdata.sgs.%d/dados?formato=json&dataInicial=%s&dataFinal=%s'%(codigo,ini.strftime('%d/%m/%Y'),fim.strftime('%d/%m/%Y'))
    d=None
    for tentativa in range(3):   # o SGS as vezes devolve uma pagina de erro com codigo 200
        try: d=json.load(open(baixar(url,os.path.join(tmp,'sgs%d.json'%codigo),60))); break
        except ValueError: time.sleep(3+3*tentativa)
    if not isinstance(d,list): raise RuntimeError('serie %d do SGS sem resposta valida'%codigo)
    return [(dmy(p['data']).isoformat(),p['valor']) for p in d if p.get('valor') not in (None,'')]
SGS_INFLACAO={'ipca':433,'ipca_12m':13522,'ipca15':7478,'igpm':189}
def bloco_inflacao_br(dados,tmp,notes):
    linhas=[]
    for nome,cod in SGS_INFLACAO.items():
        pts=sgs(tmp,cod,800)
        if len(pts)<12: raise RuntimeError('serie %d do SGS com poucos pontos'%cod)
        linhas+= [dict(chave=nome+' '+d[:7],serie=nome,mes=d[:7],valor=v) for d,v in pts[-25:]]
    meta=sgs(tmp,13521,2200); selic=sgs(tmp,432,40)
    if not meta or not selic: raise RuntimeError('meta de inflacao ou Selic indisponivel no SGS')
    antigos={l['chave']:l.get('visto_em') for l in dados.get('br_inflacao',[])}
    hoje=agora_br().date().isoformat()
    for l in linhas:  # dia em que o atualizador viu cada numero pela primeira vez
        l['visto_em']=antigos.get(l['chave']) if l['chave'] in antigos else (hoje if dados.get('br_inflacao') else None)
    parametros=[dict(chave='meta',nome='meta',ref=meta[-1][0][:4],valor=meta[-1][1]),dict(chave='selic',nome='selic',ref=selic[-1][0],valor=selic[-1][1])]
    if linhas!=dados.get('br_inflacao'): dados['br_inflacao']=linhas; notes.append('inflacao BR ate '+linhas[-1]['mes'])
    if parametros!=dados.get('br_parametros'): dados['br_parametros']=parametros; notes.append('meta e Selic')

# ---------------------------------------------------------------- Ações BR
def cotacao_b3(tmp,simbolo):
    d=json.load(open(baixar('https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation/'+simbolo,os.path.join(tmp,'q_'+simbolo+'.json'),20)))
    if d.get('BizSts',{}).get('cd')!='OK' or not d.get('Trad'): raise RuntimeError('sem cotacao de '+simbolo)
    q=d['Trad'][0]['scty']['SctyQtn']
    return d['Msg']['dtTm'].replace(' ','T')+'-03:00',q
def bloco_acoes_br(dados,tmp,notes):
    quando,q=cotacao_b3(tmp,'IBOV')
    if q.get('curPrc') is None: raise RuntimeError('Ibovespa sem ultimo preco')
    ibov=[dict(simbolo='IBOV',nivel=s(q['curPrc']),var_dia=s(q.get('prcFlcn')),abertura=s(q.get('opngPric')),minimo=s(q.get('minPric')),maximo=s(q.get('maxPric')),cotado_em=quando)]
    mudou=[{k:v for k,v in r.items() if k!='cotado_em'} for r in ibov]!=[{k:v for k,v in r.items() if k!='cotado_em'} for r in dados.get('br_ibov',[])]
    if mudou: dados['br_ibov']=ibov; notes.append('Ibovespa de '+quando)
def cotacoes_da_carteira(tmp,cart):
    # Uma cotacao por papel, com pausa entre os pedidos para pesar pouco na B3. A B3 as vezes recusa pedidos (403 ou 429):
    # o pedido recusado nao e repetido; com 3 recusas seguidas a rotina para de pedir; e se as recusas deixarem menos de
    # 90% da carteira com cotacao o bloco falha, porque um ranking com parte da carteira enganaria. Fica o dado anterior.
    lidos=[]; quando=None; recusas=0; seguidas=0
    for c in cart:
        time.sleep(0.35)
        try: quando,qq=cotacao_b3(tmp,c['cod']); seguidas=0
        except RuntimeError as e:
            if 'respondeu 403' in str(e) or 'respondeu 429' in str(e):
                recusas+=1; seguidas+=1
                if seguidas>=3: break
            continue
        except Exception: continue
        if qq.get('curPrc') is None or qq.get('prcFlcn') is None: continue
        lidos.append((c,qq))
    if recusas and len(lidos)<0.9*len(cart): raise RuntimeError('a B3 recusou %d pedidos de cotacao; so %d de %d papeis lidos'%(recusas,len(lidos),len(cart)))
    return quando,lidos
def bloco_papeis_br(dados,tmp,notes):
    # carteira teorica do indice (B3) e cotacao de cada papel
    cart=carteira_b3(tmp,'IBOV')
    quando,lidos=cotacoes_da_carteira(tmp,cart)
    papeis=[dict(ticker=c['cod'],nome=c['asset'].strip(),preco=s(qq['curPrc']),var_dia=s(qq['prcFlcn'])) for c,qq in lidos]
    if len(papeis)<30: raise RuntimeError('so %d papeis do indice com cotacao'%len(papeis))
    if papeis!=dados.get('br_papeis'):
        dados['br_papeis']=papeis; dados['br_papeis_ref']=[dict(cotado_em=quando,papeis=str(len(papeis)),carteira=str(len(cart)))]; notes.append('%d papeis do Ibovespa'%len(papeis))
def bloco_historico_br(dados,tmp,notes):
    # Dolar PTAX (Banco Central): busca sempre, porque a taxa do dia sai no comeco da tarde.
    ptax=[dict(data=d,valor=v) for d,v in sgs(tmp,1,800)][-275:]
    if len(ptax)<200: raise RuntimeError('PTAX com poucos pontos')
    if ptax!=dados.get('br_dolar'): dados['br_dolar']=ptax; notes.append('dolar PTAX de '+ptax[-1]['data'])
    # Fechamentos do Ibovespa (Yahoo): so mudam uma vez por dia; se o ultimo pregao encerrado ja esta guardado, nao pede de novo.
    ontem=agora_br().date()-timedelta(days=1)
    while not bd(ontem): ontem-=timedelta(days=1)
    if dados.get('br_ibov_hist') and dados['br_ibov_hist'][-1]['data']>=ontem.isoformat(): return
    d=json.load(open(baixar('https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=2y&interval=1d',os.path.join(tmp,'bvsp.json'),60)))['chart']['result'][0]
    fech=d['indicators']['quote'][0]['close']
    hist=[]
    for t,c in zip(d['timestamp'],fech):
        if c is None: continue
        hist.append(dict(data=(datetime.fromtimestamp(t,timezone.utc)+timedelta(hours=-3)).date().isoformat(),fechamento=s(round(c,2))))
    hoje=agora_br().date().isoformat()
    hist=[h for h in hist if h['data']<hoje][-275:]   # so pregoes encerrados
    if len(hist)<200: raise RuntimeError('historico do Ibovespa curto')
    if hist!=dados.get('br_ibov_hist'): dados['br_ibov_hist']=hist; notes.append('historico do Ibovespa ate '+hist[-1]['data'])

# ---------------------------------------------------------------- Fundos imobiliários
def carteira_b3(tmp,indice):
    filtro=base64.b64encode(json.dumps({'language':'pt-br','pageNumber':1,'pageSize':200,'index':indice,'segment':'1'}).encode()).decode()
    return json.load(open(baixar('https://sistemaswebb3-listados.b3.com.br/indexProxy/indexCall/GetPortfolioDay/'+filtro,os.path.join(tmp,'cart_%s.json'%indice),60)))['results']
def bloco_ifix(dados,tmp,notes):
    quando,q=cotacao_b3(tmp,'IFIX')
    if q.get('curPrc') is None: raise RuntimeError('IFIX sem ultimo preco')
    ifix=[dict(simbolo='IFIX',nivel=s(q['curPrc']),var_dia=s(q.get('prcFlcn')),abertura=s(q.get('opngPric')),minimo=s(q.get('minPric')),maximo=s(q.get('maxPric')),cotado_em=quando)]
    sem=lambda l:[{k:v for k,v in r.items() if k!='cotado_em'} for r in l]
    if sem(ifix)!=sem(dados.get('br_ifix',[])): dados['br_ifix']=ifix; notes.append('IFIX de '+quando)
def bloco_fiis(dados,tmp,notes):
    cart=carteira_b3(tmp,'IFIX')
    quando,lidos=cotacoes_da_carteira(tmp,cart)
    fundos=[dict(ticker=c['cod'],nome=c['asset'].strip(),preco=s(qq['curPrc']),var_dia=s(qq['prcFlcn']),peso=(c.get('part') or '').replace(',','.')) for c,qq in lidos]
    if len(fundos)<30: raise RuntimeError('so %d fundos do IFIX com cotacao'%len(fundos))
    if fundos!=dados.get('br_fiis'):
        dados['br_fiis']=fundos; dados['br_fiis_ref']=[dict(cotado_em=quando,fundos=str(len(fundos)),carteira=str(len(cart)))]; notes.append('%d fundos do IFIX'%len(fundos))
def bloco_historico_fii(dados,tmp,notes):
    # CDI diario (Banco Central, serie 12): busca sempre. Fechamentos do IFIX (estatisticas historicas da B3): uma vez por dia.
    cdi=[dict(data=d,valor=v) for d,v in sgs(tmp,12,800)][-275:]
    if len(cdi)<200: raise RuntimeError('CDI com poucos pontos')
    if cdi!=dados.get('br_cdi'): dados['br_cdi']=cdi; notes.append('CDI de '+cdi[-1]['data'])
    ontem=agora_br().date()-timedelta(days=1)
    while not bd(ontem): ontem-=timedelta(days=1)
    if dados.get('br_ifix_hist') and dados['br_ifix_hist'][-1]['data']>=ontem.isoformat(): return
    hoje=agora_br().date(); hist=[]
    for ano in (hoje.year-1,hoje.year):
        filtro=base64.b64encode(json.dumps({'index':'IFIX','language':'pt-br','year':str(ano)}).encode()).decode()
        d=json.load(open(baixar('https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/GetPortfolioDay/'+filtro,os.path.join(tmp,'ifix_%d.json'%ano),60)))
        for linha in d.get('results') or []:
            for mes in range(1,13):
                v=linha.get('rateValue%d'%mes)
                if not v: continue
                try: dia=date(ano,mes,int(linha['day']))
                except ValueError: continue
                hist.append(dict(data=dia.isoformat(),fechamento=s(round(num(v),2))))
    hist=sorted((h for h in hist if h['data']<hoje.isoformat()),key=lambda h:h['data'])[-275:]   # so pregoes encerrados
    if len(hist)<200: raise RuntimeError('historico do IFIX curto (%d pregoes)'%len(hist))
    if hist!=dados.get('br_ifix_hist'): dados['br_ifix_hist']=hist; notes.append('historico do IFIX ate '+hist[-1]['data'])

# ---------------------------------------------------------------- Focus (Banco Central)
FOCUS=['IPCA','Selic','PIB Total','Câmbio']
def bloco_focus(dados,tmp,notes):
    # Um pedido so, com os quatro indicadores e os dois anos, para pesar pouco no servico do Banco Central.
    from urllib.parse import quote
    hoje=agora_br().date(); ano=hoje.year
    filtro="(%s) and (DataReferencia eq '%d' or DataReferencia eq '%d') and baseCalculo eq 0 and Data ge '%s'"%(
        ' or '.join("Indicador eq '%s'"%i for i in FOCUS),ano,ano+1,(hoje-timedelta(days=60)).isoformat())
    url='https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?%24filter='+quote(filtro)+'&%24orderby=Data%20desc&%24top=1000&%24format=json'
    v=None
    for tentativa in range(3):   # o servico as vezes devolve uma pagina que nao e JSON
        try: v=json.load(open(baixar(url,os.path.join(tmp,'focus.json'),60)))['value']; break
        except ValueError: time.sleep(4+4*tentativa)
    if v is None: raise RuntimeError('Focus sem resposta valida')
    linhas=[]
    for ind in FOCUS:
        for a in (ano,ano+1):
            serie=sorted((x for x in v if x.get('Indicador')==ind and str(x.get('DataReferencia'))==str(a) and x.get('Mediana') is not None),key=lambda x:x['Data'],reverse=True)
            if not serie: continue
            atual=serie[0]; corte=(date.fromisoformat(atual['Data'])-timedelta(days=28)).isoformat()
            antes=next((x for x in serie if x['Data']<=corte),None)
            linhas.append(dict(chave='%s %d'%(ind,a),indicador=ind,ano=str(a),data=atual['Data'],mediana=s(atual['Mediana']),respondentes=s(atual.get('numeroRespondentes')),
                data_4s=antes['Data'] if antes else None,mediana_4s=s(antes['Mediana']) if antes else None))
    if len(linhas)<4: raise RuntimeError('Focus devolveu poucas expectativas')
    if linhas!=dados.get('focus'): dados['focus']=linhas; notes.append('Focus de '+linhas[0]['data'])

# ---------------------------------------------------------------- Agenda de divulgacoes (FRED)
FRED_DIVULGACOES=[(50,'payroll'),(10,'cpi'),(54,'pce')]   # Employment Situation, Consumer Price Index, Personal Income and Outlays
def bloco_agenda(dados,tmp,notes):
    chave=os.environ.get('FRED_KEY','').strip()
    if not chave: raise RuntimeError('agenda dos EUA precisa da chave do FRED')
    hoje=agora_br().date().isoformat(); linhas=[]
    for num_,evento in FRED_DIVULGACOES:
        url='https://api.stlouisfed.org/fred/release/dates?release_id=%d&include_release_dates_with_no_data=true&sort_order=desc&limit=12&file_type=json&api_key=%s'%(num_,chave)
        try: d=json.load(open(baixar(url,os.path.join(tmp,'fred_%d.json'%num_),60)))
        except Exception as e: raise RuntimeError(str(e).replace(chave,'***')[:100])
        futuras=sorted(x['date'] for x in d.get('release_dates',[]) if re.fullmatch(r'\d{4}-\d\d-\d\d',x.get('date','')) and x['date']>=hoje)
        for data_ in futuras[:2]: linhas.append(dict(chave=evento+' '+data_,evento=evento,data=data_))
        time.sleep(0.5)
    if not linhas: raise RuntimeError('FRED sem datas futuras de divulgacao')
    if linhas!=dados.get('agenda'): dados['agenda']=linhas; notes.append('agenda: %d datas'%len(linhas))

# ---------------------------------------------------------------- Notícias (RSS)
FEEDS=[  # (veículo, endereço, seção de origem)
 ('Agência Brasil','https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml','brasil'),
 ('Agência Brasil','https://agenciabrasil.ebc.com.br/rss/economia/feed.xml','brasil'),
 ('G1','https://g1.globo.com/rss/g1/','brasil'),
 ('G1','https://g1.globo.com/rss/g1/economia/','brasil'),
 ('Folha de S.Paulo','https://feeds.folha.uol.com.br/emcimadahora/rss091.xml','brasil'),
 ('Folha de S.Paulo','https://feeds.folha.uol.com.br/mercado/rss091.xml','brasil'),
 ('InfoMoney','https://www.infomoney.com.br/feed/','brasil'),
 ('Money Times','https://www.moneytimes.com.br/feed/','brasil'),
 ('G1','https://g1.globo.com/rss/g1/mundo/','mundo'),
 ('BBC','https://feeds.bbci.co.uk/news/world/rss.xml','mundo'),
 ('BBC','https://feeds.bbci.co.uk/news/business/rss.xml','mundo'),
 ('NPR','https://feeds.npr.org/1004/rss.xml','mundo'),
 ('The Washington Post','https://feeds.washingtonpost.com/rss/world','mundo'),
 ('InfoMoney','https://www.infomoney.com.br/tudo-sobre/mercado-imobiliario/feed/','imobiliario'),
 ('Money Times','https://www.moneytimes.com.br/tag/fundos-imobiliarios/feed/','imobiliario'),
]
PRIORIDADE={'brasil':['Agência Brasil','Folha de S.Paulo','G1','InfoMoney','Money Times'],
            'mundo':['BBC','The Washington Post','NPR','G1'],
            'imobiliario':['InfoMoney','Money Times','Folha de S.Paulo','G1','Agência Brasil']}
IMOB=re.compile(r'imobili|im[oó]ve(l|is)\b|aluguel|alugu[eé]is|incorporadora|construtora|construção civil|minha casa|habita[cç]|fundos? imobili|\bfiis?\b|financiamento da casa|casa pr[oó]pria|loteamento|\bcri\b|\blci\b',re.I)
PARADAS=set('a o as os um uma de da do das dos em no na nos nas para por com sem e ou que se ao aos à às é foi diz após sobre como mais menos the of to in on for and a an is are at by from with after says as new'.split())
def sem_acento(t): return ''.join(c for c in unicodedata.normalize('NFD',t) if unicodedata.category(c)!='Mn')
def palavras(titulo): return {p for p in re.findall(r'[a-z0-9]{3,}',sem_acento(titulo.lower())) if p not in PARADAS}
def mesma_historia(a,b):
    # mesma historia: metade das palavras em comum, ou pelo menos 4 palavras em comum e um quarto do total
    comum=len(a&b); total=len(a|b)
    return total>0 and (comum/total>=0.5 or (comum>=4 and comum/total>=0.25))
def ler_feed(tmp,i,veiculo,url):
    p=os.path.join(tmp,'feed%d.xml'%i)
    if curl(url,p,40)!='200' or os.path.getsize(p)>4000000: raise RuntimeError('feed indisponivel')
    itens=[]
    raiz=ET.parse(p).getroot()
    for pos,it in enumerate(raiz.iter('item')):
        titulo=html.unescape(re.sub(r'<[^>]+>','',(it.findtext('title') or ''))).strip(); link=(it.findtext('link') or '').strip()
        quando=it.findtext('pubDate') or it.findtext('{http://purl.org/dc/elements/1.1/}date') or ''
        try:
            dt=parsedate_to_datetime(quando) if ',' in quando or re.match(r'\d{1,2} \w{3}',quando.strip()) else datetime.fromisoformat(quando.strip().replace('Z','+00:00'))
            if dt.tzinfo is None: dt=dt.replace(tzinfo=BRT)
        except Exception: continue
        if not titulo or not re.match(r'https://',link): continue
        itens.append(dict(titulo=re.sub(r'\s+',' ',titulo)[:220],fonte=veiculo,link=link,quando=dt,pos=pos))
    return itens
def montar_noticias(dados,tmp,notes):
    agora=datetime.now(timezone.utc); bruto=[]; falhas=[]
    for i,(veiculo,url,secao) in enumerate(FEEDS):
        try: itens=ler_feed(tmp,i,veiculo,url)
        except Exception as e: falhas.append(veiculo); continue
        n=max(len(itens),1)
        for it in itens:
            it['secao']=secao; it['destaque']=1-it['pos']/n; bruto.append(it)
    if len(bruto)<20: raise RuntimeError('feeds de noticias indisponiveis (%s)'%', '.join(sorted(set(falhas))))
    for n in dados.get('noticias',[]):   # o setor imobiliário publica pouco: as matérias já selecionadas continuam concorrendo por 10 dias
        if n.get('secao')!='imobiliario': continue
        try: bruto.append(dict(titulo=n['titulo'],fonte=n['fonte'],link=n['link'],quando=datetime.fromisoformat(n['data']),pos=0,secao='imobiliario',destaque=0))
        except Exception: pass
    for it in list(bruto):   # matérias de imóveis saem dos feeds brasileiros por palavra-chave
        if it['secao']=='brasil' and IMOB.search(it['titulo']): bruto.append(dict(it,secao='imobiliario'))
    selecao=[]
    for secao in ('brasil','mundo','imobiliario'):
        janela=36 if secao!='imobiliario' else 240
        cand=[it for it in bruto if it['secao']==secao and timedelta(0)<=agora-it['quando']<=timedelta(hours=janela)]
        vistos=set(); unicos=[]
        for it in cand:
            if it['link'] in vistos: continue
            vistos.add(it['link']); it['pal']=palavras(it['titulo']); unicos.append(it)
        grupos=[]
        for it in sorted(unicos,key=lambda x:x['quando'],reverse=True):
            for g in grupos:
                if any(mesma_historia(x['pal'],it['pal']) for x in g): g.append(it); break
            else: grupos.append([it])
        ordem=PRIORIDADE[secao]
        def nota(g):
            veiculos=len({x['fonte'] for x in g}); horas=min((agora-x['quando']).total_seconds()/3600 for x in g)
            return 3*(veiculos-1)+2*max(0,1-horas/janela)+max(x['destaque'] for x in g)
        por_fonte={}; escolhidos=[]
        for g in sorted(grupos,key=nota,reverse=True):
            rep=min(g,key=lambda x:(ordem.index(x['fonte']) if x['fonte'] in ordem else 99,-x['quando'].timestamp()))
            if por_fonte.get(rep['fonte'],0)>=(5 if secao=='imobiliario' else 3): continue
            por_fonte[rep['fonte']]=por_fonte.get(rep['fonte'],0)+1
            escolhidos.append(dict(chave='%s %d'%(secao,len(escolhidos)+1),secao=secao,ordem=len(escolhidos)+1,titulo=rep['titulo'],fonte=rep['fonte'],
                data=rep['quando'].astimezone(BRT).strftime('%Y-%m-%dT%H:%M:%S-03:00'),link=rep['link'],veiculos=len({x['fonte'] for x in g})))
            if len(escolhidos)>=8: break
        selecao+=escolhidos
    if len({x['secao'] for x in selecao})<2: raise RuntimeError('selecao de noticias ficou vazia')
    dados['noticias']=selecao
    dados['noticias_montagem']=[dict(montada_em=agora_br().strftime('%Y-%m-%dT%H:%M:%S-03:00'),feeds_com_falha=', '.join(sorted(set(falhas))))]
    notes.append('noticias: %d itens'%len(selecao)+(' (falharam: %s)'%', '.join(sorted(set(falhas))) if falhas else ''))

# ---------------------------------------------------------------- execução
BLOCOS=[('curva_di',bloco_curva_di),('ntnb',bloco_ntnb),('fed_funds',bloco_fed_funds),('treasuries',bloco_treasuries),('fomc',bloco_fomc),
        ('historico_br',bloco_historico_br),('futuros_fed',bloco_futuros_fed),('inflacao_br',bloco_inflacao_br),('ibovespa',bloco_acoes_br),('papeis_br',bloco_papeis_br),
        ('ifix',bloco_ifix),('fiis',bloco_fiis),('historico_fii',bloco_historico_fii),('focus',bloco_focus)]
def main():
    src,out=sys.argv[1],sys.argv[2]; modo=sys.argv[3] if len(sys.argv)>3 else ''
    so=os.environ.get('SO_BLOCOS','').split(',') if os.environ.get('SO_BLOCOS') else None
    pagina=open(src,encoding='utf-8').read()
    m=re.search(r'^(\s*const DADOS = )(\{.*\});[ \t]*$',pagina,re.M)
    if not m: sys.exit('ERRO: bloco DADOS nao encontrado na pagina')
    dados=json.loads(m.group(2)); antes=json.dumps(dados,sort_keys=True); notes=[]
    status=dict(dados.get('status',{}))
    # Arquivo de historico (opcional): caminho na variavel HISTORICO. Um arquivo ilegivel nao e sobrescrito.
    global UST_ANO_ANTERIOR
    hist_caminho=os.environ.get('HISTORICO','').strip(); hist=None
    if hist_caminho:
        try: hist=json.load(open(hist_caminho,encoding='utf-8'))
        except FileNotFoundError: hist={}
        except ValueError: hist=None; notes.append('historico FALHOU (arquivo ilegivel, nao foi alterado)')
        if hist is not None:
            for k in HIST: hist.setdefault(k,{})
            UST_ANO_ANTERIOR=len(hist['ust'])<200
    blocos=list(BLOCOS)+([('macro_eua',bloco_macro_eua),('agenda',bloco_agenda),('noticias',montar_noticias)] if modo=='noticias' else [])
    with tempfile.TemporaryDirectory() as tmp:
        for nome,fn in blocos:
            if so and nome not in so: continue
            quando=agora_br().strftime('%Y-%m-%dT%H:%M:%S-03:00')
            try:
                fn(dados,tmp,notes)
                status[nome]=dict(ok=True,em=quando,erro='')
            except Exception as e:
                anterior=status.get(nome,{})
                status[nome]=dict(ok=False,em=anterior.get('em',''),falhou_em=quando,erro=str(e)[:160])
                notes.append('%s FALHOU (%s)'%(nome,str(e)[:100]))
    if hist is not None:
        try:
            antes_h=json.dumps(hist,sort_keys=True); novos=0
            for k,lidos in HIST.items():
                recentes=sorted(lidos)[-2:]   # os dois dias mais novos sao regravados; os antigos so entram se faltarem
                for d,v in lidos.items():
                    if d not in hist[k]: novos+=1
                    if d not in hist[k] or d in recentes: hist[k][d]=v
            limite=(agora_br().date()-timedelta(days=3*366)).isoformat()   # guarda ate 3 anos
            for k in HIST: hist[k]={d:hist[k][d] for d in sorted(hist[k]) if d>=limite}
            if json.dumps(hist,sort_keys=True)!=antes_h:
                open(hist_caminho,'w',encoding='utf-8').write(json.dumps(hist,ensure_ascii=False,separators=(',',':'))+'\n')
                notes.append('historico: %d registros novos'%novos)
        except Exception as e: notes.append('historico FALHOU (%s)'%str(e)[:80])
    # o carimbo "em" de um bloco que deu certo so entra na pagina quando algum dado muda, para nao republicar a toa
    limpo=lambda st:{k:{'ok':v.get('ok'),'erro':v.get('erro','')} for k,v in st.items()}
    dados_sem_status={k:v for k,v in dados.items() if k!='status'}
    mudou=json.dumps(dados_sem_status,sort_keys=True)!=json.dumps({k:v for k,v in json.loads(antes).items() if k!='status'},sort_keys=True)
    mudou=mudou or json.dumps(limpo(status),sort_keys=True)!=json.dumps(limpo(json.loads(antes).get('status',{})),sort_keys=True)
    if not mudou:
        print('UNCHANGED',*notes,sep='; '); return
    dados['status']=status
    bloco=m.group(1)+json.dumps(dados,ensure_ascii=False,separators=(',',':'))+';'
    open(out,'w',encoding='utf-8').write(pagina[:m.start()]+bloco+pagina[m.end():])
    print('UPDATED',*notes,sep='; ')
if __name__=='__main__': main()
