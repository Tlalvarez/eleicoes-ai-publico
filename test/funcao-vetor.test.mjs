/**
 * A Function `/api/vetor`: valida a consulta, limita por IP, chama a Jina
 * com a chave do ambiente e devolve só o vetor. Sem rede: o fetch é falso.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSOES, LIMITE_POR_MINUTO, MAX_CHARS, consultaValida, dentroDoLimite, onRequestPost } from '../functions/api/vetor.js';

const pedido = (corpo, ip = '1.2.3.4') => new Request('https://eleicoes.ai/api/vetor', {
  method: 'POST', headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'application/json' }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
});

test('a consulta é limpa e limitada', () => {
  assert.equal(consultaValida('  escala   6x1 '), 'escala 6x1');
  assert.equal(consultaValida(''), null);
  assert.equal(consultaValida(42), null);
  assert.equal(consultaValida('a'.repeat(MAX_CHARS + 1)), null);
});

test('limite por IP: o 31º pedido no minuto é recusado, e a janela anda', () => {
  const mapa = new Map();
  for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) assert.ok(dentroDoLimite('x', 1000 + i, mapa));
  assert.equal(dentroDoLimite('x', 2000, mapa), false);
  assert.ok(dentroDoLimite('y', 2000, mapa), 'outro IP não é afetado');
  assert.ok(dentroDoLimite('x', 1000 + 61_000, mapa), 'passado um minuto, cabe de novo');
});

test('sem segredo, 503; corpo ruim, 400; consulta grande, 400', async () => {
  assert.equal((await onRequestPost({ request: pedido({ q: 'x' }), env: {} })).status, 503);
  assert.equal((await onRequestPost({ request: pedido('{nope'), env: { NATIVEPORT_API_KEY: 'k' } })).status, 400);
  assert.equal((await onRequestPost({ request: pedido({ q: 'a'.repeat(400) }), env: { NATIVEPORT_API_KEY: 'k' } })).status, 400);
});

test('chama a Jina com a chave do ambiente e devolve só o vetor', async () => {
  const antes = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url, init });
    return new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(DIMENSOES).fill(0.1) }], usage: { total_tokens: 3 } }), { status: 200 });
  };
  try {
    const r = await onRequestPost({ request: pedido({ q: 'creche' }, '9.9.9.9'), env: { NATIVEPORT_API_KEY: 'segredo' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    const d = await r.json();
    assert.equal(d.vetor.length, DIMENSOES);
    assert.deepEqual(Object.keys(d).sort(), ['dims', 'modelo', 'vetor']);
    assert.equal(chamadas.length, 1);
    assert.match(chamadas[0].init.headers.Authorization, /^Bearer segredo$/);
    const corpo = JSON.parse(chamadas[0].init.body);
    assert.equal(corpo.task, 'retrieval.query');
    assert.equal(corpo.dimensions, DIMENSOES);
    assert.deepEqual(corpo.input, ['creche']);
  } finally {
    globalThis.fetch = antes;
  }
});

test('Jina fora do ar vira 502 — o navegador segue lexical', async () => {
  const antes = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('rede'); };
  try {
    const r = await onRequestPost({ request: pedido({ q: 'creche' }, '8.8.8.8'), env: { NATIVEPORT_API_KEY: 'k' } });
    assert.equal(r.status, 502);
  } finally {
    globalThis.fetch = antes;
  }
});
