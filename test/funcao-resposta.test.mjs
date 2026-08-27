/**
 * A Pages Function que serve `/resposta/<id>`.
 *
 * O site é estático e o deploy é upload direto: não há build de servidor onde
 * pendurar uma rota. Esta função é a única peça dinâmica do produto, e é ela
 * que faz o link compartilhado abrir sem JavaScript e produzir prévia social.
 *
 * Ela também é o único ponto do sistema onde o site faz uma requisição a
 * partir de algo que veio da URL de um desconhecido. Duas regras nascem daí, e
 * as duas são cobradas aqui:
 *
 *   · o identificador é validado ANTES de qualquer rede. Um id fora da
 *     gramática não vira requisição nenhuma — nem para o serviço, nem para
 *     lugar algum. É o que impede que a rota seja usada como intermediária
 *     para alcançar endereços escolhidos por quem visita;
 *   · o endereço consultado é MONTADO, nunca recebido: host fixo de
 *     configuração, caminho fixo, id validado. Nada do visitante é
 *     encaminhado — nem cabeçalho, nem cookie, nem endereço de origem.
 *
 * O resto é o comportamento visível: 404 uniforme para inválido, ausente e
 * revogado (a diferença entre os três é informação sobre o acervo que a rota
 * não tem por que entregar), 502 genérico quando o serviço falha, cache curto
 * o bastante para uma revogação valer em um minuto, e cabeçalho nenhum a menos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { LIMITE_PAYLOAD, TEMPO_LIMITE_MS, onRequestGet, trata } =
  await import(pathToFileURL(join(PROJETO, 'functions/resposta/[id].js')).href);

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const URL_PEDIDO = `https://eleicoes.ai/resposta/${ID}`;

const GUARDADA = {
  schema_version: 1,
  compartilhamento_id: ID,
  criado_em: '2026-08-25T14:03:00Z',
  pergunta: 'O que os candidatos propõem sobre previdência?',
  resposta: {
    texto: 'Dois dos treze registraram proposta [S1].\n\n## Registrado\n\n- **A:** rever a regra [S1]',
    citacoes: [{ marcadores: [1], nome: 'Primeiro', rotulo: 'vídeo', data: '2026-08-13',
      url: 'https://exemplo.org/video-um' }],
    rodape: 'Resposta gerada por IA a partir do acervo',
    release_id: null,
    release_status: 'previa',
  },
};

/** fetch falso: registra as chamadas e responde o que foi programado. */
function falsoFetch(resposta) {
  const chamadas = [];
  const fn = async (url, opcoes = {}) => {
    chamadas.push({ url: String(url), opcoes });
    if (typeof resposta === 'function') return resposta(url, opcoes);
    if (resposta instanceof Error) throw resposta;
    return resposta();
  };
  fn.chamadas = chamadas;
  return fn;
}

const json = (dados, status = 200) => () =>
  new Response(typeof dados === 'string' ? dados : JSON.stringify(dados),
    { status, headers: { 'Content-Type': 'application/json' } });

const pede = (extra = {}) => trata({
  url: URL_PEDIDO, id: ID, env: {}, buscar: falsoFetch(json(GUARDADA)), ...extra,
});

async function corpo(resposta) {
  return resposta.text();
}

/**
 * Há atributo de evento numa tag DE VERDADE?
 *
 * Procurar `onerror=` no documento inteiro acusa o texto escapado — que é
 * exatamente o que precisa aparecer, para o leitor ver o que o serviço tentou
 * fazer. O que importa é o atributo FORA das aspas de uma tag real; como
 * `<`, `>` e `"` são escapados em todo conteúdo, delimitar a tag por `>` e
 * apagar os valores entre aspas é confiável aqui.
 */
function temManipuladorDeEvento(doc) {
  return [...doc.matchAll(/<[a-z][a-z0-9]*\b([^>]*)>/gi)]
    .map((m) => m[1].replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''"))
    .some((atributos) => /\son\w+\s*=/i.test(atributos));
}

// --------------------------------------------------------------------------
// caminho feliz
// --------------------------------------------------------------------------

test('id válido: consulta o serviço e devolve a página da resposta', async () => {
  const buscar = falsoFetch(json(GUARDADA));

  const r = await pede({ buscar });
  const doc = await corpo(r);

  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/html; charset=utf-8$/);
  assert.equal(buscar.chamadas.length, 1);
  assert.equal(buscar.chamadas[0].url, `https://api.eleicoes.ai/api/respostas/${ID}`);
  assert.match(doc, /<h1[^>]*>O que os candidatos propõem sobre previdência\?<\/h1>/);
  assert.ok(doc.includes('https://exemplo.org/video-um'));
});

