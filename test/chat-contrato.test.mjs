/**
 * O contrato do chat com o serviço de evidências.
 *
 * Duas coisas que precisam ser testáveis sem rede, porque são exatamente onde
 * um chat quebra na frente do usuário:
 *
 *  1. o FALLBACK. `/api/conversa` pode ainda não existir no serviço; nesse
 *     caso o primeiro turno cai em `/api/pesquisa`, que responde uma pergunta
 *     avulsa. O que NÃO pode acontecer é o segundo turno silenciosamente
 *     virar uma pergunta nova sem histórico: a pessoa escreveria "e o
 *     segundo?" e receberia uma resposta sobre nada, sem saber que o contexto
 *     foi jogado fora. Nesse caso a interface diz que follow-up está
 *     indisponível.
 *
 *  2. a NORMALIZAÇÃO. A resposta alimenta um renderizador e um permalink.
 *     Campo faltando, tipo trocado ou citação sem marcador têm de virar
 *     estrutura previsível aqui, uma vez, e não `undefined` espalhado por
 *     cinco lugares da interface.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ErroConversa, MSG_SEM_FOLLOWUP, corpoConversa, corpoPesquisa,
  ehPrimeiroTurno, normalizaResposta, pergunta, precisaFallback,
} from '../src/lib/chat.mjs';

const API = 'https://pesquisa.exemplo';

/** fetch falso: registra as chamadas e responde pela fila programada. */
function falsoFetch(respostas) {
  const chamadas = [];
  const fn = async (url, opcoes) => {
    chamadas.push({ url, opcoes, corpo: JSON.parse(opcoes.body) });
    const proxima = respostas.shift();
    if (!proxima) throw new Error('fetch inesperado: ' + url);
    if (proxima instanceof Error) throw proxima;
    return {
      ok: proxima.status >= 200 && proxima.status < 300,
      status: proxima.status,
      json: async () => proxima.json,
    };
  };
  fn.chamadas = chamadas;
  return fn;
}

const ok = (json) => ({ status: 200, json });
const RESPOSTA = {
  id: 'r1',
  texto: '## Conclusão\n\nnada registrado [S1]',
  citacoes: [{ marcadores: [1], candidato: 'lula', nome: 'Lula', rotulo: 'vídeo',
    tipo: 'video', data: '2026-01-02', url: 'https://a.org/1', ts: '00:01:00',
    estatuto: 3, estatuto_rotulo: 'legenda automática' }],
  rodape: 'gerado por IA',
  release_id: null,
  release_status: 'previa',
};

const TURNO = [{ papel: 'user', texto: 'o que propõem?' }];
const TRES_TURNOS = [
  { papel: 'user', texto: 'o que propõem?' },
  { papel: 'assistant', texto: 'resposta 1' },
  { papel: 'user', texto: 'e sobre saúde?' },
];

// --------------------------------------------------------------------------
// corpo das requisições
// --------------------------------------------------------------------------

test('o corpo de /api/conversa é o histórico inteiro no formato do contrato', () => {
  assert.deepEqual(corpoConversa(TRES_TURNOS), {
    mensagens: [
      { papel: 'user', texto: 'o que propõem?' },
      { papel: 'assistant', texto: 'resposta 1' },
      { papel: 'user', texto: 'e sobre saúde?' },
    ],
  });
});

test('resposta_id entra só quando existe', () => {
  assert.equal('resposta_id' in corpoConversa(TURNO), false);
  assert.equal(corpoConversa(TURNO, 'r1').resposta_id, 'r1');
  assert.equal('resposta_id' in corpoConversa(TURNO, ''), false);
});

test('o corpo do fallback leva só a última pergunta', () => {
  assert.deepEqual(corpoPesquisa(TRES_TURNOS), { pergunta: 'e sobre saúde?' });
});

