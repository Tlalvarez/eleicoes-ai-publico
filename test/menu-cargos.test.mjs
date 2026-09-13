import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CARGOS, CARGOS_NO_MENU } from '../src/lib/cargos.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const base = readFileSync(`${ROOT}/src/layouts/Base.astro`, 'utf8');

test('sem menu enquanto só presidente está no ar; a lista de cargos continua sendo a autoridade', () => {
  assert.doesNotMatch(base, /<nav class="main"/);
  assert.doesNotMatch(base, /menu-aberto/);
  // só os cargos do Executivo: são os que registram programa de governo no TSE
  assert.deepEqual(CARGOS.map((c) => c.nome), ['Presidente', 'Governador']);
  // governador fica fora da home até haver comparação de alguma UF (13/09)
  assert.deepEqual(CARGOS_NO_MENU.map((c) => c.nome), ['Presidente']);
  assert.equal(CARGOS.find((c) => c.slug === 'presidente').href, '/presidente');
});

test('o cabeçalho só tem a marca: nenhum link de seção', () => {
  for (const href of ['/candidato', '/acervo', '/senador', '/governador', '/presidente']) assert.doesNotMatch(base, new RegExp(`href="${href}"`));
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
