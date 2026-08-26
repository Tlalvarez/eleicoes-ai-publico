import { defineConfig } from 'astro/config';

import { catalogoDoResumo, redirectsDeMencoes } from './src/lib/catalogo.mjs';
import { leDados } from './src/lib/dados.mjs';

// a seção Menções migrou para dentro do hub por candidato (08/08/2026); os
// redirecionamentos das URLs antigas saem do catálogo publicado, não de uma
// lista digitada — candidato novo entra sozinho. O resumo vem do manifesto da
// geração ativa: a configuração do build tem de ler a MESMA geração que as
// páginas, senão sobra ou falta redirecionamento.
const resumo = leDados('itens', 'resumo.json');

export default defineConfig({
  site: 'https://eleicoes.ai',
  trailingSlash: 'never',
  build: { format: 'file' },
  redirects: {
    // A busca deixou de ser uma página própria: a home É o chat com o acervo.
    // Manter /pesquisa como rota viva criaria uma terceira superfície
    // concorrente — duas caixas de pergunta, dois formatos de resposta, duas
    // implementações do renderizador. O endereço antigo continua chegando em
    // algum lugar, em vez de dar 404.
    '/pesquisa': '/',
    ...redirectsDeMencoes(catalogoDoResumo(resumo)),
  },
});
