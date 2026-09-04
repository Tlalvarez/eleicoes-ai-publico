import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARGOS_POR_UF, UFS } from '../src/lib/cargos.mjs';
import {
  candidaturas, nomeLegivel, todasCandidaturas, totais, urlFotoTse, urlTseUf,
} from '../src/lib/candidaturas-uf.mjs';

test('o snapshot do TSE cobre os três cargos por UF, nas contagens do DivulgaCandContas', () => {
  const t = totais();
  assert.equal(t.total, 8278);
  assert.deepEqual(t.por_cargo, { governador: 198, senador: 318, 'deputado-federal': 7762 });
});

test('toda UF tem candidatos aos três cargos e as somas batem', () => {
  for (const cargo of CARGOS_POR_UF) {
    let soma = 0;
    for (const uf of UFS) {
      const n = candidaturas(cargo.slug, uf.sigla).length;
      assert.ok(n > 0, `${cargo.slug}/${uf.sigla} sem candidatos`);
      soma += n;
    }
    assert.equal(soma, totais().por_cargo[cargo.slug]);
  }
});

test('slugs únicos e em ordem alfabética por nome — nunca por volume', () => {
  const todas = todasCandidaturas();
  assert.equal(new Set(todas.map((c) => c.slug)).size, todas.length);
  const sp = candidaturas('governador', 'sp').map((c) => c.nome);
  assert.deepEqual(sp, [...sp].sort((a, b) => a.localeCompare(b, 'pt-BR')));
});

test('nome de urna em caixa alta vira nome legível, com partículas minúsculas', () => {
  assert.equal(nomeLegivel('MARIA DA PENHA'), 'Maria da Penha');
  assert.equal(nomeLegivel('DR. JOÃO DOS SANTOS'), 'Dr. João dos Santos');
  assert.equal(nomeLegivel('DE PAULA'), 'De Paula');
});

test('foto e página no TSE seguem os formatos que a interface do TSE realmente serve', () => {
  const c = { id: '250002550913', uf: 'SP' };
  assert.equal(urlFotoTse(c), 'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/250002550913/SP');
  assert.equal(urlTseUf(c), 'https://divulgacandcontas.tse.jus.br/divulga/#/candidato/BR/SP/20322002026/250002550913/2026/SP');
});

test('nenhum dado pessoal sensível no snapshot', () => {
  for (const c of todasCandidaturas()) {
    for (const chave of Object.keys(c)) assert.doesNotMatch(chave, /cpf|titulo|nascimento|email/i);
  }
});