test('mensagem de papel desconhecido não entra no corpo', () => {
  const corpo = corpoConversa([...TURNO, { papel: 'sistema', texto: 'x' }]);

  assert.deepEqual(corpo.mensagens.map((m) => m.papel), ['user']);
});

test('primeiro turno é o que tem uma pergunta e nenhuma resposta antes', () => {
  assert.equal(ehPrimeiroTurno(TURNO), true);
  assert.equal(ehPrimeiroTurno(TRES_TURNOS), false);
  assert.equal(ehPrimeiroTurno([]), true);
});

// --------------------------------------------------------------------------
// fallback
// --------------------------------------------------------------------------

test('só ausência de rota vira fallback — erro do servidor, não', () => {
  for (const s of [404, 405, 501]) assert.equal(precisaFallback(s), true, `status ${s}`);
  for (const s of [200, 400, 429, 500, 502, 503]) {
    assert.equal(precisaFallback(s), false, `status ${s}`);
  }
});

test('caminho feliz: uma chamada a /api/conversa', async () => {
  const buscar = falsoFetch([ok(RESPOSTA)]);

  const r = await pergunta(TURNO, { apiBase: API, buscar });

  assert.equal(buscar.chamadas.length, 1);
  assert.equal(buscar.chamadas[0].url, `${API}/api/conversa`);
  assert.equal(buscar.chamadas[0].opcoes.method, 'POST');
  assert.match(buscar.chamadas[0].opcoes.headers['Content-Type'], /application\/json/);
  assert.deepEqual(buscar.chamadas[0].corpo.mensagens, TURNO);
  assert.equal(r.texto, RESPOSTA.texto);
  assert.equal(r.viaFallback, false);
});

test('sem /api/conversa, o primeiro turno cai em /api/pesquisa', async () => {
  const buscar = falsoFetch([{ status: 404, json: {} }, ok(RESPOSTA)]);

  const r = await pergunta(TURNO, { apiBase: API, buscar });

  assert.deepEqual(buscar.chamadas.map((c) => c.url),
    [`${API}/api/conversa`, `${API}/api/pesquisa`]);
  assert.deepEqual(buscar.chamadas[1].corpo, { pergunta: 'o que propõem?' });
  assert.equal(r.viaFallback, true);
  assert.equal(r.texto, RESPOSTA.texto);
});

test('sem release, o primeiro turno cai em /api/pesquisa', async () => {
  const buscar = falsoFetch([
    { status: 503, json: { erro: 'conversa indisponível', codigo: 'sem_release' } },
    ok(RESPOSTA),
  ]);

  const r = await pergunta(TURNO, { apiBase: API, buscar });

  assert.deepEqual(buscar.chamadas.map((c) => c.url),
    [`${API}/api/conversa`, `${API}/api/pesquisa`]);
  assert.equal(r.viaFallback, true);
  assert.equal(r.texto, RESPOSTA.texto);
});

test('503 genérico continua sendo erro e não tenta fallback', async () => {
  const buscar = falsoFetch([{ status: 503, json: { codigo: 'outro' } }]);

  await assert.rejects(() => pergunta(TURNO, { apiBase: API, buscar }),
    (e) => e instanceof ErroConversa && e.codigo === 'servidor');
  assert.equal(buscar.chamadas.length, 1);
});

test('sem /api/conversa, o follow-up NÃO vira pergunta nova em silêncio', async () => {
  const buscar = falsoFetch([{ status: 404, json: {} }]);

  await assert.rejects(
    () => pergunta(TRES_TURNOS, { apiBase: API, buscar }),
    (e) => {
      assert.ok(e instanceof ErroConversa);
      assert.equal(e.codigo, 'sem-followup');
      assert.equal(e.message, MSG_SEM_FOLLOWUP);
      return true;
    });
  assert.equal(buscar.chamadas.length, 1, 'chamou /api/pesquisa mesmo assim');
});

