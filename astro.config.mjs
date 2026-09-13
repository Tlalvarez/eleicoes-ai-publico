import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';

// Os endereços antigos por candidato (/mencoes/<slug>, de 08/08/2026) caem na
// comparação para presidente. A lista sai do catálogo canônico versionado
// (src/data/candidatos.json), não de slugs digitados aqui. As outras rotas
// antigas (/acervo, /candidato, /presidente/<slug>, /resposta, /senador)
// redirecionam em public/_redirects, que a Pages aplica antes dos arquivos.
const catalogo = JSON.parse(readFileSync(new URL('./src/data/candidatos.json', import.meta.url), 'utf8'));

export function redirectsDeMencoes(candidatos) {
  return Object.fromEntries(candidatos.map(({ slug }) => [`/mencoes/${slug}`, '/presidente']));
}

export default defineConfig({
  site: 'https://eleicoes.ai',
  trailingSlash: 'never',
  build: { format: 'file' },
  redirects: {
    // A busca (v1) e o chat (v2) deixaram de existir: o produto é a comparação
    // de programas, e a home é a porta dela.
    '/pesquisa': '/',
    // As "fichas por candidato" eram a promessa da v1.1, nunca cumprida. O
    // endereço leva ao que descreve o método atual.
    '/fichas': '/metodologia',
    ...redirectsDeMencoes(catalogo.candidatos),
  },
});
