/**
 * A Pages Function que serve `/resposta/<id>` — agora a página da CONVERSA.
 *
 * A rota entrega o app do chat (o index.html do próprio deployment) para todo
 * id bem formado, e o 404 uniforme para o resto. Duas regras continuam sendo
 * cobradas aqui:
 *
 *   · o identificador é validado ANTES de qualquer coisa — id fora da
 *     gramática não toca nem o armazém de estáticos;
 *   · a função não fala com o serviço de evidências: quem carrega a resposta
 *     guardada é o navegador, pelo mesmo contrato da home. Nenhum fetch além
 *     do artefato estático da raiz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { onRequestGet, trata } =
  await import(pathToFileURL(join(PROJETO, 'functions/resposta/[id].js')).href);

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const URL_PEDIDO = `https://eleicoes.ai/resposta/${ID}`;
const APP = '<!doctype html><title>app</title><section id="chat"></section>';

function assetsFalso({ status = 200 } = {}) {
  const pedidos = [];
  return {
    pedidos,
    fetch: async (url) => {
      pedidos.push(String(url));
      return new Response(APP, {
        status, headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    },
  };
}

test('id válido serve o app do chat, pedido só à raiz do deployment', async () => {
  const assets = assetsFalso();
  const r = await trata({ url: URL_PEDIDO, id: ID, assets });

  assert.equal(r.status, 200);
  assert.equal(await r.text(), APP);
  assert.deepEqual(assets.pedidos, ['https://eleicoes.ai/']);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, follow');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=0, s-maxage=60');
});

test('id fora da gramática recebe o 404 uniforme sem tocar os estáticos', async () => {
  for (const ruim of [null, '', 'curto', `${ID}x`, `${ID.slice(0, 21)}%`,
    '../../../etc/passwd', 'AbCdEfGhIjKlMnOpQrSt.v']) {
    const assets = assetsFalso();
    const r = await trata({ url: URL_PEDIDO, id: ruim, assets });

    assert.equal(r.status, 404, `id ${JSON.stringify(ruim)} não deu 404`);
    assert.equal(assets.pedidos.length, 0, `id ${JSON.stringify(ruim)} tocou os estáticos`);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(await r.text(), /Resposta não encontrada/);
  }
});

test('sem armazém de estáticos, ou com falha nele, a rota diz indisponível', async () => {
  for (const assets of [undefined, { fetch: async () => { throw new Error('x'); } },
    assetsFalso({ status: 404 })]) {
    const r = await trata({ url: URL_PEDIDO, id: ID, assets });
    assert.equal(r.status, 502);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});

test('a ponte com o runtime usa params.id e env.ASSETS', async () => {
  const assets = assetsFalso();
  const r = await onRequestGet({
    request: new Request(URL_PEDIDO), params: { id: ID }, env: { ASSETS: assets },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(assets.pedidos, ['https://eleicoes.ai/']);
});