test('PESQUISA_API do ambiente manda no host consultado', async () => {
  const buscar = falsoFetch(json(GUARDADA));

  await pede({ buscar, env: { PESQUISA_API: 'https://api.teste.local/' } });

  assert.equal(buscar.chamadas[0].url, `https://api.teste.local/api/respostas/${ID}`);
});

test('nada do visitante é encaminhado ao serviço', async () => {
  const buscar = falsoFetch(json(GUARDADA));

  await pede({ buscar });
  const { opcoes } = buscar.chamadas[0];
  const cabecalhos = Object.fromEntries(
    Object.entries(opcoes.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));

  assert.equal((opcoes.method ?? 'GET').toUpperCase(), 'GET');
  assert.equal('cookie' in cabecalhos, false);
  assert.equal('authorization' in cabecalhos, false);
  assert.equal('x-forwarded-for' in cabecalhos, false);
  assert.equal('user-agent' in cabecalhos, false);
  assert.equal('referer' in cabecalhos, false);
  // `manual`, e não `error`: o runtime do Workers recusa `redirect: 'error'` na
  // hora do fetch (a requisição nem sai). Com `manual` o 3xx volta como
  // resposta comum e cai no ramo de erro logo abaixo — em nenhum dos dois casos
  // a função segue um redirecionamento escolhido pelo serviço.
  assert.equal(opcoes.redirect, 'manual');
  assert.equal(opcoes.credentials ?? 'omit', 'omit');
});

test('a origem da requisição vira canonical e og:url', async () => {
  const preview = await corpo(await pede({
    url: `https://abc123.eleicoes-ai.pages.dev/resposta/${ID}`,
  }));

  assert.ok(preview.includes(`https://abc123.eleicoes-ai.pages.dev/resposta/${ID}`));
  assert.ok(!preview.includes('https://eleicoes.ai/resposta/'));

  const canonico = await corpo(await pede({ url: `https://www.eleicoes.ai/resposta/${ID}` }));
  assert.ok(canonico.includes(`https://eleicoes.ai/resposta/${ID}`));
});

test('host injetado por cabeçalho não entra na página', async () => {
  const buscar = falsoFetch(json(GUARDADA));
  const pedido = new Request(URL_PEDIDO, { headers: {
    'X-Forwarded-Host': 'malicioso.example', 'Host': 'eleicoes.ai' } });

  const doc = await corpo(await onRequestGet({
    request: pedido, env: {}, params: { id: ID }, buscar,
  }));

  assert.ok(!doc.includes('malicioso.example'));
  assert.ok(doc.includes(`https://eleicoes.ai/resposta/${ID}`));
});

// --------------------------------------------------------------------------
// cabeçalhos
// --------------------------------------------------------------------------

test('cabeçalhos de segurança em toda resposta', async () => {
  for (const r of [await pede(), await pede({ id: 'invalido' }),
    await pede({ buscar: falsoFetch(json({}, 500)) })]) {
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('referrer-policy'), /strict-origin|no-referrer/);
    assert.match(r.headers.get('content-type'), /^text\/html; charset=utf-8$/);
    assert.ok(r.headers.get('content-security-policy'), 'sem CSP');
  }
});

test('a CSP é restritiva e casa com o script realmente servido', async () => {
  const r = await pede();
  const doc = await corpo(r);
  const csp = r.headers.get('content-security-policy');

  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp), `CSP permissiva: ${csp}`);

  for (const [tag, diretiva] of [['script', 'script-src'], ['style', 'style-src']]) {
    const trecho = doc.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1];
    if (!trecho) continue;
    const bytes = new TextEncoder().encode(trecho);
    const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('base64');
    assert.ok(csp.includes(`'sha256-${hash}'`),
      `o hash do <${tag}> servido não está na diretiva ${diretiva}: ${csp}`);
  }
});

test('cache curto no sucesso — uma revogação vale em no máximo um minuto', async () => {
  const cache = (await pede()).headers.get('cache-control');
  const s = Number(cache.match(/s-maxage=(\d+)/)?.[1]);

  assert.ok(Number.isInteger(s) && s > 0 && s <= 60, `s-maxage inadequado: ${cache}`);
  assert.match(cache, /max-age=0/);
});