test('a mensagem de indisponibilidade diz o que fazer, em português claro', () => {
  assert.match(MSG_SEM_FOLLOWUP, /nova pergunta/i);
  assert.ok(MSG_SEM_FOLLOWUP.length > 40);
});

// --------------------------------------------------------------------------
// erros
// --------------------------------------------------------------------------

test('falha de rede vira erro tipado, não exceção crua', async () => {
  const buscar = falsoFetch([new TypeError('Failed to fetch')]);

  await assert.rejects(() => pergunta(TURNO, { apiBase: API, buscar }),
    (e) => e instanceof ErroConversa && e.codigo === 'rede');
});

test('erro do servidor vira erro tipado e não tenta o fallback', async () => {
  const buscar = falsoFetch([{ status: 500, json: {} }]);

  await assert.rejects(() => pergunta(TURNO, { apiBase: API, buscar }),
    (e) => e instanceof ErroConversa && e.codigo === 'servidor');
  assert.equal(buscar.chamadas.length, 1);
});

test('resposta 200 sem texto é erro, não resposta vazia na tela', async () => {
  const buscar = falsoFetch([ok({ id: 'x', citacoes: [] })]);

  await assert.rejects(() => pergunta(TURNO, { apiBase: API, buscar }),
    (e) => e instanceof ErroConversa && e.codigo === 'resposta-vazia');
});

test('JSON ilegível vira erro tipado', async () => {
  const buscar = async () => ({ ok: true, status: 200,
    json: async () => { throw new SyntaxError('unexpected token'); } });

  await assert.rejects(() => pergunta(TURNO, { apiBase: API, buscar }),
    (e) => e instanceof ErroConversa && e.codigo === 'resposta-invalida');
});

test('a barra sobrando na base da API não duplica no caminho', async () => {
  const buscar = falsoFetch([ok(RESPOSTA)]);

  await pergunta(TURNO, { apiBase: `${API}/`, buscar });

  assert.equal(buscar.chamadas[0].url, `${API}/api/conversa`);
});

// --------------------------------------------------------------------------
// normalização
// --------------------------------------------------------------------------

test('a resposta completa passa inteira', () => {
  const r = normalizaResposta(RESPOSTA);

  assert.equal(r.texto, RESPOSTA.texto);
  assert.deepEqual(r.citacoes[0].marcadores, [1]);
  assert.equal(r.citacoes[0].url, 'https://a.org/1');
  assert.equal(r.release_status, 'previa');
});

test('citações ausentes viram lista vazia, não undefined', () => {
  for (const c of [undefined, null, 'x', 42, {}]) {
    assert.deepEqual(normalizaResposta({ texto: 'a', citacoes: c }).citacoes, []);
  }
});

test('marcadores viram números, únicos e em ordem', () => {
  const r = normalizaResposta({ texto: 'a',
    citacoes: [{ marcadores: ['3', 1, 3, 'x', null, 2], url: 'https://a.org' }] });

  assert.deepEqual(r.citacoes[0].marcadores, [1, 2, 3]);
});

test('citação sem marcador nenhum é descartada — ela não tem como ser referida', () => {
  const r = normalizaResposta({ texto: 'a',
    citacoes: [{ marcadores: [], url: 'https://a.org' }, { marcadores: [1], url: 'https://b.org' }] });

  assert.equal(r.citacoes.length, 1);
  assert.equal(r.citacoes[0].url, 'https://b.org');
});

test('endereço de citação com esquema perigoso é removido, a citação fica', () => {
  const r = normalizaResposta({ texto: 'a',
    citacoes: [{ marcadores: [1], nome: 'X', url: 'javascript:alert(1)' }] });

  assert.equal(r.citacoes.length, 1);
  assert.equal(r.citacoes[0].url, null);
  assert.equal(r.citacoes[0].nome, 'X');
});

