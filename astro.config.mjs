import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://eleicoes.ai',
  trailingSlash: 'never',
  build: { format: 'file' },
  redirects: {
    // seção Menções migrou para dentro do hub por candidato (08/08/2026)
    '/mencoes/lula': '/candidato/lula/mencoes',
    '/mencoes/romeu-zema': '/candidato/romeu-zema/mencoes',
    '/mencoes/ronaldo-caiado': '/candidato/ronaldo-caiado/mencoes',
    '/mencoes/renan-santos': '/candidato/renan-santos/mencoes',
    '/mencoes/flavio-bolsonaro': '/candidato/flavio-bolsonaro/mencoes',
  },
});