test('erro nunca é cacheado', async () => {
  for (const r of [await pede({ id: '../admin' }),
    await pede({ buscar: falsoFetch(json({}, 404)) }),
    await pede({ buscar: falsoFetch(json('{{{', 200)) })]) {
    assert.match(r.headers.get('cache-control'), /no-store/);
  }
});

// --------------------------------------------------------------------------
// id inválido: sem rede
// --------------------------------------------------------------------------

test('id fora da gramática vira 404 SEM tocar na rede', async () => {
  for (const ruim of ['../../etc/passwd', 'curto', `${ID}x`, 'Ab.CdEfGhIjKlMnOpQrSt',
    '', undefined, ['a', 'b'], 'AbCdEfGhIjKlMnOpQrSt%2']) {
    const buscar = falsoFetch(json(GUARDADA));

    const r = await trata({ url: URL_PEDIDO, id: ruim, env: {}, buscar });

    assert.equal(r.status, 404, `id ${JSON.stringify(ruim)} não deu 404`);
    assert.equal(buscar.chamadas.length, 0,
      `id ${JSON.stringify(ruim)} chegou a fazer requisição: ${JSON.stringify(buscar.chamadas)}`);
  }
});

test('serviço mal configurado não vira requisição para lugar nenhum', async () => {
  const buscar = falsoFetch(json(GUARDADA));

  const r = await pede({ buscar, env: { PESQUISA_API: 'file:///etc/passwd' } });

  assert.equal(r.status, 502);
  assert.equal(buscar.chamadas.length, 0);
});

// --------------------------------------------------------------------------
// 404 uniforme
// --------------------------------------------------------------------------

test('inválido, ausente e revogado dão exatamente a mesma página', async () => {
  const invalido = await pede({ id: 'nao-existe' });
  const ausente = await pede({ buscar: falsoFetch(json({ erro: 'nao encontrado' }, 404)) });
  const revogado = await pede({ buscar: falsoFetch(json({ erro: 'revogado' }, 404)) });

  assert.equal(invalido.status, 404);
  assert.equal(ausente.status, 404);
  assert.equal(revogado.status, 404);
  const [a, b, c] = await Promise.all([invalido, ausente, revogado].map(corpo));
  assert.equal(a, b);
  assert.equal(b, c);
  assert.ok(!a.includes(ID), 'a página de 404 devolve o identificador pedido');
});

// --------------------------------------------------------------------------
// serviço quebrado: 502 genérico
// --------------------------------------------------------------------------

test('serviço fora do ar, erro ou JSON ilegível viram 502 sem detalhe', async () => {
  const casos = {
    'rede caiu': falsoFetch(new TypeError('fetch failed: ECONNREFUSED 10.0.0.1:443')),
    'erro 500': falsoFetch(json({}, 500)),
    'erro 403': falsoFetch(json({}, 403)),
    'JSON quebrado': falsoFetch(json('{"pergunta": ', 200)),
    'HTML no lugar de JSON': falsoFetch(json('<html>erro do proxy</html>', 200)),
    'JSON sem resposta': falsoFetch(json({ compartilhamento_id: ID, pergunta: 'p' })),
    'documento sem id': falsoFetch(json(({ compartilhamento_id: _, ...resto }) => resto)(GUARDADA)),
    'schema incompatível': falsoFetch(json({ ...GUARDADA, schema_version: 2 })),
    'pergunta ausente': falsoFetch(json({ ...GUARDADA, pergunta: '' })),
    'data ausente': falsoFetch(json({ ...GUARDADA, criado_em: '' })),
    'resposta sem texto': falsoFetch(json({ ...GUARDADA, resposta: { texto: '  ' } })),
    'marcador atribuído a duas fontes': falsoFetch(json({ ...GUARDADA,
      resposta: { ...GUARDADA.resposta, citacoes: [
        { marcadores: [1], nome: 'A' }, { marcadores: [1], nome: 'B' },
      ] } })),
    'marcadores parcialmente sobrepostos': falsoFetch(json({ ...GUARDADA,
      resposta: { ...GUARDADA.resposta, citacoes: [
        { marcadores: [1, 2], nome: 'A' }, { marcadores: [2, 3], nome: 'B' },
      ] } })),
    'id de outra resposta': falsoFetch(json({ ...GUARDADA,
      compartilhamento_id: 'ZZZZZZZZZZZZZZZZZZZZZZ' })),
    // redirecionamento NÃO é seguido: ele viria escolhido pelo serviço e é a
    // porta por onde uma consulta a um host fixo vira consulta a outro host
    'redirecionamento': falsoFetch(() => new Response('', { status: 302,
      headers: { Location: 'https://outro.example/x' } })),
  };

  for (const [nome, buscar] of Object.entries(casos)) {
    const r = await pede({ buscar });
    const doc = await corpo(r);

    assert.equal(r.status, 502, `caso "${nome}" não deu 502`);
    assert.ok(!/ECONNREFUSED|10\.0\.0\.1|api\.eleicoes|stack|SyntaxError/i.test(doc),
      `caso "${nome}" vazou detalhe interno`);
    assert.match(doc, /<html lang="pt-BR">/);
  }
});

