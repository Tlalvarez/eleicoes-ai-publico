import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestGet } from '../functions/resposta/[[resto]].js';

test('caminhos malformados sob /resposta devolvem o 404 uniforme sem rede', async () => {
  for (const url of [
    'https://eleicoes.ai/resposta/',
    'https://eleicoes.ai/resposta/AbCdEfGhIjKlMnOpQrStUv/extra',
  ]) {
    let chamadas = 0;
    const resposta = await onRequestGet({
      request: new Request(url),
      params: { resto: 'qualquer' },
      env: {},
      buscar: async () => { chamadas += 1; throw new Error('não deveria chamar'); },
    });

    assert.equal(resposta.status, 404);
    assert.equal(chamadas, 0);
    assert.equal(resposta.headers.get('cache-control'), 'no-store');
    assert.match(await resposta.text(), /Resposta não encontrada/);
  }
});
