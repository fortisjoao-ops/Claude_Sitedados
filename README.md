# Dashboard Vera Cruz

Fontes do dashboard público de mercado (página única com nove abas, publicada como artifact).

- `page/`: o conteúdo de cada aba (`tab_*.html`, `index.html` é a aba Curva DI Futuro), os scripts de cálculo e desenho (`*.js`) e os estilos.
- `build_dashboard.py`: monta a página única. Uso: `python3 build_dashboard.py <página com os DADOS atuais> <saída.html>`. Lê as cores e a identidade visual de `build_public.py`.
- `atualizar.py`: busca os dados nas fontes públicas e reescreve só a linha `const DADOS = {...};` da página. Uso: `python3 -I atualizar.py <página atual> <saída.html> [noticias]`. Imprime `UPDATED; ...` ou `UNCHANGED`.
- `assets/`: logotipo e símbolos publicados junto da página.

Variáveis de ambiente opcionais do atualizador (nunca escreva chaves em arquivo):

- `BLS_KEY`: chave da API do Bureau of Labor Statistics (aumenta a cota diária).
- `FRED_KEY`: chave da API do FRED, para o núcleo do PCE.
- `COPOM_ADICIONAR`: datas novas de decisão do Copom, `AAAA-MM-DD` separadas por vírgula.
- `SO_BLOCOS`: roda só os blocos listados, para teste.
