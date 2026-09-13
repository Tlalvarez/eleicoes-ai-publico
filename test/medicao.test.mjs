/**
 * A porta da medição (src/lib/medicao.mjs).
 *
 * O que se prova aqui é a promessa de /privacidade: "os eventos são anônimos"
 * e só vão números, siglas e códigos. A prova não é um comentário dizendo que
 * ninguém vai mandar texto — é o filtro recusando.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTEXTO, EVENTOS, LIMITE_TEXTO, contextoAtual, contextoDoCaminho, defineContexto,
  defineContextoPadrao, limpaContexto, medir, saneia, valorAceito,
} from '../src/lib/medicao.mjs';

const PROSA = 'Tornar a melhoria da aprendizagem na educação básica a prioridade da ação federal';

test('evento não declarado não é enviado', () => {
  limpaContexto();
  assert.equal(saneia('evento_inventado', { tema: 'educacao' }), null);
  assert.equal(medir('evento_inventado', { tema: 'educacao' }), false);
});

test('propriedade fora da lista do evento é descartada — o `evento` do data-* inclusive', () => {
  limpaContexto();
  // o layout manda `{ ...alvo.dataset }`: evento, origem, tema, e o que mais houver
  const saida = saneia('tema_aberto', { evento: 'tema_aberto', tema: 'educacao', origem: 'home', texto: PROSA, slug: 'x' });
  assert.deepEqual(saida, { tema: 'educacao', origem: 'home' });
});

test('nenhum evento declara uma chave de conteúdo', () => {
  const proibidas = ['pergunta', 'texto', 'resposta', 'proposta', 'q', 'url', 'nome', 'email', 'id'];
  for (const [evento, chaves] of Object.entries(EVENTOS)) {
    for (const chave of chaves) {
      assert.ok(!proibidas.includes(chave), `${evento} declara a chave ${chave}`);
      assert.ok(!CONTEXTO.includes(chave), `${evento} redeclara o contexto ${chave}`);
    }
  }
});

test('texto com espaço nunca passa — nem numa chave permitida', () => {
  limpaContexto();
  // `tema` é uma chave legítima; o valor é que não pode ser prosa
  assert.deepEqual(saneia('proposta_aberta', { tema: PROSA, candidatos: 3 }), { candidatos: 3 });
  assert.equal(valorAceito('duas palavras'), undefined);
  assert.equal(valorAceito(PROSA), undefined);
});

test('texto longo não passa, mesmo sem espaço', () => {
  assert.equal(valorAceito('a'.repeat(LIMITE_TEXTO)), 'a'.repeat(LIMITE_TEXTO));
  assert.equal(valorAceito('a'.repeat(LIMITE_TEXTO + 1)), undefined);
});

test('os valores que o produto realmente manda passam', () => {
  for (const bom of ['sp', 'presidente', 'romeu-zema', 'seguranca-justica', 'faixa', 'hub', 'home', '/governador/sp']) {
    assert.equal(valorAceito(bom), bom, `recusou ${bom}`);
  }
  assert.equal(valorAceito(5), 5);
  assert.equal(valorAceito(0), 0);
  assert.equal(valorAceito(true), true);
  assert.equal(valorAceito(false), false);
});

test('valor que não é primitivo, ou vazio, some', () => {
  for (const ruim of [undefined, null, '', '   ', NaN, Infinity, {}, [], ['sp'], () => 'sp', new Date()]) {
    assert.equal(valorAceito(ruim), undefined, `aceitou ${String(ruim)}`);
  }
  // acento é prosa: nome de candidato não vira dimensão
  assert.equal(valorAceito('João'), undefined);
});

test('o contexto acompanha todo evento e é filtrado igual', () => {
  limpaContexto();
  defineContexto({ cargo: 'governador', uf: 'sp', pagina: 'uf', texto: PROSA });
  assert.deepEqual(contextoAtual(), { cargo: 'governador', uf: 'sp', pagina: 'uf' });
  assert.deepEqual(saneia('uf_aberta', { destino: 'mg' }), { cargo: 'governador', uf: 'sp', pagina: 'uf', destino: 'mg' });
  // UF vazia (home) é ausência de dimensão, não dimensão vazia
  defineContexto({ cargo: '', uf: '', pagina: 'home' });
  assert.deepEqual(contextoAtual(), { pagina: 'home' });
});

test('o contexto definido por uma página vence o do layout, em qualquer ordem de script', () => {
  limpaContexto();
  defineContextoPadrao({ cargo: '', uf: '', pagina: 'outra' });
  defineContexto({ cargo: 'governador', uf: 'rj', pagina: 'tema' });
  assert.deepEqual(contextoAtual(), { cargo: 'governador', uf: 'rj', pagina: 'tema' });
  limpaContexto();
  defineContexto({ cargo: 'governador', uf: 'rj', pagina: 'tema' });
  defineContextoPadrao({ cargo: '', uf: '', pagina: 'outra' });
  assert.deepEqual(contextoAtual(), { cargo: 'governador', uf: 'rj', pagina: 'tema' });
});

test('o contexto sai do endereço, e endereço inventado não vira dimensão', () => {
  assert.deepEqual(contextoDoCaminho('/'), { cargo: '', uf: '', pagina: 'home' });
  assert.deepEqual(contextoDoCaminho('/index.html'), { cargo: '', uf: '', pagina: 'home' });
  assert.deepEqual(contextoDoCaminho('/presidente'), { cargo: 'presidente', uf: '', pagina: 'cargo' });
  assert.deepEqual(contextoDoCaminho('/presidente/educacao'), { cargo: 'presidente', uf: '', pagina: 'tema' });
  assert.deepEqual(contextoDoCaminho('/governador'), { cargo: 'governador', uf: '', pagina: 'cargo' });
  assert.deepEqual(contextoDoCaminho('/governador/sp'), { cargo: 'governador', uf: 'sp', pagina: 'uf' });
  assert.deepEqual(contextoDoCaminho('/governador/sp/saude.html'), { cargo: 'governador', uf: 'sp', pagina: 'tema' });
  assert.deepEqual(contextoDoCaminho('/sobre'), { cargo: '', uf: '', pagina: 'sobre' });
  // caminho que não existe não abre dimensão nova de cargo
  assert.deepEqual(contextoDoCaminho('/xpto/yz'), { cargo: '', uf: '', pagina: 'xpto' });
});

test('medir entrega ao PostHog exatamente o que saneia devolve', () => {
  limpaContexto();
  defineContexto({ cargo: 'presidente', uf: '', pagina: 'tema' });
  const enviados = [];
  const antes = globalThis.posthog;
  globalThis.posthog = { capture: (evento, props) => enviados.push([evento, props]) };
  try {
    assert.equal(medir('proposta_aberta', { tema: 'educacao', candidatos: 3, com_contra: true, texto: PROSA }), true);
  } finally {
    globalThis.posthog = antes;
  }
  assert.deepEqual(enviados, [['proposta_aberta', { cargo: 'presidente', pagina: 'tema', tema: 'educacao', candidatos: 3, com_contra: true }]]);
});

test('sem PostHog carregado, medir é um no-op silencioso', () => {
  limpaContexto();
  const antes = globalThis.posthog;
  globalThis.posthog = undefined;
  try { assert.equal(medir('uf_aberta', { destino: 'sp' }), false); } finally { globalThis.posthog = antes; }
});

test('PostHog que lança não derruba a página', () => {
  limpaContexto();
  const antes = globalThis.posthog;
  globalThis.posthog = { capture() { throw new Error('bloqueado'); } };
  try { assert.equal(medir('uf_aberta', { destino: 'sp' }), false); } finally { globalThis.posthog = antes; }
});
