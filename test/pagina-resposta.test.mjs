/**
 * A página pública de uma resposta, renderizada no servidor.
 *
 * Ela existe porque um link precisa abrir a resposta para quem NÃO tem
 * JavaScript, para o robô que monta a prévia do WhatsApp e para quem chega
 * pelo celular de outra pessoa. Nada disso executa o bundle da home.
 *
 * E ela é o único lugar do site onde conteúdo de terceiro vira STRING de HTML.
 * Na home a defesa é arquitetural: src/lib/markdown.mjs materializa nó a nó e
 * não existe caminho em que um caractere do texto vire estrutura. Aqui não há
 * DOM para materializar — há um documento a escrever. Então a defesa muda de
 * forma: a MESMA árvore de nós é serializada com escape obrigatório de texto e
 * de atributo, e endereço nenhum vira `href` sem passar pelo filtro de
 * esquema.
 *
 * O que este arquivo cobra é isso, do lado hostil: JSON do serviço tratado
 * como se viesse de um atacante — fechar tag, criar `<script>`, plantar
 * `onerror=`, escapar de um atributo `content=` de Open Graph ou pôr
 * `javascript:` num link de fonte.
 *
 * E o lado do produto: a pergunta é o H1, as fontes continuam clicáveis, a
 * data aparece, o estado da release aparece, e os três avisos que dão sentido
 * ao site — resposta de IA, neutralidade e como fazer outra pergunta — estão
 * na página, não no bundle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { paginaErro, paginaResposta } from '../src/lib/pagina-resposta.mjs';
import { ROTULO_PREVIA } from '../src/lib/release.mjs';

const ID = 'AbCdEfGhIjKlMnOpQrStUv';
const ORIGEM = 'https://eleicoes.ai';

const DADOS = {
  schema_version: 1,
  compartilhamento_id: ID,
  criado_em: '2026-08-25T14:03:00Z',
  pergunta: 'O que os candidatos propõem sobre previdência?',
  resposta: {
    texto: [
      'Dois dos treze registraram proposta sobre o tema; os demais não têm registro.',
      '',
      '## O que está registrado',
      '',
      '- **Primeiro:** falou em rever a regra de transição [S1]',
      '- **Segundo:** citou o tema sem detalhar [S2]',
      '',
      '---',
      '',
      'A leitura de que haveria convergência é *inferência*, não registro.',
      '',
      'Veja o [acervo por candidato](/acervo).',
    ].join('\n'),
    citacoes: [
      { marcadores: [1], nome: 'Primeiro', rotulo: 'vídeo no YouTube', data: '2026-08-13',
        url: 'https://exemplo.org/video-um', ts: '00:12:40', estatuto: 3,
        estatuto_rotulo: 'legenda automática' },
      { marcadores: [2], nome: 'Segundo', rotulo: 'post no X', data: '2026-07-02',
        url: 'https://exemplo.org/post-dois' },
    ],
    rodape: 'Resposta gerada por IA a partir do acervo · 2026-08-25',
    release_id: null,
    release_status: 'previa',
  },
};

const html = (extra = {}, opcoes = {}) =>
  paginaResposta({ ...DADOS, ...extra }, { origem: ORIGEM, id: ID, ...opcoes });

/** O conteúdo de uma <meta> por nome ou propriedade. */
function meta(doc, chave) {
  const re = new RegExp(`<meta[^>]*(?:name|property)="${chave}"[^>]*content="([^"]*)"`, 'i');
  const alt = new RegExp(`<meta[^>]*content="([^"]*)"[^>]*(?:name|property)="${chave}"`, 'i');
  return (doc.match(re) ?? doc.match(alt))?.[1] ?? null;
}

const semScripts = (doc) => doc.replace(/<script\b[\s\S]*?<\/script>/gi, '');
/** Só o que o leitor vê: sem o script e sem a folha embutidos. */
const soConteudo = (doc) => semScripts(doc).replace(/<style\b[\s\S]*?<\/style>/gi, '');

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
// o documento
// --------------------------------------------------------------------------

test('a página é um documento completo em português', () => {
  const doc = html();

  assert.match(doc, /^<!doctype html>/i);
  assert.match(doc, /<html lang="pt-BR">/);
  assert.match(doc, /<meta charset="utf-8"/i);
  assert.match(doc, /<meta name="viewport"/i);
  assert.match(doc, /<\/html>\s*$/);
});

test('a pergunta é o H1, e é o único H1 da página', () => {
  const doc = html();

  assert.match(doc, /<h1[^>]*>O que os candidatos propõem sobre previdência\?<\/h1>/);
  assert.equal((doc.match(/<h1\b/g) ?? []).length, 1);
});

