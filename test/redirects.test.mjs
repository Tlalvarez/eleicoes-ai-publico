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
  assert.equal(Object.keys(config.redirects).length, Object.keys(catalogo).length);
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
