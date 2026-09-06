/**
 * A porta da medição (src/lib/medicao.mjs).
 *
 * O que se prova aqui é a promessa de /privacidade: "os eventos são anônimos"
 * e "o texto da pergunta é mascarado nas medições". A prova não é um comentário
 * dizendo que ninguém vai mandar a pergunta — é o filtro recusando.
 *
 * A invariante que o resto se apoia: **prosa tem espaço; texto com espaço não
 * passa**. Pergunta, resposta, nome de pessoa e trecho de fonte são prosa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTEXTO, EVENTOS, LIMITE_TEXTO, contextoAtual, contextoDoCaminho, defineContexto,
  defineContextoPadrao, faixaDeTamanho, limpaContexto, medir, saneia, valorAceito,
} from '../src/lib/medicao.mjs';

const PERGUNTA = 'o que os candidatos a governador propõem para a segurança pública?';

test('evento não declarado não é enviado', () => {
  limpaContexto();
  assert.equal(saneia('evento_inventado', { turno: 1 }), null);
  assert.equal(medir('evento_inventado', { turno: 1 }), false);
});

test('propriedade fora da lista do evento é descartada', () => {
  limpaContexto();
  const saida = saneia('pergunta_enviada', { turno: 2, pergunta: PERGUNTA, texto: 'x' });
  assert.deepEqual(saida, { turno: 2 });
});

test('nenhum evento declara uma chave de conteúdo', () => {
  const proibidas = ['pergunta', 'texto', 'resposta', 'q', 'url', 'nome', 'email', 'id'];
  for (const [evento, chaves] of Object.entries(EVENTOS)) {
    for (const chave of chaves) {
      assert.ok(!proibidas.includes(chave), `${evento} declara a chave ${chave}`);
      assert.ok(!CONTEXTO.includes(chave), `${evento} redeclara o contexto ${chave}`);
    }
  }
});

test('texto com espaço nunca passa — nem numa chave permitida', () => {
  limpaContexto();
  // `codigo` é uma chave legítima; o valor é que não pode ser prosa
  assert.deepEqual(saneia('resposta_falhou', { turno: 1, codigo: PERGUNTA }), { turno: 1 });
  assert.equal(valorAceito('duas palavras'), undefined);
  assert.equal(valorAceito(PERGUNTA), undefined);
});

test('texto longo não passa, mesmo sem espaço', () => {
  assert.equal(valorAceito('a'.repeat(LIMITE_TEXTO)), 'a'.repeat(LIMITE_TEXTO));
  assert.equal(valorAceito('a'.repeat(LIMITE_TEXTO + 1)), undefined);
});

test('os valores que o produto realmente manda passam', () => {
  for (const bom of ['sp', 'presidente', 'romeu-zema', 'rel_2026-09-06_01', 'post-instagram',
    'sem-followup', '/governador/sp', 'whatsapp', 'markdown']) {
    assert.equal(valorAceito(bom), bom, `recusou ${bom}`);
  }
  assert.equal(valorAceito(1420), 1420);
  assert.equal(valorAceito(0), 0);
  assert.equal(valorAceito(true), true);
  assert.equal(valorAceito(false), false);
});

test('valor que não é primitivo, ou vazio, some', () => {
  for (const ruim of [undefined, null, '', '   ', NaN, Infinity, {}, [], ['sp'], () => 'sp',
    new Date()]) {
    assert.equal(valorAceito(ruim), undefined, `aceitou ${String(ruim)}`);
  }
  // acento é prosa: nome de candidato não vira dimensão
  assert.equal(valorAceito('João'), undefined);
});

test('o contexto acompanha todo evento e é filtrado igual', () => {
  limpaContexto();
  defineContexto({ cargo: 'governador', uf: 'sp', pagina: 'uf', pergunta: PERGUNTA });
  assert.deepEqual(contextoAtual(), { cargo: 'governador', uf: 'sp', pagina: 'uf' });
  assert.deepEqual(saneia('turno_apagado'), { cargo: 'governador', uf: 'sp', pagina: 'uf' });
  // UF vazia (home) é ausência de dimensão, não dimensão vazia
  defineContexto({ cargo: 'presidente', uf: '', pagina: 'home' });
  assert.deepEqual(contextoAtual(), { cargo: 'presidente', pagina: 'home' });
});

test('o contexto do chat vence o do layout, em qualquer ordem de script', () => {
  // layout primeiro (ordem usual), chat depois: vale o do chat
  limpaContexto();
  defineContextoPadrao({ cargo: '', uf: '', pagina: 'resposta' });
  defineContexto({ cargo: 'senador', uf: 'rj', pagina: 'resposta' });
  assert.deepEqual(contextoAtual(), { cargo: 'senador', uf: 'rj', pagina: 'resposta' });
  // chat primeiro, layout depois: o layout cede
  limpaContexto();
  defineContexto({ cargo: 'senador', uf: 'rj', pagina: 'resposta' });
  defineContextoPadrao({ cargo: '', uf: '', pagina: 'resposta' });
  assert.deepEqual(contextoAtual(), { cargo: 'senador', uf: 'rj', pagina: 'resposta' });
});

test('o contexto sai do endereço, e endereço inventado não vira dimensão', () => {
  assert.deepEqual(contextoDoCaminho('/'), { cargo: 'presidente', uf: '', pagina: 'home' });
  assert.deepEqual(contextoDoCaminho('/index.html'),
    { cargo: 'presidente', uf: '', pagina: 'home' });
  assert.deepEqual(contextoDoCaminho('/governador'),
    { cargo: 'governador', uf: '', pagina: 'cargo' });
  assert.deepEqual(contextoDoCaminho('/governador/sp'),
    { cargo: 'governador', uf: 'sp', pagina: 'uf' });
  assert.deepEqual(contextoDoCaminho('/governador/sp/romeu-zema'),
    { cargo: 'governador', uf: 'sp', pagina: 'candidato' });
  assert.deepEqual(contextoDoCaminho('/presidente/lula'),
    { cargo: 'presidente', uf: '', pagina: 'candidato' });
  assert.deepEqual(contextoDoCaminho('/sobre'), { cargo: '', uf: '', pagina: 'sobre' });
  // a página de uma resposta guardada não exporta o id nem por engano
  assert.deepEqual(contextoDoCaminho('/resposta/Ab3-_xYz01234567890abc'),
    { cargo: '', uf: '', pagina: 'resposta' });
  // caminho que não existe não abre dimensão nova de cargo
  assert.deepEqual(contextoDoCaminho('/xpto/yz'), { cargo: '', uf: '', pagina: 'xpto' });
});

test('a pergunta vira faixa, nunca contagem exata', () => {
  assert.equal(faixaDeTamanho('quem é lula?'), 'curta');
  assert.equal(faixaDeTamanho(PERGUNTA), 'media');
  assert.equal(faixaDeTamanho('a'.repeat(300)), 'longa');
  assert.equal(faixaDeTamanho(''), 'curta');
  assert.equal(faixaDeTamanho(null), 'curta');
});

test('medir entrega ao PostHog exatamente o que saneia devolve', () => {
  limpaContexto();
  defineContexto({ cargo: 'governador', uf: 'mg', pagina: 'uf' });
  const enviados = [];
  const antes = globalThis.posthog;
  globalThis.posthog = { capture: (evento, props) => enviados.push([evento, props]) };
  try {
    assert.equal(medir('resposta_recebida', {
      turno: 1, ms: 8200, fontes: 6, sem_fontes: false, release_id: 'rel_2026-09-06_01',
      texto: 'não devia estar aqui', pergunta: PERGUNTA,
    }), true);
  } finally {
    globalThis.posthog = antes;
  }
  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0], ['resposta_recebida', {
    cargo: 'governador', uf: 'mg', pagina: 'uf',
    turno: 1, ms: 8200, fontes: 6, sem_fontes: false, release_id: 'rel_2026-09-06_01',
  }]);
});

test('sem PostHog carregado, medir é um no-op silencioso', () => {
  limpaContexto();
  const antes = globalThis.posthog;
  globalThis.posthog = undefined;
  try {
    assert.equal(medir('turno_apagado'), false);
  } finally {
    globalThis.posthog = antes;
  }
});

test('PostHog que lança não derruba a conversa', () => {
  limpaContexto();
  const antes = globalThis.posthog;
  globalThis.posthog = { capture() { throw new Error('bloqueado'); } };
  try {
    assert.equal(medir('turno_apagado'), false);
  } finally {
    globalThis.posthog = antes;
  }
});
