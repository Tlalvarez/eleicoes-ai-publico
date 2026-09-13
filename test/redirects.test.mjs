/**
 * Os redirecionamentos de /mencoes/<slug> saem do catálogo canônico
 * (src/data/candidatos.json), não de uma lista escrita à mão em
 * astro.config.mjs. Com o fim do chat (13/09/2026) todos caem em /presidente.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { redirectsDeMencoes } from '../astro.config.mjs';

const canonico = JSON.parse(readFileSync(new URL('../src/data/candidatos.json', import.meta.url), 'utf8')).candidatos;

test('um redirecionamento por candidato do catálogo, para a comparação', () => {
  assert.deepEqual(redirectsDeMencoes([{ slug: 'ana-brito' }, { slug: 'zuleide-alves' }]), {
    '/mencoes/ana-brito': '/presidente',
    '/mencoes/zuleide-alves': '/presidente',
  });
});

test('a configuração do Astro não tem slug escrito à mão', () => {
  const fonte = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  for (const { slug } of canonico) assert.ok(!fonte.includes(slug), `astro.config.mjs traz o slug '${slug}' como literal`);
});

test('os treze do catálogo canônico têm redirecionamento, e só eles', async () => {
  const { default: config } = await import('../astro.config.mjs');
  assert.equal(canonico.length, 13);
  for (const { slug } of canonico) assert.equal(config.redirects[`/mencoes/${slug}`], '/presidente', slug);
  const deMencoes = Object.keys(config.redirects).filter((r) => r.startsWith('/mencoes/'));
  assert.equal(deMencoes.length, canonico.length);
});

test('a busca antiga e as fichas não viram 404', async () => {
  const { default: config } = await import('../astro.config.mjs');
  assert.equal(config.redirects['/pesquisa'], '/');
  assert.equal(config.redirects['/fichas'], '/metodologia');
  assert.equal(existsSync(new URL('../src/pages/fichas.astro', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/pages/pesquisa.astro', import.meta.url)), false);
  const pages = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
  assert.match(pages, /^\/fichas \/metodologia 301$/m,
    'a Pages conserva arquivos apagados por 7 dias: sem a linha em _redirects o fichas.html antigo continua no ar');
});

test('o chat saiu: respostas guardadas, senador e a conversa por candidato redirecionam na Pages', () => {
  const pages = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
  assert.match(pages, /^\/resposta\/\* +\/ +302$/m);
  assert.match(pages, /^\/senador\/\* +\/ +302$/m);
  assert.match(pages, /^\/senador +\/ +302$/m);
  for (const { slug } of canonico) {
    assert.match(pages, new RegExp(`^/presidente/${slug} +/presidente +302$`, 'm'), slug);
    for (const secao of ['acervo', 'candidato']) {
      assert.match(pages, new RegExp(`^/${secao}/${slug}/\\* +/presidente +302$`, 'm'), `${secao}/${slug}`);
      assert.match(pages, new RegExp(`^/${secao}/${slug} +/presidente +302$`, 'm'), `${secao}/${slug}`);
    }
  }
  // nenhum curinga sob /presidente ou /governador/<uf>: a Pages aplica
  // _redirects antes dos arquivos, e /presidente/<tema> é página viva
  assert.doesNotMatch(pages, /^\/presidente\/(\*|:)/m);
  assert.doesNotMatch(pages, /^\/governador\/[a-z:*]+\/(\*|:)/m);
});
