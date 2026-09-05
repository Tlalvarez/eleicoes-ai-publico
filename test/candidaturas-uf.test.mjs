import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARGOS_POR_UF, UFS } from '../src/lib/cargos.mjs';
import {
  candidaturas, deduplicaPorPessoa, nomeLegivel, todasCandidaturas, totais, urlFotoTse, urlTseUf,
} from '../src/lib/candidaturas-uf.mjs';

test('o snapshot do TSE cobre os três cargos por UF: as 8.278 linhas do DivulgaCandContas menos 18 registros repetidos da mesma pessoa', () => {
  const t = totais();
  assert.equal(t.total, 8278 - 18);
  assert.deepEqual(t.por_cargo, { governador: 198 - 1, senador: 318 - 1, 'deputado-federal': 7762 - 16 });
});

test('nenhuma pessoa aparece duas vezes no mesmo cargo e UF (era o caso de Guto Schiavetto, senador/SP)', () => {
  const vistos = new Map();
  for (const c of todasCandidaturas()) {
    const k = `${c.cargo}|${c.uf}|${c.nome_completo}`;
    assert.equal(vistos.has(k), false, `${k} aparece duas vezes: ${vistos.get(k)} e ${c.id}`);
    vistos.set(k, c.id);
  }
  const guto = candidaturas('senador', 'sp').filter((c) => /schiavetto/i.test(c.nome));
  assert.equal(guto.length, 1);
  // fica o registro mais recente (id maior) — o que tem material no acervo
  assert.equal(guto[0].id, '250002554075');
});

test('entre dois registros da mesma pessoa fica o mais vivo no TSE; em empate, o mais recente', () => {
  const base = { cargo: 'deputado-federal', uf: 'BA', nome_completo: 'SANDRO FERREIRA SOUZA' };
  // situação decide antes do id: Deferido (id menor) vence Renúncia (id maior)
  const porSituacao = deduplicaPorPessoa([
    { ...base, id: '50002535397', nome_urna: 'PASTOR SANDRO', numero: 2522, partido: 'PRD', situacao: 'Renúncia' },
    { ...base, id: '50002546410', nome_urna: 'PASTOR SANDRO', numero: 7725, partido: 'SOLIDARIEDADE', situacao: 'Deferido' },
  ]);
  assert.deepEqual(porSituacao.map((c) => c.id), ['50002546410']);
  const deferidoAntigo = deduplicaPorPessoa([
    { ...base, id: '1', nome_urna: 'A', situacao: 'Deferido' },
    { ...base, id: '2', nome_urna: 'A', situacao: 'Aguardando julgamento' },
  ]);
  assert.deepEqual(deferidoAntigo.map((c) => c.id), ['1']);
  // empate de situação: o id sequencial maior é o pedido mais recente
  const empate = deduplicaPorPessoa([
    { ...base, id: '250002554075', nome_urna: 'GUTO', situacao: 'Aguardando julgamento' },
    { ...base, id: '250002553928', nome_urna: 'GUTO', situacao: 'Aguardando julgamento' },
  ]);
  assert.deepEqual(empate.map((c) => c.id), ['250002554075']);
  // nome de urna diferente, mesma pessoa (nome completo igual, acento à parte)
  const grafia = deduplicaPorPessoa([
    { ...base, id: '1', nome_completo: 'JOAO FRANCISCO DE ASSIS NETO', nome_urna: 'DR. JOAO NETO', situacao: 'Aguardando julgamento' },
    { ...base, id: '2', nome_completo: 'JOÃO FRANCISCO DE ASSIS NETO', nome_urna: 'DR JOÃO NETO', situacao: 'Aguardando julgamento' },
  ]);
  assert.equal(grafia.length, 1);
});

test('pessoas diferentes nunca são fundidas: mesmo número e partido, ou mesma pessoa em cargos/UFs diferentes', () => {
  const vaga = deduplicaPorPessoa([
    { cargo: 'deputado-federal', uf: 'CE', id: '1', nome_completo: 'PEDRO BRITO', nome_urna: 'PEDRO BRITO', numero: 1234, partido: 'X', situacao: 'Renúncia' },
    { cargo: 'deputado-federal', uf: 'CE', id: '2', nome_completo: 'VERA LUCIA', nome_urna: 'VERA LÚCIA', numero: 1234, partido: 'X', situacao: 'Deferido' },
  ]);
  assert.equal(vaga.length, 2);
  const cargos = deduplicaPorPessoa([
    { cargo: 'senador', uf: 'SP', id: '1', nome_completo: 'RICARDO SCHIAVETTO', situacao: 'Aguardando julgamento' },
    { cargo: 'deputado-federal', uf: 'SP', id: '2', nome_completo: 'RICARDO SCHIAVETTO', situacao: 'Renúncia' },
    { cargo: 'senador', uf: 'RJ', id: '3', nome_completo: 'RICARDO SCHIAVETTO', situacao: 'Deferido' },
  ]);
  assert.equal(cargos.length, 3);
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
