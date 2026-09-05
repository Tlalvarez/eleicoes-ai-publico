/**
 * O ícone do site existe e está declarado no <head> de toda página.
 *
 * Sem favicon o navegador mostra o globo genérico na aba e o robô de busca
 * pede /favicon.ico e recebe 404 a cada visita. Os três formatos têm função:
 * .ico para navegador antigo e robô, SVG para os atuais (nítido em qualquer
 * densidade), PNG de 180px para a tela inicial do iPhone/iPad.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const base = readFileSync(`${raiz}src/layouts/Base.astro`, 'utf8');

test('os arquivos do ícone existem em public/ e não estão vazios', () => {
  for (const nome of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png']) {
    assert.ok(statSync(`${raiz}public/${nome}`).size > 100, `${nome} vazio ou ausente`);
  }
  const svg = readFileSync(`${raiz}public/favicon.svg`, 'utf8');
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /#17365d/i, 'o ícone usa o azul-marinho da identidade');
});

test('o layout declara os três ícones no <head>', () => {
  assert.match(base, /<link rel="icon" href="\/favicon\.ico"/);
  assert.match(base, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
  assert.match(base, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
});
