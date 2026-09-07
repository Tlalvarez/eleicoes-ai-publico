/**
 * O bloco de cobertura — o que ele pode AFIRMAR.
 *
 * O caso que trouxe estes testes veio de produção, no celular do Thiago:
 * uma resposta que dizia "não encontrei material sobre receita de strogonoff"
 * com o bloco embaixo anunciando "13 têm material no acervo. De um deles, nada
 * que responda a esta pergunta" — lido por qualquer pessoa como "então doze
 * responderam", quando ninguém respondeu.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cobertura, ehNaoLocalizacao } from '../src/lib/cobertura.mjs';

const com = (nome) => ({ nome, situacao: 'com_material' });
const semNaConsulta = (nome) => ({ nome, situacao: 'sem_material_na_consulta' });
const semNoAcervo = (nome, lacuna_causa) => ({ nome, situacao: 'sem_material_no_acervo', lacuna_causa });

test('resposta que não encontrou nada não afirma que alguém tinha material', () => {
  const r = cobertura({
    candidatos: [...Array(12)].map((_, i) => com(`C${i}`)).concat(semNaConsulta('Décimo terceiro')),
    texto: 'Não encontrei material sobre receita de strogonoff.',
    alvo: 'candidatos a presidente',
  });

  // sem lacuna de acervo, não sobra o que dizer — o bloco não aparece
  assert.equal(r, null);
});

test('mesmo caso, mas com lacuna de acervo: o bloco fica, sem falar da busca', () => {
  const r = cobertura({
    candidatos: [com('A'), com('B'), semNaConsulta('C'), semNoAcervo('D', 'sem_fonte_declarada')],
    texto: 'Não encontrei material sobre isso.',
    alvo: 'candidatos a presidente',
  });

  assert.equal(r.resumo, '4 candidatos a presidente.');
  assert.doesNotMatch(r.resumo, /material no acervo/);
  assert.doesNotMatch(r.resumo, /nada que responda/);
  assert.deepEqual(r.lacunas, [{ causa: 'sem_fonte_declarada', nomes: ['D'] }]);
});

test('resposta que encontrou material continua contando a busca', () => {
  const r = cobertura({
    candidatos: [com('A'), com('B'), semNaConsulta('C'), semNoAcervo('D', 'sem_fonte_declarada')],
    texto: 'A propõe X [S1] e B propõe Y [S2].',
    alvo: 'candidatos — Governador de São Paulo',
  });

  assert.equal(r.resumo,
    '4 candidatos — Governador de São Paulo. 3 têm material no acervo. '
    + 'De um deles, nada que responda a esta pergunta.');
});

test('sem lacuna nenhuma não há bloco, e com um candidato só também não', () => {
  assert.equal(cobertura({ candidatos: [com('A'), com('B')], texto: 'x', alvo: 'y' }), null);
  assert.equal(cobertura({ candidatos: [semNoAcervo('A', 'x')], texto: 'y', alvo: 'z' }), null);
});

test('causa ausente vira a causa genérica, nunca uma linha vazia', () => {
  const r = cobertura({
    candidatos: [com('A'), com('B'), semNoAcervo('C', null)],
    texto: 'A propõe X [S1].', alvo: 'candidatos a presidente',
  });

  assert.deepEqual(r.lacunas, [{ causa: 'sem_material_coletado', nomes: ['C'] }]);
});

test('a página tem a autoridade sobre a causa; o payload é o reserva', () => {
  const r = cobertura({
    candidatos: [com('A'), com('B'), semNoAcervo('C', 'so_canal_de_partido')],
    texto: 'A propõe X [S1].', alvo: 'candidatos a presidente',
    causaDe: () => 'sem_fonte_declarada',
  });

  assert.equal(r.lacunas[0].causa, 'sem_fonte_declarada');
});

test('ehNaoLocalizacao reconhece a frase do formato, e só ela', () => {
  assert.ok(ehNaoLocalizacao('Não encontrei material sobre isso.'));
  assert.ok(ehNaoLocalizacao('nenhum documento fala disso'));
  assert.ok(!ehNaoLocalizacao('O plano propõe imposto único [S1].'));
});
