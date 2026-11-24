# Dashboard Vera Cruz

Fontes do dashboard público de mercado: uma página única com doze abas, publicada pelo Netlify.

- `page/`: o conteúdo de cada aba (`tab_*.html`), os scripts de cálculo e desenho (`*.js`) e a folha de estilo. Todo o visual fica em `page/estilo.css`, a única folha de estilo do site: as cores, as fontes e as medidas estão nas variáveis do começo do arquivo, e cada componente (cabeçalho, navegação, destaques, seções, tabelas, gráficos, campos, notícias, rodapé, telas menores, impressão) tem a sua parte numerada. As cotações relidas ao vivo (dólar futuro, Ibovespa e IFIX) ficam em `page/aovivo.js`: além do valor gravado na atualização, o navegador relê cada uma direto da B3 a cada minuto, em horário de pregão. A aba Dólar fica em `page/cambio.js` e a calculadora de equivalência de taxas em `page/calculadora.js`. Os botões de baixar em CSV ficam em `page/csv.js`: o arquivo é montado no navegador com os mesmos dados da página.
- `build_dashboard.py`: monta a página única. Uso: `python3 build_dashboard.py <página com os DADOS atuais> <saída.html>`. Gera o documento HTML completo de `site/index.html`: cabeçalho, navegação entre abas, os painéis, o rodapé e as etiquetas da prévia de compartilhamento. A lista de abas e a ordem dos scripts ficam no começo do arquivo.
- `relatorio.py`: gera o Daily Market Briefing, o relatório diário em PDF (`site/relatorio-diario.pdf`), e a ficha dele (`site/relatorio.json`, com a data da edição e o resumo que o email usa). Uso: `python3 relatorio.py [forcar]`. Sem `forcar`, só gera em dia útil, quando a seleção de notícias do dia já foi montada, as cotações de hoje da B3 (DI e Ibovespa) já estão gravadas e a edição do dia ainda não existe; em feriado sem pregão não há edição. O PDF é a impressão, pelo Chrome, do documento que `build_dashboard.py` monta com o argumento `relatorio`. Antes de publicar, o arquivo é conferido (tamanho, páginas, seções, data e notícias); se algo falhar, fica a edição anterior.
- `page/relatorio.html`, `page/relatorio.js` e `page/relatorio.css`: o template do Daily Market Briefing. É um documento próprio para a folha A4, não uma aba do site impressa: `relatorio.js` monta cada seção direto dos dados e dos cálculos do site (`VC.resumoItens`, `VC.agendaItens`, `papeis_ordenados`, `fiis_ordenados`, notícias), como componentes: cabeçalho, resumo de mercado por tema, agenda, notícias por categoria com resumo, rankings de altas e baixas e notas. O relatório não tem conta própria. `relatorio.css` cuida da página (margens, cabeçalho e rodapé corridos, numeração) e da paginação: cada componente declara a sua unidade indivisível (linha de tabela, tema do resumo, par de notícias, quadro de ranking) e todo título vai agrupado ao primeiro bloco que o segue.
- `resumir_noticias.py`: escreve o resumo editorial e a categoria de cada matéria da seleção de notícias, com o Claude (pacote `anthropic`), a partir do texto que cada veículo distribui no próprio feed. Roda na rodada que monta as notícias, só para as matérias ainda sem resumo. O texto dos veículos fica num arquivo de trabalho e não é publicado; o que entra nos dados é o resumo. Sem a chave `ANTHROPIC_API_KEY`, não faz nada e o relatório sai com título, veículo, data e link.
- `enviar_email.py`: manda por email, pelo Brevo, a edição do dia do relatório para a lista de inscritos, com `contato@veracruzasset.com.br` como remetente. O texto do email vem pronto da ficha do relatório (frase de abertura, destaques e manchetes). A campanha leva a data no nome, e é por ele que a rotina sabe que já enviou; antes de enviar, espera o site servir a edição nova. O campo de inscrição da aba Resumo manda o endereço direto para o formulário do Brevo (`BREVO_FORMULARIO`, em `build_dashboard.py`), que guarda a lista, pede a confirmação por email e cuida do descadastro: o site e o repositório não guardam endereço de ninguém.
- `atualizar.py`: busca os dados nas fontes públicas e reescreve só a linha `const DADOS = {...};` da página. Uso: `python3 -I atualizar.py <página atual> <saída.html> [noticias]`. Imprime `UPDATED; ...` ou `UNCHANGED`.
- `assets/`: logotipo e símbolos publicados junto da página.
- `site/`: a página pronta para hospedagem (`index.html` e as imagens). É o que o Netlify publica.
- `.github/workflows/atualizar.yml`: roda o atualizador no GitHub nos horários marcados, gera o relatório diário na primeira rodada com o pregão aberto, envia o email aos inscritos e grava `site/index.html`, o histórico e o relatório quando mudam.
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

Do envio por email: `BREVO_KEY` (chave da API do Brevo, segredo do GitHub), `BREVO_LISTA` (número da lista de inscritos, escrito na rotina) e `EMAIL_MODO=rascunho` (cria a campanha do dia sem enviar, para conferir na conta).

Dos resumos das notícias: `ANTHROPIC_API_KEY` (chave da API da Anthropic, segredo do GitHub) e `NOTICIAS_TEXTOS` (arquivo de trabalho onde o atualizador deixa os textos dos feeds; a rotina aponta para uma pasta temporária).

Do gerador do relatório: `CHROME` (caminho do navegador, quando não é o `google-chrome` da máquina) e `RELATORIO_D3` (cópia local do d3, para gerar sem acesso ao cdnjs).

Depois de mudar qualquer arquivo de `page/`, regenere o site com os dados que já estão publicados:

```bash
python3 build_dashboard.py site/index.html site/index.html
```

O endereço público do site entra na prévia de compartilhamento e fica em `ENDERECO`, no começo de `build_dashboard.py`. Troque ali quando o site ganhar domínio próprio e regenere.

## Visual

O site segue uma linha editorial: papel claro, tinta grafite e o azul da marca como único acento; serifa (Newsreader) nos títulos e nos números de destaque, Work Sans no texto e nas tabelas; números tabulares; fios finos no lugar de caixas, sombras e cantos arredondados. Para mudar o visual, mexa em `page/estilo.css`, de preferência nas variáveis do começo. Os scripts desenham os gráficos sem cor nem espessura próprias: quem define isso é a parte 7 da folha de estilo.
