/**
 * Os produtos derivados publicam o MESMO conjunto de candidatos — os mesmos
 * slugs e os mesmos nomes, sem sobra e sem falta.
 *
 * A checagem que existia aceitava qualquer quantidade: `resumo.json` e
 * `indice.json` podiam trazer cinco candidatos e `npm test` anunciava sucesso
 * "para 5". Um candidato que sumisse de um dos dois — uma exportação que
 * falhou no meio, um slug renomeado só de um lado — passaria batido, e o site
 * ficaria com hub sem acervo (ou acervo sem hub) sem uma linha de erro.
 *
 * A fixture é SINTÉTICA e tem 13 candidatos, que é o tamanho da próxima onda:
 * a prova não é "hoje são cinco", é "some um e o gate cai".
 *
 * A lista ESPERADA não é mais um parâmetro opcional: ela é a primeira fonte da
 * comparação, e o gate a lê de `src/data/candidatos.json` (versionado). Ver
 * test/catalogo-canonico.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { catalogoDoResumo, catalogoDoIndice, comparaCatalogos } from '../src/lib/catalogo.mjs';

const TREZE = Object.fromEntries(Array.from({ length: 13 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return [`candidata-${n}`, `Candidata ${n}`];
}));

const resumoDe = (mapa) => ({
  candidatos: Object.fromEntries(
    Object.entries(mapa).map(([slug, nome]) => [slug, { nome, total: 1, anos: ['2026'] }])),
});
const indiceDe = (mapa) => ({
  candidatos: Object.fromEntries(
    Object.entries(mapa).map(([slug, nome]) => [slug, { nome, tipos: {} }])),
});

const fontes = (resumo, indice) => ({
  'data/itens/resumo.json': catalogoDoResumo(resumo),
  'data/acervo/indice.json': catalogoDoIndice(indice),
});

test('treze de cada lado, iguais: nenhuma falha', () => {
  assert.deepEqual(comparaCatalogos(fontes(resumoDe(TREZE), indiceDe(TREZE))), []);
});

test('a comparação enxerga os treze — não é um "ok" vazio', () => {
  const cat = catalogoDoResumo(resumoDe(TREZE));
  assert.equal(Object.keys(cat).length, 13);
});

test('candidato que falta no acervo derruba o gate', () => {
  const { 'candidata-07': _, ...faltando } = TREZE;
  const falhas = comparaCatalogos(fontes(resumoDe(TREZE), indiceDe(faltando)));

  assert.equal(falhas.length, 1);
  assert.match(falhas[0], /candidata-07/);
  assert.match(falhas[0], /indice\.json/);
});

test('candidato que sobra no acervo derruba o gate', () => {
  const sobrando = { ...TREZE, 'candidata-14': 'Candidata 14' };
  const falhas = comparaCatalogos(fontes(resumoDe(TREZE), indiceDe(sobrando)));

  assert.equal(falhas.length, 1);
  assert.match(falhas[0], /candidata-14/);
});

test('nome público diferente entre as fontes derruba o gate', () => {
  const outroNome = { ...TREZE, 'candidata-03': 'Candidata Três' };
  const falhas = comparaCatalogos(fontes(resumoDe(TREZE), indiceDe(outroNome)));

  assert.equal(falhas.length, 1);
  assert.match(falhas[0], /candidata-03/);
  assert.match(falhas[0], /Candidata Três/);
});

test('catálogo vazio é falha, não sucesso silencioso', () => {
  const falhas = comparaCatalogos(fontes(resumoDe({}), indiceDe({})));

  assert.equal(falhas.length, 1);
  assert.match(falhas[0], /nenhum candidato/i);
});

test('a PRIMEIRA fonte é a autoridade — os demais são conferidos contra ela', () => {
  // o parâmetro `esperados` opcional saiu: a lista esperada agora é uma fonte
  // como as outras, posta na frente por quem chama (o gate põe o canônico
  // versionado). Dois derivados errados do mesmo jeito não se validam mais.
  const { 'candidata-13': _, ...doze } = TREZE;

  const falhas = comparaCatalogos({
    'src/data/candidatos.json (canônico)': TREZE,
    'data/itens/resumo.json': doze,
    'data/acervo/indice.json': doze,
  });

  assert.equal(falhas.length, 2, falhas.join(' | '));
  for (const falha of falhas) assert.match(falha, /candidata-13/);
});

test('candidato a mais num derivado é cobrado contra a autoridade', () => {
  const falhas = comparaCatalogos({
    'src/data/candidatos.json (canônico)': Object.fromEntries(
      Object.entries(TREZE).slice(0, 12)),
    'data/itens/resumo.json': TREZE,
  });

  assert.ok(falhas.some((f) => /candidata-13/.test(f)), falhas.join(' | '));
});
