/**
 * A identidade pública de uma resposta: `/resposta/<compartilhamento_id>`.
 *
 * O permalink `#r=` resolvia o problema de um site estático: sem servidor, o
 * resultado inteiro viajava dentro do endereço. O preço era alto e está
 * documentado em src/lib/permalink.mjs — o conteúdo NÃO é autenticado, a URL
 * fica gigante, e acima de um teto simplesmente não há link.
 *
 * Com o serviço guardando a resposta, o link volta a ser o que um link deve
 * ser: curto, estável e resolvido por quem produziu o conteúdo. Este módulo é
 * a gramática desse identificador e o cálculo dos endereços derivados dele —
 * o do visitante (`/resposta/<id>`) e o da consulta ao serviço
 * (`/api/respostas/<id>`).
 *
 * O identificador é ENTRADA HOSTIL nas duas pontas: ele chega da URL de quem
 * visita e chega do JSON do serviço. Nos dois casos ele acaba dentro de um
 * caminho — de rota e de requisição. Uma gramática frouxa aqui é travessia de
 * caminho e requisição forjada ali adiante, então a validação é literal:
 * exatamente 22 caracteres de um alfabeto URL-safe, e nada mais.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  API_PADRAO, ORIGEM_CANONICA, PREFIXO_ROTA, TAMANHO_ID, caminhoResposta,
  ehIdPublico, enderecoUpstream, origemDaRequisicao, urlDeCompartilhamento,
  urlPublica,
} from '../src/lib/resposta-publica.mjs';
import { normalizaResposta } from '../src/lib/chat.mjs';
import { codifica, decodifica } from '../src/lib/permalink.mjs';
import { markdownCompleto, payloadWebShare, resumoLegivel, textoCompleto }
  from '../src/lib/compartilhar.mjs';

const VALIDO = 'AbCdEfGhIjKlMnOpQrStUv';   // 22

// --------------------------------------------------------------------------
// gramática do identificador
// --------------------------------------------------------------------------

test('o identificador público tem 22 caracteres URL-safe', () => {
  assert.equal(TAMANHO_ID, 22);
  assert.equal(VALIDO.length, TAMANHO_ID);
  assert.equal(ehIdPublico(VALIDO), true);
  assert.equal(ehIdPublico('0123456789_-ABCDEFghij'), true);
});

test('comprimento diferente de 22 é recusado', () => {
  assert.equal(ehIdPublico(VALIDO.slice(0, 21)), false);
  assert.equal(ehIdPublico(`${VALIDO}x`), false);
  assert.equal(ehIdPublico(''), false);
});

test('caractere fora do alfabeto é recusado — inclusive o que vira caminho', () => {
  for (const ruim of [
    '../../../etc/passwd000', 'AbCdEfGhIjKlMnOpQrSt/v', 'AbCdEfGhIjKlMnOpQrSt.v',
    'AbCdEfGhIjKlMnOpQrSt%2', 'AbCdEfGhIjKlMnOpQrSt v', 'AbCdEfGhIjKlMnOpQrSt?v',
    'AbCdEfGhIjKlMnOpQrSt#v', 'AbCdEfGhIjKlMnOpQrSt\nv', 'AbCdEfGhIjKlMnOpQrSt+v',
  ]) {
    assert.equal(ehIdPublico(ruim), false, `id ${JSON.stringify(ruim)} passou`);
  }
});

test('o que não é string nunca é identificador', () => {
  for (const ruim of [null, undefined, 42, {}, [VALIDO], true]) {
    assert.equal(ehIdPublico(ruim), false, `${JSON.stringify(ruim)} passou`);
  }
});

// --------------------------------------------------------------------------
// endereços derivados
// --------------------------------------------------------------------------

test('a rota pública é curta e previsível', () => {
  assert.equal(PREFIXO_ROTA, '/resposta/');
  assert.equal(caminhoResposta(VALIDO), `/resposta/${VALIDO}`);
});

test('id inválido não produz rota', () => {
  assert.equal(caminhoResposta('x'), null);
  assert.equal(caminhoResposta(null), null);
});

test('a URL pública nasce da origem de quem está navegando', () => {
  assert.equal(urlPublica('https://eleicoes.ai', VALIDO), `https://eleicoes.ai/resposta/${VALIDO}`);
  assert.equal(urlPublica('https://eleicoes.ai/', VALIDO), `https://eleicoes.ai/resposta/${VALIDO}`);
  assert.equal(urlPublica('http://127.0.0.1:4321', VALIDO),
    `http://127.0.0.1:4321/resposta/${VALIDO}`);
});

test('origem que não é http(s) não vira link', () => {
  for (const ruim of ['', null, 'javascript:alert(1)', 'file:///tmp', 'eleicoes.ai']) {
    assert.equal(urlPublica(ruim, VALIDO), null, `origem ${JSON.stringify(ruim)} passou`);
  }
});

test('sem compartilhamento_id não se inventa endereço', () => {
  assert.equal(urlDeCompartilhamento('https://eleicoes.ai', { texto: 'a' }), null);
  assert.equal(urlDeCompartilhamento('https://eleicoes.ai',
    { texto: 'a', compartilhamento_id: 'curto' }), null);
  assert.equal(urlDeCompartilhamento('https://eleicoes.ai',
    { texto: 'a', compartilhamento_id: VALIDO }), `https://eleicoes.ai/resposta/${VALIDO}`);
});

// --------------------------------------------------------------------------
// origem canônica: preview usa a própria, domínio de produção usa o canônico
// --------------------------------------------------------------------------

test('no domínio canônico a origem é sempre https://eleicoes.ai', () => {
  assert.equal(ORIGEM_CANONICA, 'https://eleicoes.ai');
  assert.equal(origemDaRequisicao(`https://eleicoes.ai/resposta/${VALIDO}`), ORIGEM_CANONICA);
  assert.equal(origemDaRequisicao(`https://www.eleicoes.ai/resposta/${VALIDO}`), ORIGEM_CANONICA);
  assert.equal(origemDaRequisicao(`http://eleicoes.ai/resposta/${VALIDO}`), ORIGEM_CANONICA);
});

test('em preview do Pages a origem é a da própria requisição', () => {
  assert.equal(origemDaRequisicao(`https://abc123.eleicoes-ai.pages.dev/resposta/${VALIDO}`),
    'https://abc123.eleicoes-ai.pages.dev');
  assert.equal(origemDaRequisicao(`http://127.0.0.1:8788/resposta/${VALIDO}`),
    'http://127.0.0.1:8788');
});

test('URL que o runtime não interpreta cai no canônico, nunca em host inventado', () => {
  for (const ruim of ['', null, 'não é url', 'javascript:alert(1)', '/resposta/x']) {
    assert.equal(origemDaRequisicao(ruim), ORIGEM_CANONICA, `url ${JSON.stringify(ruim)}`);
  }
});

// --------------------------------------------------------------------------
// endereço do serviço
// --------------------------------------------------------------------------

test('o serviço é consultado só em /api/respostas/<id>', () => {
  assert.equal(API_PADRAO, 'https://api.eleicoes.ai');
  assert.equal(enderecoUpstream(API_PADRAO, VALIDO),
    `https://api.eleicoes.ai/api/respostas/${VALIDO}`);
  assert.equal(enderecoUpstream('https://api.exemplo.org/', VALIDO),
    `https://api.exemplo.org/api/respostas/${VALIDO}`);
});

test('base de serviço que não é http(s) não vira requisição', () => {
  for (const ruim of ['', null, 'file:///etc/passwd', 'javascript:alert(1)',
    'api.eleicoes.ai', 'ftp://api.eleicoes.ai']) {
    assert.equal(enderecoUpstream(ruim, VALIDO), null, `base ${JSON.stringify(ruim)} passou`);
  }
});

test('id inválido não chega a virar endereço de serviço', () => {
  assert.equal(enderecoUpstream(API_PADRAO, '../../admin'), null);
  assert.equal(enderecoUpstream(API_PADRAO, ''), null);
});

test('o endereço do serviço fica no host configurado, aconteça o que acontecer', () => {
  const url = new URL(enderecoUpstream('https://api.exemplo.org', VALIDO));

  assert.equal(url.host, 'api.exemplo.org');
  assert.equal(url.pathname, `/api/respostas/${VALIDO}`);
  assert.equal(url.search, '');
});

// --------------------------------------------------------------------------
// normalização: o campo novo atravessa o contrato
// --------------------------------------------------------------------------

test('normalizaResposta preserva compartilhamento_id', () => {
  const r = normalizaResposta({ texto: 'a', compartilhamento_id: VALIDO });

  assert.equal(r.compartilhamento_id, VALIDO);
});

test('compartilhamento_id fora da gramática não vaza para a interface', () => {
  for (const ruim of ['../../x', 'curto', 42, null, `${VALIDO}x`]) {
    const r = normalizaResposta({ texto: 'a', compartilhamento_id: ruim });
    assert.equal(r.compartilhamento_id, null, `id ${JSON.stringify(ruim)} passou`);
  }
});

test('a pergunta atravessa a normalização em vez de se perder', () => {
  const r = normalizaResposta({ texto: 'a', pergunta: 'o que propõem sobre saúde?' });

  assert.equal(r.pergunta, 'o que propõem sobre saúde?');
  assert.equal(normalizaResposta({ texto: 'a', pergunta: { x: 1 } }).pergunta, '');
});

test('fragmento legado não consegue plantar um compartilhamento_id', async () => {
  const volta = await decodifica(await codifica({
    pergunta: 'p', texto: 't', citacoes: [], compartilhamento_id: VALIDO,
  }));

  assert.equal(volta.compartilhamento_id, null);
});

// --------------------------------------------------------------------------
// a pergunta e a URL curta chegam a TODOS os formatos de compartilhamento
// --------------------------------------------------------------------------

const RESULTADO = {
  pergunta: 'O que os candidatos propõem sobre previdência?',
  texto: '## Conclusão\n\nDois registraram proposta [S1]',
  citacoes: [{ marcadores: [1], nome: 'A', rotulo: 'vídeo', data: '2026-08-13',
    url: 'https://a.org/1' }],
  rodape: 'gerado por IA',
  compartilhamento_id: VALIDO,
};

test('todos os formatos levam a pergunta e a URL curta', () => {
  const url = urlDeCompartilhamento('https://eleicoes.ai', RESULTADO);
  const comum = { ...RESULTADO, url, estado: 'Prévia interna' };

  for (const [nome, saida] of [
    ['resumo', resumoLegivel(comum)],
    ['texto', textoCompleto(comum)],
    ['markdown', markdownCompleto(comum)],
  ]) {
    assert.ok(saida.includes(RESULTADO.pergunta), `${nome} saiu sem a pergunta`);
    assert.ok(saida.includes(`/resposta/${VALIDO}`), `${nome} saiu sem a URL curta`);
    assert.ok(!saida.includes('#r='), `${nome} ainda leva fragmento legado`);
  }

  const share = payloadWebShare(comum);
  assert.equal(share.url, `https://eleicoes.ai/resposta/${VALIDO}`);
  assert.ok(share.text.includes(RESULTADO.pergunta), 'o Web Share saiu sem a pergunta');
});

test('sem id, os formatos continuam completos e apenas sem link', () => {
  const semId = { ...RESULTADO, compartilhamento_id: null };
  const url = urlDeCompartilhamento('https://eleicoes.ai', semId);
  const comum = { ...semId, url, estado: 'Prévia interna' };

  assert.equal(url, null);
  assert.ok(textoCompleto(comum).includes(semId.pergunta));
  assert.ok(!textoCompleto(comum).includes('/resposta/'));
  assert.equal('url' in payloadWebShare(comum), false);
});
