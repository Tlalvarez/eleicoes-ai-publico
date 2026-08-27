import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = fileURLToPath(new URL('../src/layouts/Base.astro', import.meta.url));
const PAGINA = fileURLToPath(new URL('../src/pages/candidato/index.astro', import.meta.url));

const base = readFileSync(BASE, 'utf8');
const pagina = readFileSync(PAGINA, 'utf8');

test('menu principal expõe a seção Candidatos', () => {
  assert.match(base, /<a href="\/candidato" aria-current=\{atual\('\/candidato'\)\}>Candidatos<\/a>/);
});

test('a seção Candidatos possui página própria', () => {
  assert.match(pagina, /title="Candidatos"/);
  assert.match(pagina, /<h1>Candidatos acompanhados<\/h1>/);
});
