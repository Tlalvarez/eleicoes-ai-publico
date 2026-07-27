import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://eleicoes.ai',
  trailingSlash: 'never',
  build: { format: 'file' },
});
