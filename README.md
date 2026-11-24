# Dashboard Vera Cruz

Fontes do dashboard público de mercado: uma página única com doze abas, publicada pelo Netlify.

- `page/`: o conteúdo de cada aba (`tab_*.html`), os scripts de cálculo e desenho (`*.js`) e a folha de estilo. Todo o visual fica em `page/estilo.css`, a única folha de estilo do site: as cores, as fontes e as medidas estão nas variáveis do começo do arquivo, e cada componente (cabeçalho, navegação, destaques, seções, tabelas, gráficos, campos, notícias, rodapé, telas menores, impressão) tem a sua parte numerada. As cotações relidas ao vivo (dólar futuro, Ibovespa e IFIX) ficam em `page/aovivo.js`: além do valor gravado na atualização, o navegador relê cada uma direto da B3 a cada minuto, em horário de pregão. A aba Dólar fica em `page/cambio.js` e a calculadora de equivalência de taxas em `page/calculadora.js`. Os botões de baixar em CSV ficam em `page/csv.js`: o arquivo é montado no navegador com os mesmos dados da página.
- `build_dashboard.py`: monta a página única. Uso: `python3 build_dashboard.py <página com os DADOS atuais> <saída.html>`. Gera o documento HTML completo de `site/index.html`: cabeçalho, navegação entre abas, os painéis, o rodapé e as etiquetas da prévia de compartilhamento. A lista de abas e a ordem dos scripts ficam no começo do arquivo.
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
python3 build_dashboard.py site/index.html site/index.html
```

O endereço público do site entra na prévia de compartilhamento e fica em `ENDERECO`, no começo de `build_dashboard.py`. Troque ali quando o site ganhar domínio próprio e regenere.

## Visual

O site segue uma linha editorial: papel claro, tinta grafite e o azul da marca como único acento; serifa (Newsreader) nos títulos e nos números de destaque, Work Sans no texto e nas tabelas; números tabulares; fios finos no lugar de caixas, sombras e cantos arredondados. Para mudar o visual, mexa em `page/estilo.css`, de preferência nas variáveis do começo. Os scripts desenham os gráficos sem cor nem espessura próprias: quem define isso é a parte 7 da folha de estilo.
