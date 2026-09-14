import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CARGOS, CARGOS_NO_MENU } from '../src/lib/cargos.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const base = readFileSync(`${ROOT}/src/layouts/Base.astro`, 'utf8');

test('menu por cargo: Presidente e Governador, vindos da lista de cargos', () => {
  assert.match(base, /<nav class="main" aria-label="Cargos">/);
  assert.match(base, /CARGOS_NO_MENU\.map/);
  assert.doesNotMatch(base, /menu-aberto|menu-caixa|menu-botao/);
  // só os cargos do Executivo: são os que registram programa de governo no TSE
  assert.deepEqual(CARGOS.map((c) => c.nome), ['Presidente', 'Governador']);
  assert.deepEqual(CARGOS_NO_MENU.map((c) => c.nome), ['Presidente', 'Governador']);
  assert.equal(CARGOS.find((c) => c.slug === 'presidente').href, '/presidente');
});

test('o menu marca a seção atual: Presidente na home e em /presidente/*, Governador em /governador*', () => {
  // Presidente leva à home, que é a porta dele
  assert.match(base, /const destino = c\.porUF \? c\.href : '\/'/);
  assert.match(base, /caminhoPublico === '\/' \|\| caminhoPublico\.startsWith\(c\.href\)/);
  assert.match(base, /aria-current=\{atual \? 'page' : undefined\}/);
  for (const rotulo of ['>Candidatos<', '>Acervo<', '>Senador<']) assert.ok(!base.includes(rotulo), rotulo);
});

test('cada cargo por UF tem a página de escolha da UF, a página da UF e a rota de tema', () => {
  assert.ok(existsSync(`${ROOT}/src/pages/[cargo]/index.astro`));
  assert.ok(existsSync(`${ROOT}/src/pages/[cargo]/[uf].astro`));
  assert.ok(existsSync(`${ROOT}/src/pages/[cargo]/[uf]/[tema].astro`));
  const uf = readFileSync(`${ROOT}/src/pages/[cargo]/[uf].astro`, 'utf8');
  assert.match(uf, /resumoDoEscopo\(cargo\.slug, uf\.sigla\)/);
  assert.match(uf, /em preparação/);
});

test('presidente tem a rota de tema; o hub virou a home e a conversa por candidato saiu', () => {
  assert.ok(!existsSync(`${ROOT}/src/pages/presidente/index.astro`), 'o hub voltou: /presidente redireciona para a home');
  assert.ok(existsSync(`${ROOT}/src/pages/presidente/[tema].astro`));
  assert.ok(!existsSync(`${ROOT}/src/pages/presidente/[slug].astro`));
  assert.ok(!existsSync(`${ROOT}/src/pages/[cargo]/[uf]/[slug].astro`));
});
