import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CARGOS, CARGOS_POR_UF, UFS, cargoPorSlug, caminhoUf, rotuloEscopo, ufPorSigla,
} from '../src/lib/cargos.mjs';
import { fichaTse, urlCandidaturaTse, urlFotoCandidaturaTse } from '../src/lib/tse.mjs';

test('quatro cargos, presidente na home e os outros três por UF', () => {
  assert.deepEqual(CARGOS.map((c) => c.slug), ['presidente', 'governador', 'deputado-federal']);
  assert.equal(cargoPorSlug('presidente').href, '/');
  assert.deepEqual(CARGOS_POR_UF.map((c) => c.slug), ['governador', 'deputado-federal']);
});

test('27 unidades da federação, siglas únicas', () => {
  assert.equal(UFS.length, 27);
  assert.equal(new Set(UFS.map((u) => u.sigla)).size, 27);
  assert.equal(ufPorSigla('sp').nome, 'São Paulo');
  assert.equal(ufPorSigla('XX'), null);
});

test('o rótulo do escopo sai em português, com a contração certa', () => {
  assert.equal(rotuloEscopo(cargoPorSlug('governador'), ufPorSigla('SP')), 'Governador de São Paulo');
  assert.equal(rotuloEscopo(cargoPorSlug('governador'), ufPorSigla('RJ')), 'Governador do Rio de Janeiro');
  assert.equal(rotuloEscopo(cargoPorSlug('governador'), ufPorSigla('BA')), 'Governador da Bahia');
  assert.equal(rotuloEscopo(cargoPorSlug('deputado-federal'), ufPorSigla('PA')), 'Deputado federal pelo Pará');
  assert.equal(rotuloEscopo(cargoPorSlug('presidente')), 'Presidente');
});

test('a rota de uma UF é minúscula e fica sob o cargo', () => {
  assert.equal(caminhoUf(cargoPorSlug('governador'), ufPorSigla('MG')), '/governador/mg');
});

test('cada candidatura da home tem endereço oficial no TSE', () => {
  assert.equal(urlCandidaturaTse('lula'),
    'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/BR/20322002026/280002542548/2026/BR');
  assert.throws(() => urlCandidaturaTse('ninguem'), /sem identificador/);
  assert.equal(urlFotoCandidaturaTse('lula'),
    'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/280002542548/BR');
});

test('cada candidatura a presidente declara partido e número, do catálogo oficial', () => {
  assert.deepEqual(fichaTse('lula'), { partido: 'PT', numero: 13 });
  assert.throws(() => fichaTse('ninguem'), /sem partido/);
});

test('senador está suspenso até a coleta ficar completa (05/09/2026)', () => {
  assert.equal(cargoPorSlug('senador'), null);
  assert.ok(!CARGOS.some((c) => c.href === '/senador'));
});