test('o serviço lento é abandonado, não fica pendurado', async () => {
  const buscar = falsoFetch((url, opcoes) => new Promise((ok, erro) => {
    opcoes.signal?.addEventListener('abort', () => erro(
      Object.assign(new Error('abortado'), { name: 'AbortError' })));
  }));

  const r = await pede({ buscar, tempoLimite: 30 });

  assert.equal(r.status, 502);
  assert.ok(TEMPO_LIMITE_MS > 0 && TEMPO_LIMITE_MS <= 15000,
    `tempo limite padrão fora do razoável: ${TEMPO_LIMITE_MS}`);
});

test('payload gigante do serviço é recusado, não lido inteiro', async () => {
  const enorme = { ...GUARDADA,
    resposta: { ...GUARDADA.resposta, texto: 'a'.repeat(LIMITE_PAYLOAD + 1000) } };

  const r = await pede({ buscar: falsoFetch(json(enorme)) });

  assert.equal(r.status, 502);
  assert.ok(LIMITE_PAYLOAD > 0 && LIMITE_PAYLOAD <= 2 * 1024 * 1024);
});

// --------------------------------------------------------------------------
// conteúdo hostil vindo do serviço
// --------------------------------------------------------------------------

test('JSON hostil do serviço não vira estrutura na página', async () => {
  const veneno = '</title></head><body><script>alert(1)</script><img src=x onerror=alert(1)>';
  const buscar = falsoFetch(json({ ...GUARDADA,
    pergunta: veneno,
    resposta: { ...GUARDADA.resposta,
      texto: `${veneno}\n\n[clique](javascript:alert(1))`,
      citacoes: [{ marcadores: [1], nome: veneno, url: 'javascript:alert(1)' }],
      release_id: veneno, release_status: 'oficial' } }));

  const r = await pede({ buscar });
  const doc = await corpo(r);

  assert.equal(r.status, 200);
  assert.ok(!doc.includes('<script>alert(1)'), 'um <script> do serviço chegou à página');
  assert.ok(!/<img\b/i.test(doc));
  assert.ok(!temManipuladorDeEvento(doc));
  assert.ok(!/href="\s*javascript:/i.test(doc));
  assert.ok(!doc.includes('</title></head>'));
  assert.equal((doc.match(/<\/html>/g) ?? []).length, 1);
});

// --------------------------------------------------------------------------
// a ponte com o runtime do Pages
// --------------------------------------------------------------------------

test('onRequestGet lê params.id e request.url do contexto', async () => {
  const buscar = falsoFetch(json(GUARDADA));

  const r = await onRequestGet({
    request: new Request(`https://eleicoes.ai/resposta/${ID}`),
    env: { PESQUISA_API: 'https://api.teste.local' },
    params: { id: ID },
    buscar,
  });

  assert.equal(r.status, 200);
  assert.equal(buscar.chamadas[0].url, `https://api.teste.local/api/respostas/${ID}`);
});

test('sem fetch injetado a função usa o do runtime', async () => {
  const original = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url) => { chamadas.push(String(url)); return json(GUARDADA)(); };
  try {
    const r = await onRequestGet({
      request: new Request(URL_PEDIDO), env: {}, params: { id: ID },
    });
    assert.equal(r.status, 200);
    assert.deepEqual(chamadas, [`https://api.eleicoes.ai/api/respostas/${ID}`]);
  } finally {
    globalThis.fetch = original;
  }
});
