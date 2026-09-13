import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CARGOS, CARGOS_NO_MENU } from '../src/lib/cargos.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const base = readFileSync(`${ROOT}/src/layouts/Base.astro`, 'utf8');

test('o menu principal é por cargo, derivado de src/lib/cargos.mjs', () => {
  assert.match(base, /import \{ CARGOS_NO_MENU \} from '\.\.\/lib\/cargos\.mjs'/);
  assert.match(base, /\{CARGOS_NO_MENU\.map\(\(cargo\) => \(/);
  assert.match(base, /<a href=\{cargo\.href\} aria-current=\{atual\(cargo\.href\)\}>\{cargo\.nome\}<\/a>/);
  // só os cargos do Executivo: são os que registram programa de governo no TSE
  assert.deepEqual(CARGOS.map((c) => c.nome), ['Presidente', 'Governador']);
  // governador fica fora do menu e da home até haver comparação de alguma UF (13/09)
  assert.deepEqual(CARGOS_NO_MENU.map((c) => c.nome), ['Presidente']);
  assert.equal(CARGOS.find((c) => c.slug === 'presidente').href, '/presidente');
});

test('as seções Candidatos, Acervo, Senador e Governador estão fora do menu', () => {
  for (const href of ['/candidato', '/acervo', '/senador', '/governador']) assert.doesNotMatch(base, new RegExp(`href="${href}"`));
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

test('presidente tem o hub e a rota de tema; a conversa por candidato saiu', () => {
  assert.ok(existsSync(`${ROOT}/src/pages/presidente/index.astro`));
  assert.ok(existsSync(`${ROOT}/src/pages/presidente/[tema].astro`));
  assert.ok(!existsSync(`${ROOT}/src/pages/presidente/[slug].astro`));
  assert.ok(!existsSync(`${ROOT}/src/pages/[cargo]/[uf]/[slug].astro`));
});