test('campos de texto com tipo errado não vazam para a interface', () => {
  const r = normalizaResposta({ texto: 'a', rodape: { x: 1 }, id: 7, release_status: [] });

  assert.equal(r.rodape, '');
  assert.equal(r.id, null);
  assert.equal(r.release_status, null);
});

// --------------------------------------------------------------------------
// a conversa AO VIVO (/api/conversa/stream)
// --------------------------------------------------------------------------

import { CAMINHO_CONVERSA_AO_VIVO, leEventos, perguntaAoVivo } from '../src/lib/chat.mjs';

/** Uma resposta SSE de teste: `text()` com os eventos, sem stream de bytes. */
const sse = (eventos, status = 200) => ({
  status,
  text: eventos.map(([tipo, dados]) => `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n`).join('\n'),
});

function falsoFetchSSE(respostas) {
  const chamadas = [];
  const fn = async (url, opcoes) => {
    chamadas.push({ url, opcoes, corpo: JSON.parse(opcoes.body) });
    const proxima = respostas.shift();
    if (!proxima) throw new Error('fetch inesperado: ' + url);
    const ok = proxima.status >= 200 && proxima.status < 300;
    return {
      ok,
      status: proxima.status,
      json: async () => proxima.json,
      text: async () => proxima.text ?? JSON.stringify(proxima.json),
      body: proxima.body ?? null,
    };
  };
  fn.chamadas = chamadas;
  return fn;
}

const EVENTOS_OK = [
  ['etapa', { m: 'Procurando…' }],
  ['etapa', { m: 'Escrevendo…' }],
  ['texto', { t: '## Conclusão\n\nnada ' }],
  ['texto', { t: 'registrado [S1]' }],
  ['resultado', { ...RESPOSTA, compartilhamento_id: 'AbCdEfGhIjKlMnOpQrStUv' }],
];

