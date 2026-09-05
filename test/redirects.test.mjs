/**
 * Os redirecionamentos de /mencoes/<slug> saem do catálogo, não de uma lista
 * escrita à mão.
 *
 * `astro.config.mjs` trazia os cinco slugs digitados um a um. É o mesmo
 * padrão que a revisão apontou em vigia_tse.py e transcreve_alvos.py: com 13
 * candidatos, os oito novos não teriam redirecionamento e a URL antiga deles
 * daria 404 — sem erro em lugar nenhum, porque o build não sabe que deveria
 * existir.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { catalogoDoResumo, redirectsDeMencoes } from '../src/lib/catalogo.mjs';

const resumo = { candidatos: {
  'ana-brito': { nome: 'Ana Brito' },
  'zuleide-alves': { nome: 'Zuleide Alves' },
} };

test('um redirecionamento por candidato do catálogo', () => {
  assert.deepEqual(redirectsDeMencoes(catalogoDoResumo(resumo)), {
    '/mencoes/ana-brito': '/candidato/ana-brito/mencoes',
    '/mencoes/zuleide-alves': '/candidato/zuleide-alves/mencoes',
  });
});

test('candidato novo no catálogo entra sozinho', () => {
  const ampliado = { candidatos: { ...resumo.candidatos, 'edu-farias': { nome: 'Edu Farias' } } };
  const redirects = redirectsDeMencoes(catalogoDoResumo(ampliado));

  assert.equal(Object.keys(redirects).length, 3);
  assert.equal(redirects['/mencoes/edu-farias'], '/candidato/edu-farias/mencoes');
});

test('a configuração do Astro não tem slug escrito à mão', async () => {
  const { readFileSync } = await import('node:fs');
  const fonte = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  const catalogo = catalogoDoResumo(JSON.parse(
    readFileSync(new URL('../data/itens/resumo.json', import.meta.url), 'utf8')));

  for (const slug of Object.keys(catalogo)) {
    assert.ok(!fonte.includes(slug),
      `astro.config.mjs traz o slug '${slug}' como literal`);
  }
});

test('a configuração do Astro gera os redirects de todos os candidatos', async () => {
  const { default: config } = await import('../astro.config.mjs');
  const { readFileSync } = await import('node:fs');
  const catalogo = catalogoDoResumo(JSON.parse(
    readFileSync(new URL('../data/itens/resumo.json', import.meta.url), 'utf8')));

  for (const slug of Object.keys(catalogo)) {
    assert.equal(config.redirects[`/mencoes/${slug}`], `/candidato/${slug}/mencoes`,
      `sem redirecionamento de /mencoes/${slug}`);
  }
  // /mencoes/<slug> é EXATAMENTE o catálogo — nem um a mais, nem a menos.
  // Os redirecionamentos que não são de menções são contados à parte, para um
  // slug esquecido não poder se esconder atrás do total.
  const deMencoes = Object.keys(config.redirects).filter((r) => r.startsWith('/mencoes/'));
  assert.equal(deMencoes.length, Object.keys(catalogo).length);
});

test('a busca antiga não vira 404: /pesquisa cai na home, que é o chat', async () => {
  const { default: config } = await import('../astro.config.mjs');

  assert.equal(config.redirects['/pesquisa'], '/');
});

test('as fichas prometidas para 1º/9 saíram: /fichas cai na metodologia, no Astro e no Pages', async () => {
  const config = (await import('../astro.config.mjs')).default;
  const { existsSync } = await import('node:fs');
  const { readFile } = await import('node:fs/promises');
  assert.equal(config.redirects['/fichas'], '/metodologia');
  assert.equal(existsSync(new URL('../src/pages/fichas.astro', import.meta.url)), false,
    'src/pages/fichas.astro voltou — a página anunciava uma publicação que não aconteceu');
  const pages = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
  assert.match(pages, /^\/fichas \/metodologia 301$/m,
    'a Pages conserva arquivos apagados por 7 dias: sem a linha em _redirects o fichas.html antigo continua no ar');
});

test('não existe mais uma página de pesquisa concorrendo com a home', async () => {
  const { existsSync } = await import('node:fs');

  assert.equal(existsSync(new URL('../src/pages/pesquisa.astro', import.meta.url)), false,
    'src/pages/pesquisa.astro voltou — o site teria duas superfícies de pergunta');
});

test('os treze do catálogo canônico têm redirecionamento', async () => {
  const { default: config } = await import('../astro.config.mjs');
  const { leCatalogoCanonico } = await import('../src/lib/catalogo.mjs');
  const canonico = leCatalogoCanonico();

  assert.equal(Object.keys(canonico).length, 13);
  for (const slug of Object.keys(canonico)) {
    assert.equal(config.redirects[`/mencoes/${slug}`], `/candidato/${slug}/mencoes`,
      `sem redirecionamento de /mencoes/${slug}`);
  }
});
