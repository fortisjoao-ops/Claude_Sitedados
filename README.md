# Dashboard Vera Cruz

Fontes do dashboard público de mercado (página única com nove abas, publicada como artifact).

- `page/`: o conteúdo de cada aba (`tab_*.html`, `index.html` é a aba Curva DI Futuro), os scripts de cálculo e desenho (`*.js`) e os estilos. O acabamento visual (cabeçalho, destaques, tabelas) fica em `page/refino.css`, que entra por último e não alcança os gráficos. Os botões de baixar em CSV ficam em `page/csv.js`: o arquivo é montado no navegador com os mesmos dados da página.
- `build_dashboard.py`: monta a página única. Uso: `python3 build_dashboard.py <página com os DADOS atuais> <saída.html> [site]`. Com `site`, gera um documento HTML completo, como o de `site/index.html`; sem ele, gera o conteúdo no formato do artifact. Lê as cores e a identidade visual de `build_public.py`.
- `atualizar.py`: busca os dados nas fontes públicas e reescreve só a linha `const DADOS = {...};` da página. Uso: `python3 -I atualizar.py <página atual> <saída.html> [noticias]`. Imprime `UPDATED; ...` ou `UNCHANGED`.
- `assets/`: logotipo e símbolos publicados junto da página.
- `site/`: a página pronta para hospedagem (`index.html` e as imagens). É o que o Netlify publica.
- `.github/workflows/atualizar.yml`: roda o atualizador no GitHub nos horários marcados e grava `site/index.html` quando algum dado muda.
- `site/historico.json`: um registro por dia útil (ajustes do DI, taxas das NTN-B e curva dos Treasuries), acrescentado pelo atualizador quando a variável `HISTORICO` aponta para ele. A aba Histórico lê esse arquivo.
- `site/icone.png` e `site/previa.png`: ícone da aba do navegador e imagem da prévia ao compartilhar o link.
- `ferramentas/retroativo_di.py`: preenche o histórico com curvas de DI de pregões passados, lidas do boletim da B3.
- `netlify.toml`: diz ao Netlify para publicar a pasta `site`, sem etapa de montagem.

Variáveis de ambiente opcionais do atualizador (nunca escreva chaves em arquivo):

- `BLS_KEY`: chave da API do Bureau of Labor Statistics (aumenta a cota diária).
- `FRED_KEY`: chave da API do FRED, para o núcleo do PCE e para as datas de divulgação da agenda.
- `HISTORICO`: caminho do arquivo de histórico a completar (no GitHub, `site/historico.json`).
- `COPOM_ADICIONAR`: datas novas de decisão do Copom, `AAAA-MM-DD` separadas por vírgula.
- `SO_BLOCOS`: roda só os blocos listados, para teste.

Depois de mudar qualquer arquivo de `page/`, regenere o site com os dados que já estão publicados:

```bash
python3 build_dashboard.py site/index.html site/index.html site
```

O endereço público do site entra na prévia de compartilhamento e fica em `ENDERECO`, no começo do trecho de montagem do site em `build_dashboard.py`. Troque ali quando o site ganhar domínio próprio e regenere.
