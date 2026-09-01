/**
 * "Oficial" é um portão, não um adjetivo.
 *
 * Nesta branch os dados vêm de uma exportação local do harness e de um
 * catálogo preparado à mão: não há release publicada, não há Inspection, não
 * há manifesto de geração. Chamar isso de Acervo Oficial na interface seria a
 * pior falha possível de um site cuja tese inteira é proveniência.
 *
 * A regra: o estado é PRÉVIA por padrão, e só vira oficial quando existe uma
 * declaração completa — geração, `release_id` e `release_status: "oficial"`.
 * Falta qualquer peça, é prévia. Não existe caminho que produza o rótulo
 * oficial por omissão, por valor estranho ou por campo com tipo errado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROTULO_PREVIA, estadoDaResposta, estadoDoSite,
} from '../src/lib/release.mjs';
import { leManifesto } from '../src/lib/dados.mjs';

const COMPLETO = {
  geracao: 'g-2026-08-25',
  release_id: 'rel-0001',
  release_status: 'oficial',
};

test('sem manifesto: prévia interna, com o rótulo exato', () => {
  const e = estadoDoSite(null);

  assert.equal(e.oficial, false);
  assert.equal(e.rotulo, ROTULO_PREVIA);
  assert.match(e.rotulo, /Prévia interna/);
  assert.match(e.rotulo, /aguardando release oficial/i);
  assert.match(e.rotulo, /Inspection/);
});

test('o rótulo de prévia nunca contém a palavra "oficial" sozinha como afirmação', () => {
  const e = estadoDoSite(null);

  assert.doesNotMatch(e.rotulo, /Acervo Oficial/i);
});

test('manifesto completo: oficial, com o identificador visível', () => {
  const e = estadoDoSite(COMPLETO);

  assert.equal(e.oficial, true);
  assert.equal(e.releaseId, 'rel-0001');
  assert.match(e.rotulo, /oficial/i);
});

test('qualquer peça faltando derruba para prévia', () => {
  const peças = ['geracao', 'release_id', 'release_status'];
  for (const peça of peças) {
    const { [peça]: _fora, ...parcial } = COMPLETO;
    const e = estadoDoSite(parcial);
    assert.equal(e.oficial, false, `sem '${peça}' o estado virou oficial`);
    assert.equal(e.rotulo, ROTULO_PREVIA);
    assert.match(e.detalhe, new RegExp(peça.replace('_', '.?')),
      `o detalhe não diz que falta '${peça}': ${e.detalhe}`);
  }
});

test('status diferente de "oficial" é prévia, mesmo com identificador', () => {
  for (const status of ['inspection', 'rascunho', 'staging', 'OFICIAL ', '', 'oficial?']) {
    const e = estadoDoSite({ ...COMPLETO, release_status: status });
    assert.equal(e.oficial, false, `status ${JSON.stringify(status)} passou como oficial`);
  }
});

test('campo com tipo errado não vira oficial', () => {
  for (const release_id of [1, true, {}, [], null]) {
    assert.equal(estadoDoSite({ ...COMPLETO, release_id }).oficial, false,
      `release_id ${JSON.stringify(release_id)} passou`);
  }
});

test('entrada que não é objeto não quebra nem promove', () => {
  for (const m of [undefined, null, 'oficial', 42, []]) {
    const e = estadoDoSite(m);
    assert.equal(e.oficial, false);
    assert.equal(e.rotulo, ROTULO_PREVIA);
  }
});

// --------------------------------------------------------------------------
// a resposta do chat carrega o próprio estado
// --------------------------------------------------------------------------

test('resposta sem release declarada é prévia', () => {
  assert.equal(estadoDaResposta({ texto: 'x' }).oficial, false);
  assert.equal(estadoDaResposta({ texto: 'x' }).rotulo, ROTULO_PREVIA);
});

test('resposta com release completa é oficial', () => {
  const e = estadoDaResposta({ release_id: 'rel-9', release_status: 'oficial' });

  assert.equal(e.oficial, true);
  assert.equal(e.releaseId, 'rel-9');
});

test('resposta que se declara oficial sem identificador continua prévia', () => {
  assert.equal(estadoDaResposta({ release_status: 'oficial' }).oficial, false);
});

// --------------------------------------------------------------------------
// o repositório de hoje
// --------------------------------------------------------------------------

test('o estado do site segue o ponteiro publicado — prévia sem release, oficial com ela', () => {
  const m = leManifesto();
  const e = estadoDoSite(m);

  if (m?.release_status === 'oficial' && typeof m?.release_id === 'string' && m.release_id
      && m?.geracao) {
    assert.equal(e.oficial, true);
    assert.equal(e.rotulo, `Release oficial ${m.release_id}`);
  } else {
    assert.equal(e.oficial, false);
    assert.equal(e.rotulo, ROTULO_PREVIA);
  }
});
