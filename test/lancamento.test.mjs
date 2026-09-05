import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// O lançamento público de 05/09/2026 tem três condições que o gate protege:
// o site é indexável, tem quem responda por ele e não finge encontrar tudo.
const le = (p) => readFile(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('lançamento: o layout não carrega mais noindex', async () => {
  const base = await le('layouts/Base.astro');
  assert.doesNotMatch(base, /<meta name="robots"[^>]*noindex/);
});

test('lançamento: rodapé leva a quem faz, privacidade e contato', async () => {
  const base = await le('layouts/Base.astro');
  for (const href of ['/sobre', '/privacidade', '/sobre#contato']) {
    assert.match(base, new RegExp(`href="${href}"`), `falta ${href} no rodapé`);
  }
});

test('lançamento: a página Quem faz nomeia o responsável e o canal de retirada', async () => {
  const sobre = await le('pages/sobre.astro');
  assert.match(sobre, /Thiago Alvarez/);
  assert.match(sobre, /id="contato"/);
  assert.match(sobre, /Não recomenda voto/);
  assert.match(sobre, /Não tem revisor humano/);
});

test('lançamento: privacidade descreve o que o código faz', async () => {
  const priv = await le('pages/privacidade.astro');
  const base = await le('layouts/Base.astro');
  assert.match(priv, /endereço próprio, não listado/);
  assert.match(priv, /modo sem cookies/);
  assert.match(base, /cookieless_mode: 'always'/, 'a promessa de "sem cookies" depende disto');
  assert.match(base, /person_profiles: 'never'/);
});

test('lançamento: existe página 404 própria', async () => {
  const p = await le('pages/404.astro');
  assert.match(p, /Página não encontrada/);
});