test('a resposta é fiel: títulos, listas, ênfase e separador', () => {
  const doc = html();

  assert.match(doc, /<h3[^>]*>O que está registrado<\/h3>/);
  assert.match(doc, /<li><strong>Primeiro:<\/strong>/);
  assert.match(doc, /<em>inferência<\/em>/);
  assert.match(doc, /<hr\s*\/?>/);
  assert.ok(doc.includes('Dois dos treze registraram proposta'));
});

test('os marcadores viram âncora para a fonte correspondente', () => {
  const doc = html();

  assert.match(doc, /href="#fonte-1"[^>]*>\[S1\]</);
  assert.ok(doc.includes('id="fonte-1"'));
  assert.ok(doc.includes('id="fonte-2"'));
});

test('as fontes originais continuam clicáveis, e com link seguro', () => {
  const doc = html();

  assert.ok(doc.includes('https://exemplo.org/video-um'));
  assert.ok(doc.includes('https://exemplo.org/post-dois'));
  assert.match(doc, /rel="noopener noreferrer nofollow"/);
  assert.match(doc, /Fontes citadas \(2\)/);
  assert.match(doc, /legenda autom/);
});

test('a data da resposta aparece, legível e em <time>', () => {
  const doc = html();

  assert.match(doc, /<time datetime="2026-08-25T14:03:00Z">[^<]*25\/08\/2026[^<]*<\/time>/);
});

test('o estado da release aparece — prévia enquanto não houver release', () => {
  assert.ok(html().includes(ROTULO_PREVIA));

  const oficial = html({ resposta: { ...DADOS.resposta,
    release_id: 'rel-2026-08-25', release_status: 'oficial' } });

  assert.match(oficial, /Release oficial rel-2026-08-25/);
});

test('a página diz que a resposta é gerada por IA e que não indica voto', () => {
  const doc = html();

  assert.match(doc, /gerada por (?:uma )?intelig[êe]ncia artificial|resposta gerada por IA/i);
  assert.ok(doc.includes('não indica em quem votar'));
});

test('a página convida a fazer outra pergunta, na home', () => {
  const doc = html();

  assert.match(doc, /<a[^>]+href="\/"[^>]*>[^<]*(?:pergunta|perguntar)/i);
});

test('a página oferece WhatsApp sem JavaScript e o resto como aprimoramento', () => {
  const doc = semScripts(html());
  const zap = doc.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/)?.[1];

  assert.ok(zap, 'não há link de WhatsApp que funcione sem JavaScript');
  const mensagem = decodeURIComponent(zap.slice('https://wa.me/?text='.length).replace(/&amp;/g, '&'));
  assert.ok(mensagem.includes(DADOS.pergunta), 'a mensagem do WhatsApp sai sem a pergunta');
  assert.ok(mensagem.includes(`${ORIGEM}/resposta/${ID}`), 'a mensagem sai sem a URL curta');
  assert.ok(mensagem.includes(ROTULO_PREVIA), 'a mensagem sai sem o estado dos dados');
});

test('sem JavaScript a página inteira continua de pé', () => {
  const doc = semScripts(html());

  assert.match(doc, /<h1[^>]*>O que os candidatos/);
  assert.match(doc, /<h3[^>]*>O que está registrado<\/h3>/);
  assert.ok(doc.includes('https://exemplo.org/video-um'));
  assert.ok(doc.includes(ROTULO_PREVIA));
});

test('a página não lista outras respostas — só esta', () => {
  const doc = html();
  const ids = [...doc.matchAll(/\/resposta\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]);

  assert.ok(ids.length > 0);
  assert.deepEqual([...new Set(ids)], [ID]);
});

// --------------------------------------------------------------------------
// metadados
// --------------------------------------------------------------------------

test('o soft launch continua: noindex', () => {
  assert.match(meta(html(), 'robots'), /noindex/);
  assert.match(meta(html(), 'robots'), /follow/);
});

test('canonical e og:url usam a origem recebida', () => {
  const doc = html();

  assert.match(doc, new RegExp(`<link rel="canonical" href="${ORIGEM}/resposta/${ID}"`));
  assert.equal(meta(doc, 'og:url'), `${ORIGEM}/resposta/${ID}`);
});

test('em preview a origem da requisição manda', () => {
  const doc = paginaResposta(DADOS,
    { origem: 'https://abc.eleicoes-ai.pages.dev', id: ID });

  assert.ok(doc.includes(`https://abc.eleicoes-ai.pages.dev/resposta/${ID}`));
  assert.ok(!doc.includes('https://eleicoes.ai/resposta/'));
});

