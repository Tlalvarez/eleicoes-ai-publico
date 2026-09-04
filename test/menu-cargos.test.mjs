import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CARGOS } from '../src/lib/cargos.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const base = readFileSync(`${ROOT}/src/layouts/Base.astro`, 'utf8');

test('o menu principal é por cargo, derivado de src/lib/cargos.mjs', () => {
  assert.match(base, /import \{ CARGOS \} from '\.\.\/lib\/cargos\.mjs'/);
  assert.match(base, /\{CARGOS\.map\(\(cargo\) => \(/);
  assert.match(base, /<a href=\{cargo\.href\} aria-current=\{atual\(cargo\.href\)\}>\{cargo\.nome\}<\/a>/);
  assert.deepEqual(CARGOS.map((c) => c.nome), ['Presidente', 'Governador', 'Senador', 'Deputado federal']);
});

test('as seções Candidatos e Acervo estão escondidas: sem entrada no menu', () => {
  assert.doesNotMatch(base, /href="\/candidato"/);
  assert.doesNotMatch(base, /href="\/acervo"/);
  assert.doesNotMatch(base, />Candidatos</);
  assert.doesNotMatch(base, />Acervo</);
});

test('cada cargo por UF tem a página de escolha da UF e a página da conversa', () => {
  assert.ok(existsSync(`${ROOT}/src/pages/[cargo]/index.astro`));
  assert.ok(existsSync(`${ROOT}/src/pages/[cargo]/[uf].astro`));
  const conversa = readFileSync(`${ROOT}/src/pages/[cargo]/[uf].astro`, 'utf8');
  assert.match(conversa, /<Chat apiBase=\{apiBase\} escopo=\{escopo\} pagina=\{pagina\}/);
});
