import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CARGOS, CARGOS_NO_MENU } from '../src/lib/cargos.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const base = readFileSync(`${ROOT}/src/layouts/Base.astro`, 'utf8');

test('menu: Presidente e Governador vêm da lista de cargos; Metodologia entra ao lado', () => {
  // o menu deixou de ser só de cargos em 16/09, e o rótulo acompanhou: Metodologia
  // está lá dentro e chamar o conjunto de "Cargos" enganaria quem usa leitor de tela
  assert.match(base, /<nav class="main" aria-label="Seções">/);
  assert.match(base, /CARGOS_NO_MENU\.map/);
  assert.match(base, /<a href="\/metodologia" aria-current=\{caminhoPublico\.startsWith\('\/metodologia'\) \? 'page' : undefined\}>Metodologia<\/a>/,
    'Metodologia no menu, marcada quando é a página atual');
  // e fora da lista de cargos: ela não registra programa no TSE
  assert.deepEqual(CARGOS_NO_MENU.map((c) => c.nome), ['Presidente', 'Governador']);
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

test('no celular o menu desce para a fileira dele, em vez de sair cortado', () => {
  // Com dois cargos o menu cabia ao lado da marca em qualquer largura. Com
  // Metodologia (16/09) ele passou a pedir 446px, e em 425px o terceiro item
  // aparecia cortado na borda. A saída é mudar de fileira, não encolher a fonte:
  // fonte menor levaria junto o alvo de toque de 44px.
  const css = readFileSync(`${ROOT}/src/styles/global.css`, 'utf8');
  const m = css.match(/@media \(max-width: 520px\) \{([\s\S]*?)\n\}/);
  assert.ok(m, 'sumiu a regra que dá fileira própria ao menu no celular');
  assert.match(m[1], /nav\.main \{[^}]*flex-basis: 100%/, 'o menu não ocupa a fileira inteira');
  assert.match(m[1], /header\.site \.inner \{[^}]*flex-wrap: wrap/, 'o cabeçalho não deixa o menu quebrar');
});
