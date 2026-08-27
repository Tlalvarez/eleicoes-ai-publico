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