test('ao vivo: etapas e trechos chegam em ordem e o resultado é o normalizado', async () => {
  const buscar = falsoFetchSSE([sse(EVENTOS_OK)]);
  const etapas = [];
  const trechos = [];

  const r = await perguntaAoVivo(TURNO, {
    apiBase: API, buscar, aoEtapa: (m) => etapas.push(m), aoTexto: (t) => trechos.push(t),
  });

  assert.equal(buscar.chamadas.length, 1);
  assert.equal(buscar.chamadas[0].url, API + CAMINHO_CONVERSA_AO_VIVO);
  assert.deepEqual(buscar.chamadas[0].corpo, { mensagens: TURNO });
  assert.deepEqual(etapas, ['Procurando…', 'Escrevendo…']);
  assert.equal(trechos.join(''), '## Conclusão\n\nnada registrado [S1]');
  assert.equal(r.texto, RESPOSTA.texto);
  assert.equal(r.compartilhamento_id, 'AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(r.viaFallback, false);
  assert.equal(r.citacoes.length, 1);
});

test('ao vivo: erro depois de texto é erro tipado — o rascunho não vira resposta', async () => {
  const buscar = falsoFetchSSE([sse([
    ['etapa', { m: 'Escrevendo…' }],
    ['texto', { t: 'parte que o serviço retratou' }],
    ['erro', { codigo: 'resposta_descartada', erro: 'descartada', status: 502 }],
  ])]);
  const trechos = [];

  await assert.rejects(
    () => perguntaAoVivo(TURNO, { apiBase: API, buscar, aoTexto: (t) => trechos.push(t) }),
    (e) => e instanceof ErroConversa && e.codigo === 'servidor' && /502/.test(e.message),
  );
  assert.equal(trechos.length, 1, 'o trecho chegou antes da retratação');
});

test('ao vivo: stream que termina sem resultado nem erro é erro, não resposta', async () => {
  const buscar = falsoFetchSSE([sse([['etapa', { m: 'x' }], ['texto', { t: 'meio' }]])]);
  await assert.rejects(
    () => perguntaAoVivo(TURNO, { apiBase: API, buscar }),
    (e) => e instanceof ErroConversa && e.codigo === 'resposta-invalida',
  );
});

test('ao vivo: serviço sem a rota cai na rota JSON de sempre', async () => {
  const buscar = falsoFetchSSE([{ status: 404, json: {} }, { status: 200, json: RESPOSTA }]);

  const r = await perguntaAoVivo(TURNO, { apiBase: API, buscar });

  assert.deepEqual(buscar.chamadas.map((c) => c.url),
    [API + CAMINHO_CONVERSA_AO_VIVO, API + '/api/conversa']);
  assert.equal(r.texto, RESPOSTA.texto);
  assert.equal(r.viaFallback, false);
});

test('ao vivo: sem release, o primeiro turno cai em /api/pesquisa', async () => {
  const buscar = falsoFetchSSE([
    { status: 503, json: { codigo: 'sem_release', erro: 'sem release' } },
    { status: 200, json: RESPOSTA },
  ]);

  const r = await perguntaAoVivo(TURNO, { apiBase: API, buscar });

  assert.deepEqual(buscar.chamadas.map((c) => c.url),
    [API + CAMINHO_CONVERSA_AO_VIVO, API + '/api/pesquisa']);
  assert.equal(r.viaFallback, true);
});

test('ao vivo: sem release, o follow-up não vira pergunta nova em silêncio', async () => {
  const buscar = falsoFetchSSE([{ status: 503, json: { codigo: 'sem_release' } }]);
  await assert.rejects(
    () => perguntaAoVivo(TRES_TURNOS, { apiBase: API, buscar }),
    (e) => e instanceof ErroConversa && e.codigo === 'sem-followup',
  );
  assert.equal(buscar.chamadas.length, 1);
});

test('ao vivo: 500 é erro, sem fallback', async () => {
  const buscar = falsoFetchSSE([{ status: 500, json: {} }]);
  await assert.rejects(
    () => perguntaAoVivo(TURNO, { apiBase: API, buscar }),
    (e) => e instanceof ErroConversa && e.codigo === 'servidor',
  );
  assert.equal(buscar.chamadas.length, 1);
});

test('leEventos lê o corpo em stream de bytes, em pedaços cortados no meio', async () => {
  const texto = EVENTOS_OK
    .map(([tipo, dados]) => `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`).join('');
  const bytes = new TextEncoder().encode(texto);
  // pedaços de 7 bytes: cortam linhas, blocos e até caracteres multibyte
  const partes = [];
  for (let i = 0; i < bytes.length; i += 7) partes.push(bytes.slice(i, i + 7));
  const body = new ReadableStream({
    start(controller) {
      for (const p of partes) controller.enqueue(p);
      controller.close();
    },
  });
  const etapas = [];
  const trechos = [];

  const fim = await leEventos({ body }, { aoEtapa: (m) => etapas.push(m), aoTexto: (t) => trechos.push(t) });

  assert.equal(fim.tipo, 'resultado');
  assert.equal(fim.dados.texto, RESPOSTA.texto);
  assert.deepEqual(etapas, ['Procurando…', 'Escrevendo…']);
  assert.equal(trechos.join(''), '## Conclusão\n\nnada registrado [S1]');
});

test('leEventos ignora bloco malformado e para no primeiro evento final', async () => {
  const eventos = [
    ['etapa', { m: 'a' }],
    ['lixo', null],
    ['resultado', RESPOSTA],
    ['texto', { t: 'depois do fim, não conta' }],
  ];
  const trechos = [];
  const texto = eventos
    .map(([tipo, dados]) => `event: ${tipo}\ndata: ${dados === null ? '{nao é json' : JSON.stringify(dados)}\n\n`)
    .join('');

  const fim = await leEventos({ text: async () => texto }, { aoTexto: (t) => trechos.push(t) });

  assert.equal(fim.tipo, 'resultado');
  assert.deepEqual(trechos, []);
});

// --------------------------------------------------------------------------
// o escopo da página (cargo/UF) vai no corpo
// --------------------------------------------------------------------------

import { escopoDoContrato } from '../src/lib/chat.mjs';

test('o escopo da página entra no corpo no formato do contrato', () => {
  assert.deepEqual(corpoConversa(TURNO, null, { cargo: 'governador', uf: 'sp' }),
    { mensagens: TURNO, escopo: { cargo: 'governador', uf: 'SP' } });
  assert.deepEqual(corpoConversa(TURNO, null, { cargo: 'presidente', uf: '' }),
    { mensagens: TURNO, escopo: { cargo: 'presidente' } });
  assert.deepEqual(corpoConversa(TURNO), { mensagens: TURNO });
  assert.equal(escopoDoContrato({ cargo: '  ' }), null);
});

test('as duas rotas mandam o escopo', async () => {
  const buscar = falsoFetchSSE([sse(EVENTOS_OK)]);
  await perguntaAoVivo(TURNO, { apiBase: API, buscar, escopo: { cargo: 'senador', uf: 'ba' } });
  assert.deepEqual(buscar.chamadas[0].corpo.escopo, { cargo: 'senador', uf: 'BA' });

  const buscar2 = falsoFetch([ok(RESPOSTA)]);
  await pergunta(TURNO, { apiBase: API, buscar: buscar2, escopo: { cargo: 'presidente' } });
  assert.deepEqual(buscar2.chamadas[0].corpo.escopo, { cargo: 'presidente' });
});

test('serviço anterior ao escopo (400 chaves_desconhecidas) recebe a pergunta sem escopo', async () => {
  const buscar = falsoFetch([
    { status: 400, json: { codigo: 'chaves_desconhecidas', erro: "o pedido só aceita 'mensagens' e 'resposta_id'; remova: escopo" } },
    ok(RESPOSTA),
  ]);

  const r = await pergunta(TURNO, { apiBase: API, buscar, escopo: { cargo: 'presidente' } });

  assert.equal(buscar.chamadas.length, 2);
  assert.deepEqual(buscar.chamadas[0].corpo.escopo, { cargo: 'presidente' });
  assert.equal(buscar.chamadas[1].corpo.escopo, undefined);
  assert.equal(r.texto, RESPOSTA.texto);
});

test('outro 400 não é reenviado', async () => {
  const buscar = falsoFetch([{ status: 400, json: { codigo: 'texto_longo', erro: 'x' } }]);
  await assert.rejects(() => pergunta(TURNO, { apiBase: API, buscar, escopo: { cargo: 'presidente' } }));
  assert.equal(buscar.chamadas.length, 1);
});

test('ao vivo num serviço antigo: 404 na rota nova, 400 pelo escopo, e a pergunta chega mesmo assim', async () => {
  const buscar = falsoFetchSSE([
    { status: 404, json: {} },
    { status: 400, json: { codigo: 'chaves_desconhecidas', erro: 'remova: escopo' } },
    { status: 200, json: RESPOSTA },
  ]);
  const r = await perguntaAoVivo(TURNO, { apiBase: API, buscar, escopo: { cargo: 'presidente' } });
  assert.deepEqual(buscar.chamadas.map((c) => c.url),
    [API + CAMINHO_CONVERSA_AO_VIVO, API + '/api/conversa', API + '/api/conversa']);
  assert.equal(r.texto, RESPOSTA.texto);
});

test('a ressalva de leitor da citação passa pela normalização', () => {
  const r = normalizaResposta({ texto: 'x [S1]', citacoes: [{ marcadores: [1], ressalva: 'só o link' }] });
  assert.equal(r.citacoes[0].ressalva, 'só o link');
  const sem = normalizaResposta({ texto: 'x [S1]', citacoes: [{ marcadores: [1] }] });
  assert.equal(sem.citacoes[0].ressalva, null);
});