test('Open Graph completo, com a conclusão como descrição curta', () => {
  const doc = html();

  assert.ok(meta(doc, 'og:title').includes('previdência'));
  assert.equal(meta(doc, 'og:type'), 'article');
  assert.equal(meta(doc, 'og:site_name'), 'eleicoes.ai');
  assert.equal(meta(doc, 'og:locale'), 'pt_BR');
  assert.equal(meta(doc, 'twitter:card'), 'summary');

  const descricao = meta(doc, 'og:description');
  assert.ok(descricao.includes('Dois dos treze'), `descrição: ${descricao}`);
  assert.ok(descricao.length <= 220, `descrição com ${descricao.length} caracteres`);
  assert.doesNotMatch(descricao, /##|\*\*|\[S\d/);
  assert.equal(meta(doc, 'description'), descricao);
});

test('a descrição não leva os marcadores de fonte', () => {
  // `[S1]` é âncora dentro da página; numa prévia de link ele vira ruído sem
  // destino, colado no meio da frase que deveria explicar a resposta
  const doc = html({ resposta: { ...DADOS.resposta,
    texto: 'Dois dos treze registraram proposta [S1] sobre o tema [S2].\n\n## Resto' } });

  const descricao = meta(doc, 'og:description');
  assert.ok(descricao.includes('Dois dos treze'));
  assert.doesNotMatch(descricao, /\[S\d/);
  assert.doesNotMatch(descricao, / {2}| \./);
});

test('o <title> traz a pergunta e o site', () => {
  const titulo = html().match(/<title>([^<]*)<\/title>/)[1];

  assert.ok(titulo.includes('previdência'));
  assert.match(titulo, /eleicoes\.ai/);
});

// --------------------------------------------------------------------------
// JSON HOSTIL
// --------------------------------------------------------------------------

const VENENO = '</title></head><body><script>alert(1)</script><img src=x onerror=alert(2)>';

test('conteúdo hostil não fecha tag nem cria script em lugar nenhum', () => {
  const doc = html({
    pergunta: `Pergunta ${VENENO}`,
    resposta: { ...DADOS.resposta,
      texto: `Texto ${VENENO}\n\n## ${VENENO}\n\n- item ${VENENO}`,
      rodape: `Rodapé ${VENENO}`,
      citacoes: [{ marcadores: [1], nome: VENENO, rotulo: VENENO, data: '2026-01-01',
        url: 'https://exemplo.org/ok', estatuto_rotulo: VENENO }] },
  });

  assert.ok(!doc.includes('<script>alert(1)'), 'um <script> do serviço chegou ao documento');
  assert.ok(!/<img\b/i.test(doc), 'a resposta injetou um <img>');
  assert.ok(!temManipuladorDeEvento(doc),
    'um manipulador de evento chegou ao documento dentro de uma tag');
  assert.ok(!doc.includes('</title></head>'), 'o conteúdo conseguiu fechar o <title>');
  assert.ok(doc.includes('&lt;script&gt;'), 'o HTML hostil não aparece escapado');
  // o documento continua bem formado: um <body> e um </html> no fim
  assert.equal((doc.match(/<body/g) ?? []).length, 1);
  assert.equal((doc.match(/<\/html>/g) ?? []).length, 1);
});

test('conteúdo hostil não escapa de um atributo de metadado', () => {
  const doc = html({
    pergunta: 'Pergunta" /><meta property="og:title" content="forjado',
    resposta: { ...DADOS.resposta,
      texto: 'Conclusão" /><meta property="og:description" content="forjado' },
  });

  assert.ok(!/<meta[^>]*content="forjado/.test(doc), 'o conteúdo criou uma <meta> própria');
  assert.equal((doc.match(/<meta[^>]*property="og:title"/g) ?? []).length, 1);
  assert.equal((doc.match(/<meta[^>]*property="og:description"/g) ?? []).length, 1);
  assert.ok(meta(doc, 'og:title').includes('&quot;'), 'as aspas não foram escapadas');
});

test('quebra de linha e controle não estouram uma <meta>', () => {
  const doc = html({ pergunta: 'linha um\nlinha dois\r\ttab' });

  assert.doesNotMatch(meta(doc, 'og:title'), /[\n\r\t]/);
  assert.doesNotMatch(doc.match(/<title>([^<]*)<\/title>/)[1], /[\n\r\t]/);
});

test('endereço executável nunca vira href — nem em fonte, nem em link do texto', () => {
  const doc = html({
    resposta: { ...DADOS.resposta,
      texto: 'Veja [clique aqui](javascript:alert(1)) e [outro](data:text/html,<script>x</script>)',
      citacoes: [
        { marcadores: [1], nome: 'Forjada', url: 'javascript:alert(1)' },
        { marcadores: [2], nome: 'Forjada 2', url: ' java\tscript:alert(1)' },
        { marcadores: [3], nome: 'Forjada 3', url: 'vbscript:msgbox(1)' },
        { marcadores: [4], nome: 'Boa', url: 'https://exemplo.org/ok' },
      ] },
  });

  assert.ok(!/href="\s*javascript:/i.test(doc), 'um href javascript: chegou ao documento');
  assert.ok(!/href="\s*data:/i.test(doc), 'um href data: chegou ao documento');
  assert.ok(!/href="[^"]*vbscript:/i.test(doc), 'um href vbscript: chegou ao documento');
  assert.ok(doc.includes('clique aqui'), 'o rótulo do link recusado sumiu');
  assert.ok(doc.includes('Forjada'), 'a fonte recusada sumiu inteira');
  assert.ok(doc.includes('https://exemplo.org/ok'), 'o endereço legítimo foi perdido junto');
});

test('URL protocol-relative ou caminho com barra invertida não se disfarça de link interno', () => {
  const doc = html({
    resposta: { ...DADOS.resposta, citacoes: [
      { marcadores: [1], nome: 'Protocol-relative', url: '//malicioso.example/fonte' },
      { marcadores: [2], nome: 'Barra invertida', url: '\\malicioso.example\\fonte' },
      { marcadores: [3], nome: 'Barra após slash', url: '/\\malicioso.example/fonte' },
    ] },
  });

  assert.ok(!doc.includes('href="//malicioso.example'));
  assert.ok(!doc.includes('href="\\malicioso.example'));
  assert.ok(!doc.includes('href="/\\malicioso.example'));
  assert.ok(doc.includes('Protocol-relative'));
  assert.ok(doc.includes('Barra invertida'));
  assert.ok(doc.includes('Barra após slash'));
});

test('URL absoluta com barra invertida ou userinfo enganoso é recusada', () => {
  const doc = html({
    resposta: { ...DADOS.resposta, citacoes: [
      { marcadores: [1], nome: 'HTTP barra dupla', url: 'http:\\\\evil.example/x' },
      { marcadores: [2], nome: 'HTTP barra simples', url: 'http:\\evil.example/x' },
      { marcadores: [3], nome: 'Userinfo enganoso',
        url: 'https://eleicoes.ai@evil.example/x' },
      { marcadores: [4], nome: 'HTTPS legítimo', url: 'https://exemplo.org/x' },
    ] },
  });

  assert.ok(!doc.includes('href="http:\\'));
  assert.ok(!doc.includes('href="https://eleicoes.ai@evil.example'));
  assert.ok(doc.includes('HTTP barra dupla'));
  assert.ok(doc.includes('HTTP barra simples'));
  assert.ok(doc.includes('Userinfo enganoso'));
  assert.ok(doc.includes('href="https://exemplo.org/x"'));
});

test('confirmação de copiar link é anunciada por uma região de status', () => {
  const doc = html();

  assert.match(doc, /id="status-compartilhar"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.ok(doc.includes("status.textContent = 'Link copiado.'"));
});

test('resposta degenerada não derruba a página', () => {
  for (const resposta of [null, undefined, 'texto', 42, [], { texto: '' },
    { texto: 'a', citacoes: 'x' }]) {
    assert.doesNotThrow(() => paginaResposta({ ...DADOS, resposta },
      { origem: ORIGEM, id: ID }), `resposta ${JSON.stringify(resposta)}`);
  }
  assert.doesNotThrow(() => paginaResposta(null, { origem: ORIGEM, id: ID }));
});

test('sem pergunta a página ainda tem um H1 — nunca um H1 vazio', () => {
  const doc = html({ pergunta: '' });

  const h1 = doc.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
  assert.ok(h1.trim().length > 0);
});

test('sem citações a página diz que não há evidência, em vez de lista vazia', () => {
  const doc = html({ resposta: { ...DADOS.resposta, citacoes: [] } });

  assert.match(doc, /nenhuma fonte|sem fonte|não trouxe/i);
  assert.ok(!/<ol class="fontes"/.test(doc));
});

// --------------------------------------------------------------------------
// erros
// --------------------------------------------------------------------------

test('404: página útil, com noindex e caminho de volta', () => {
  const doc = paginaErro(404);

  assert.match(doc, /<html lang="pt-BR">/);
  assert.match(meta(doc, 'robots'), /noindex/);
  assert.match(doc, /<a[^>]+href="\/"/);
  assert.equal((doc.match(/<h1\b/g) ?? []).length, 1);
  assert.ok(!doc.includes('undefined'));
});

test('502: mensagem genérica, sem detalhe interno', () => {
  const doc = paginaErro(502);

  assert.match(meta(doc, 'robots'), /noindex/);
  // só o que o leitor vê: `setTimeout` no aprimoramento embutido não é
  // detalhe da falha, e cobrar a palavra ali proibiria o script inteiro
  assert.ok(!/upstream|stack|api\.eleicoes|fetch|ECONN/i.test(soConteudo(doc)));
  assert.equal((doc.match(/<h1\b/g) ?? []).length, 1);
});

test('a página de erro não revela se o id existe, foi revogado ou é inválido', () => {
  assert.equal(paginaErro(404), paginaErro(404));
});
