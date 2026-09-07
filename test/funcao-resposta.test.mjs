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
const APP = '<!doctype html><html><head><title>app</title></head><body><section id="chat"></section></body></html>';

/** Um serviço de respostas falso: 200 com citações, 404, 500 ou lento demais. */
function buscarFalso(modo = 'ok') {
  const pedidos = [];
  const fn = async (url, opcoes) => {
    pedidos.push(String(url));
    if (modo === 'estoura') throw new Error('rede');
    if (modo === 'lento') await new Promise((_, rej) => opcoes?.signal?.addEventListener('abort', () => rej(new Error('abort'))));
    if (modo === '404') return new Response('{}', { status: 404 });
    if (modo === '500') return new Response('erro', { status: 500 });
    return new Response(JSON.stringify({ resposta: { citacoes: [{ nome: 'Lula' }, { nome: 'Flávio Bolsonaro' }] } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  fn.pedidos = pedidos;
  return fn;
}

/** O serviço devolvendo uma resposta COM escopo — a conversa de um cargo/UF. */
function buscarComEscopo(escopo) {
  const fn = async () => new Response(JSON.stringify({
    resposta: { citacoes: [{ nome: 'Tarcísio' }], escopo },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return fn;
}

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
  const r = await trata({ url: URL_PEDIDO, id: ID, assets, buscar: buscarFalso('500') });

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
    const r = await trata({ url: URL_PEDIDO, id: ID, assets, buscar: buscarFalso('500') });
    assert.equal(r.status, 502);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});

test('a ponte com o runtime usa params.id e env.ASSETS', async () => {
  const assets = assetsFalso();
  const buscar = buscarFalso('ok');
  const r = await onRequestGet({
    request: new Request(URL_PEDIDO), params: { id: ID },
    env: { ASSETS: assets, PUBLIC_PESQUISA_API: 'https://api.teste' }, buscar,
  });
  assert.equal(r.status, 200);
  assert.deepEqual(assets.pedidos, ['https://eleicoes.ai/']);
  // a API vem do ambiente da Pages; o fetch injetado é o do teste
  assert.deepEqual(buscar.pedidos, [`https://api.teste/api/respostas/${ID}`]);
});

test('prévia: com a resposta guardada, o app sai com título e metas sobre os candidatos citados', async () => {
  const buscar = buscarFalso('ok');
  const r = await trata({ url: URL_PEDIDO, id: ID, assets: assetsFalso(), buscar, api: 'https://api.teste' });
  assert.equal(r.status, 200);
  assert.deepEqual(buscar.pedidos, [`https://api.teste/api/respostas/${ID}`]);
  const html = await r.text();
  assert.match(html, /<title>Resposta sobre Lula e Flávio Bolsonaro · eleicoes\.ai<\/title>/);
  assert.match(html, new RegExp(`<meta property="og:url" content="https://eleicoes\\.ai/resposta/${ID}">`));
  assert.match(html, /<section id="chat">/);
});

test('prévia: serviço fora, com erro ou lento não tira a página do ar — sai o app sem prévia', async () => {
  for (const modo of ['estoura', '500']) {
    const r = await trata({ url: URL_PEDIDO, id: ID, assets: assetsFalso(), buscar: buscarFalso(modo), api: 'https://api.teste' });
    assert.equal(r.status, 200, modo);
    assert.match(await r.text(), /<title>app<\/title>/, modo);
  }
  const r = await trata({ url: URL_PEDIDO, id: ID, assets: assetsFalso(), buscar: null });
  assert.equal(r.status, 200);
});

test('prévia: resposta que o serviço não tem (inexistente ou revogada) sai como 404 uniforme', async () => {
  const r = await trata({ url: URL_PEDIDO, id: ID, assets: assetsFalso(), buscar: buscarFalso('404'), api: 'https://api.teste' });
  assert.equal(r.status, 404);
  assert.match(await r.text(), /Resposta não encontrada/);
});

test('a página servida é a do ESCOPO da resposta, não sempre a home', async () => {
  // Uma resposta sobre governador de São Paulo aberta na home saía sob o
  // título "Pergunte à IA sobre os candidatos a presidente", com a grade dos
  // 13 presidenciáveis embaixo — e a pergunta seguinte buscava entre eles.
  const assets = assetsFalso();
  await trata({ url: URL_PEDIDO, id: ID, assets,
    buscar: buscarComEscopo({ cargo: 'governador', uf: 'SP' }) });

  assert.deepEqual(assets.pedidos, ['https://eleicoes.ai/governador/sp']);
});

test('presidente é a home, e escopo que o site não conhece também', async () => {
  for (const [escopo, esperado] of [
    [{ cargo: 'presidente' }, 'https://eleicoes.ai/'],
    // cargo fora do ar: não há página construída para ele no dist
    [{ cargo: 'deputado-federal', uf: 'SP' }, 'https://eleicoes.ai/'],
    [{ cargo: 'governador', uf: 'ZZ' }, 'https://eleicoes.ai/'],
    [{ cargo: '../../etc/passwd' }, 'https://eleicoes.ai/'],
  ]) {
    const assets = assetsFalso();
    await trata({ url: URL_PEDIDO, id: ID, assets, buscar: buscarComEscopo(escopo) });

    assert.deepEqual(assets.pedidos, [esperado], JSON.stringify(escopo));
  }
});

test('serviço fora do ar continua servindo a home, não uma página inexistente', async () => {
  const assets = assetsFalso();
  await trata({ url: URL_PEDIDO, id: ID, assets, buscar: buscarFalso('estoura') });

  assert.deepEqual(assets.pedidos, ['https://eleicoes.ai/']);
});
