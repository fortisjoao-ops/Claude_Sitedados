# Preenche o histórico com as curvas de ajuste do DI de pregões passados, lidas do Boletim Diário do Mercado da B3.
# Uso: python3 ferramentas/retroativo_di.py site/historico.json AAAA-MM-DD [AAAA-MM-DD ...]
# Cada data custa um boletim de vários megabytes, então rode para poucas datas de cada vez. Datas já presentes são puladas.
import importlib.util, json, os, sys, tempfile, time
from datetime import date

raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('atualizar', os.path.join(raiz, 'atualizar.py'))
at = importlib.util.module_from_spec(spec)
spec.loader.exec_module(at)

caminho, datas = sys.argv[1], sys.argv[2:]
try: hist = json.load(open(caminho, encoding='utf-8'))
except FileNotFoundError: hist = {}
for k in ('di', 'ntnb', 'ust'): hist.setdefault(k, {})

for texto in datas:
    d = date.fromisoformat(texto)
    if texto in hist['di']: print(texto, 'já está no histórico'); continue
    if not at.bd(d): print(texto, 'não é dia útil'); continue
    try:
        with tempfile.TemporaryDirectory() as tmp:
            _, longos = at.settlement(d, tmp)
        hist['di'][texto] = [[r['vencimento'], int(r['du']), float(r['taxa_ajuste'])] for r in longos]
        print(texto, len(longos), 'vencimentos')
    except Exception as e:
        print(texto, 'FALHOU:', str(e)[:120])
    time.sleep(2)

hist['di'] = {d: hist['di'][d] for d in sorted(hist['di'])}
open(caminho, 'w', encoding='utf-8').write(json.dumps(hist, ensure_ascii=False, separators=(',', ':')) + '\n')
