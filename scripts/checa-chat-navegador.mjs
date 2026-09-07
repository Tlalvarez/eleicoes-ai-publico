#!/usr/bin/env node
/**
 * O chat, rodando de verdade num navegador, contra uma API falsa.
 *
 * Os módulos do chat têm teste unitário; o que nenhum deles prova é que o
 * BUNDLE PUBLICADO, carregado por um navegador de verdade, monta a resposta na
 * tela. Entre o `.mjs` e o `dist/` há um empacotador, e entre o `dist/` e a
 * tela há o navegador. Este é o único gate que atravessa os dois.
 *
 * Como funciona, sem dependência nova: um servidor Node serve `dist/` E
 * responde `/api/conversa` — na MESMA origem, então não há CORS nem
 * configuração para acertar. O Chrome é chamado em modo headless com
 * `--dump-dom` e um orçamento de tempo virtual, que executa o script e imprime
 * o DOM resultante. As afirmações são feitas sobre esse DOM.
 *
 * **A porta é EFÊMERA (`listen(0)`), e isso é parte do teste.** Antes ela era
 * fixa em 8765, a mesma do serviço de desenvolvimento — em qualquer máquina
 * onde esse serviço estivesse de pé, o gate morria com `EADDRINUSE` e o
 * pipeline ficava vermelho por motivo nenhum. Um gate que exija uma porta
 * livre específica é um gate que compete com o ambiente de quem programa (e a
 * saída fácil, matar o processo alheio, é pior que o problema). Isso só é
 * possível porque o cliente agora fala com a MESMA ORIGEM: sem endereço
 * embutido no build, qualquer porta serve.
 *
 * Seis cenários:
 *   1. resposta normal — o Markdown vira estrutura, as fontes viram lista com
 *      âncora, e a barra de compartilhamento sai com a URL CURTA E PERSISTENTE
 *      `/resposta/<compartilhamento_id>`, que o serviço passou a devolver.
 *      Nenhum fragmento novo é gerado, e a barra de endereço continua na home:
 *      a conversa corrente não é uma página de resultado;
 *   2. resposta hostil — `javascript:` num link e `<img onerror>` no texto NÃO
 *      podem virar atributo nem elemento;
 *   3. permalink LEGADO — uma carga gerada aqui, em Node, reabre a resposta no
 *      navegador SEM nenhuma chamada de rede. Link antigo que já circula
 *      continua abrindo; o que mudou é que não se emite mais nenhum;
 *   4. fallback — sem `/api/conversa`, o primeiro turno cai em `/api/pesquisa`
 *      e a resposta sai com o aviso de que não há histórico;
 *   5. permalink legado HOSTIL — uma carga BEM-FORMADA (soma de verificação
 *      correta, montada com o próprio codificador) trazendo `javascript:` numa
 *      fonte e uma release "oficial" forjada. A soma é FNV-1a e não autentica
 *      nada: quem fabrica o link recalcula. Este cenário é o que prova, no
 *      navegador, que a defesa está na decodificação e não na soma;
 *   6. medição — o bundle publicado emite o funil de um turno
 *      (`pergunta_enviada` → `resposta_primeiro_texto` → `resposta_recebida`)
 *      com o contexto da página, e NENHUM valor medido é prosa. É aqui que a
 *      promessa de /privacidade deixa de ser papel: o teste de unidade prova
 *      que o filtro recusa texto livre, este prova que o produto chama o
 *      filtro. Um `posthog.capture` novo fora de `medicao.mjs` é barrado
 *      antes, por scripts/checa-medicao.mjs;
 *   7. resposta SEM `compartilhamento_id` — compatibilidade com um serviço que
 *      ainda não guarda a resposta. Aí não se inventa endereço nem se cai de
 *      volta no fragmento: copiar texto e copiar Markdown continuam, e a
 *      indisponibilidade do link é dita.
 *
 * Sem navegador em disco, o gate NÃO passa em silêncio: ele avisa em voz alta
 * o que deixou de ser conferido e sai com sucesso, do mesmo jeito que
 * checa-catalogo.mjs faz quando o runtime não abre SQLite. Um gate que exija
 * Chrome numa máquina sem Chrome vira um gate que alguém remove.
 *
 * Uso: npm run build && npm run test:navegador
 */
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';

import { codifica } from '../src/lib/permalink.mjs';
import { analisaHeaders } from './emite-cabecalhos-dist.mjs';
import { ROTULO_PREVIA } from '../src/lib/release.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const NAVEGADORES = ['google-chrome', 'chromium', 'chromium-browser',
  'google-chrome-stable', process.env.CHROME_BIN].filter(Boolean);

/**
 * Conjuntos de flags, em ordem de preferência.
 *
 * Não é firula: `--disable-dev-shm-usage` — a receita de sempre para container
 * com `/dev/shm` pequeno — faz o Chrome 151 sair com sucesso e SEM imprimir
 * nada. Com `--dump-dom`, saída vazia não é erro: é um DOM vazio, e as
 * afirmações caem todas de uma vez, apontando para o produto quando o defeito
 * é do arranque do navegador. Por isso as flags são ESCOLHIDAS por um
 * pré-voo, e não fixadas na fé.
 */
// Perfil PRÓPRIO e descartável para cada execução do gate. Sem
// `--user-data-dir`, o Chrome headless abre o perfil do usuário da máquina —
// o mesmo que o Chrome de verdade pode estar usando naquele momento —, carrega
// sincronização, apps gerenciados e serviços de fundo, e ora responde em 3 s,
// ora fica preso até o timeout de 90 s. Um gate que depende de o navegador do
// usuário estar fechado não é um gate.
const PERFIL = mkdtempSync(join(tmpdir(), 'chat-gate-chrome-'));
const FLAGS_DE_ISOLAMENTO = [
  `--user-data-dir=${PERFIL}`, '--no-default-browser-check',
  '--disable-background-networking', '--disable-sync', '--disable-component-update',
  // no macOS, perfil novo pede acesso ao Keychain ("Chrome Safe Storage") —
  // uma caixa de diálogo que um processo headless nunca fecha
  '--use-mock-keychain', '--password-store=basic',
];
const CONJUNTOS_DE_FLAGS = [
  ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--hide-scrollbars', ...FLAGS_DE_ISOLAMENTO],
  ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-extensions', '--hide-scrollbars', '--disable-dev-shm-usage', ...FLAGS_DE_ISOLAMENTO],
  ['--headless', '--disable-gpu', '--no-sandbox', ...FLAGS_DE_ISOLAMENTO],
];

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// ---------------------------------------------------------------------------
// a resposta falsa: formato "Candidatos" + duas armadilhas de segurança
// ---------------------------------------------------------------------------

const TEXTO_RESPOSTA = [
  'Dos candidatos com material coletado, dois trataram do tema e os demais não têm registro.',
  '',
  '## O que está registrado',
  '',
  '- **Primeiro:** afirmou em vídeo que pretende rever a regra de transição [S1]',
  '- **Segundo:** citou o assunto sem detalhar prazo nem custeio [S2]',
  '',
  '---',
  '',
  '## Inferência',
  '',
  'As duas falas tratam do mesmo dispositivo, mas nenhuma descreve mecanismo — a leitura',
  'de que haveria convergência é *inferência*, não registro.',
  '',
  // a sonda de injeção fica ANTES de ## Lacunas: a seção é removida da tela
  // pela interface (decisão de produto), e a sonda precisa continuar visível
  'Tentativa de injeção que precisa continuar sendo TEXTO:',
  '[clique aqui](javascript:alert(1)) e <img src=x onerror=alert(1)> e <script>alert(2)</script>',
  '',
  // o link interno legítimo também fica ANTES de ## Lacunas, pelo mesmo motivo:
  // a afirmação é que um link do próprio site SOBREVIVE ao filtro, e isso só
  // é observável numa seção que a interface mostra
  'Veja o [acervo por candidato](/acervo) para conferir a cobertura.',
  '',
  '## Lacunas',
  '',
  '- Nada registrado para os demais candidatos.',
].join('\n');

/** O identificador público que o serviço passou a devolver: 22 caracteres. */
const ID_PUBLICO = 'AbCdEfGhIjKlMnOpQrStUv';

const RESPOSTA = {
  id: 'resp-teste-1',
  compartilhamento_id: ID_PUBLICO,
  texto: TEXTO_RESPOSTA,
  citacoes: [
    { marcadores: [1], candidato: 'primeiro', nome: 'Primeiro', rotulo: 'vídeo no YouTube',
      tipo: 'video', data: '2026-08-13', url: 'https://exemplo.org/video-um',
      ts: '00:12:40', estatuto: 3, estatuto_rotulo: 'legenda automática' },
    { marcadores: [2], candidato: 'segundo', nome: 'Segundo', rotulo: 'post no X',
      tipo: 'post-x', data: '2026-07-02', url: 'https://exemplo.org/post-dois',
      estatuto: 4, estatuto_rotulo: 'áudio conferido' },
  ],
  rodape: 'Resposta gerada por IA a partir do acervo · modelo de teste · 2026-08-25',
  release_id: null,
  release_status: 'previa',
};

/**
 * O documento de `GET /api/respostas/<id>` — o registro público da resposta.
 *
 * O escopo e a cobertura vivem AQUI: é por eles que a página de uma resposta
 * compartilhada sabe de que conversa ela é. Sem eles, `/resposta/<id>` (que é
 * servida com o app da HOME) mostra a resposta de governador de São Paulo com
 * o rótulo de presidente e sem a causa da lacuna.
 */
const GUARDADA = {
  compartilhamento_id: ID_PUBLICO,
  criado_em: '2026-09-06T12:00:00Z',
  pergunta: 'o que propõem para a segurança pública?',
  schema_version: 1,
  resposta: {
    ...RESPOSTA,
    escopo: { cargo: 'governador', uf: 'SP' },
    candidatos: [
      { slug: 'governador-sp-primeiro-250000000001', nome: 'PRIMEIRO',
        elegivel: true, situacao: 'com_material', lacuna_causa: null },
      { slug: 'governador-sp-segundo-250000000002', nome: 'SEGUNDO',
        elegivel: true, situacao: 'com_material', lacuna_causa: null },
      { slug: 'governador-sp-terceira-250000000003', nome: 'TERCEIRA CANDIDATA',
        elegivel: false, situacao: 'sem_material_no_acervo',
        lacuna_causa: 'sem_fonte_declarada' },
    ],
  },
};

// ---------------------------------------------------------------------------
// o espião da medição
// ---------------------------------------------------------------------------

/**
 * Um `window.posthog` falso, injetado ANTES dos scripts da página.
 *
 * `src/lib/medicao.mjs` prova em teste de unidade que o filtro recusa texto
 * livre. O que ele não pode provar é que o bundle PUBLICADO chama `medir` nos
 * lugares certos, com os números certos — só o navegador prova isso. O espião
 * guarda o que foi capturado no atributo `data-eventos` do <html>, que é o
 * único canal que `--dump-dom` enxerga.
 *
 * Ele é servido como ARQUIVO da mesma origem: a CSP do dist autoriza script
 * inline só por hash, e um <script> inline injetado aqui seria bloqueado — o
 * gate estaria medindo o bloqueio, não o produto.
 */
const CAMINHO_ESPIA = '/__medicao-espia.js';
const ESPIA = `
  window.__eventos = [];
  window.posthog = {
    capture: function (evento, props) {
      window.__eventos.push({ evento: evento, props: props });
      document.documentElement.setAttribute('data-eventos',
        JSON.stringify(window.__eventos));
    },
  };
`;

/** Os eventos que o espião registrou, na ordem em que foram capturados. */
function eventosDoDom(dom) {
  const bruto = dom.match(/<html[^>]*\sdata-eventos="([^"]*)"/)?.[1];
  if (!bruto) return [];
  const texto = bruto.replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  try { return JSON.parse(texto); } catch { return []; }
}

/** O primeiro evento com este nome, ou `null`. */
function evento(eventos, nome) {
  return eventos.find((e) => e.evento === nome) ?? null;
}

// ---------------------------------------------------------------------------
// servidor: dist/ + API falsa, na mesma origem
// ---------------------------------------------------------------------------

/** `dist/_headers` como a Pages o aplicaria a todo caminho (`/*`). Sem o arquivo, nada. */
const CABECALHOS_DA_PAGES = existsSync(join(DIST, '_headers'))
  ? (analisaHeaders(readFileSync(join(DIST, '_headers'), 'utf8'))['/*'] ?? {})
  : {};

function sobeServidor(modo) {
  const chamadas = [];
  const servidor = createServer((req, res) => {
    // só o caminho importa; a base existe para o URL() ter o que analisar
    const url = new URL(req.url, 'http://servidor.local');

    if (url.pathname === CAMINHO_ESPIA) {
      res.writeHead(200, { 'Content-Type': TIPOS['.js'], ...CABECALHOS_DA_PAGES });
      res.end(ESPIA);
      return;
    }

    if (url.pathname.startsWith('/api/respostas/')) {
      chamadas.push(url.pathname);
      res.writeHead(200, { 'Content-Type': TIPOS['.json'] });
      res.end(JSON.stringify(GUARDADA));
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      chamadas.push(url.pathname);
      let corpo = '';
      req.on('data', (c) => { corpo += c; });
      req.on('end', () => {
        if (modo === 'erro' && url.pathname.startsWith('/api/conversa')) {
          res.writeHead(500, { 'Content-Type': TIPOS['.json'] });
          res.end('{"erro":"pane"}');
          return;
        }
        const semConversa = modo === 'fallback'
          && (url.pathname === '/api/conversa' || url.pathname === '/api/conversa/stream');
        if (semConversa) {
          res.writeHead(404, { 'Content-Type': TIPOS['.json'] });
          res.end('{}');
          return;
        }
        // `sem-id` imita um serviço que ainda não guarda a resposta
        const { compartilhamento_id: _, ...semId } = RESPOSTA;
        const resposta = modo === 'sem-id' ? semId : RESPOSTA;
        if (url.pathname === '/api/conversa/stream') {
          // a rota ao vivo, como o serviço a serve: etapa, texto em pedaços,
          // resultado — é o que o bundle publicado tem de saber ler
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store' });
          const ev = (tipo, dados) => `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;
          res.write(ev('etapa', { m: 'Procurando no acervo…' }));
          const metade = Math.floor(resposta.texto.length / 2);
          res.write(ev('texto', { t: resposta.texto.slice(0, metade) }));
          res.write(ev('texto', { t: resposta.texto.slice(metade) }));
          res.end(ev('resultado', resposta));
          return;
        }
        res.writeHead(200, { 'Content-Type': TIPOS['.json'] });
        res.end(JSON.stringify(resposta));
      });
      return;
    }

    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    for (const tentativa of [rel, `${rel}.html`, join(rel, 'index.html'), '/index.html']) {
      const caminho = join(DIST, tentativa);
      if (existsSync(caminho) && !caminho.endsWith('/')) {
        try {
          let dados = readFileSync(caminho);
          // O build de produção embute o endereço público da API em `data-api`
          // (PUBLIC_PESQUISA_API). Servido assim, o chat ignoraria a API falsa
          // deste gate e faria perguntas REAIS ao serviço em produção — pagas,
          // lentas e fora do orçamento de tempo do navegador. Aqui a página é
          // servida com a API na MESMA ORIGEM, que é a premissa deste gate.
          if (extname(caminho) === '.html') {
            // o espião entra logo no <head>: script clássico executa na hora,
            // e os scripts do Astro são módulos (adiados). Assim `window.posthog`
            // já existe quando o chat chama `medir`.
            dados = Buffer.from(dados.toString('utf8')
              .replace(/data-api="https?:\/\/[^"]*"/g, 'data-api=""')
              .replace('<head>', `<head><script src="${CAMINHO_ESPIA}"></script>`));
          }
          // Os cabeçalhos de segurança que a Pages aplicaria (dist/_headers,
          // inclusive a CSP com os hashes dos scripts inline) valem aqui
          // também: uma CSP que bloqueasse o script do chat só apareceria em
          // produção se este gate servisse o dist sem ela.
          res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] ?? 'application/octet-stream',
            ...CABECALHOS_DA_PAGES });
          res.end(dados);
          return;
        } catch { /* diretório: tenta o próximo */ }
      }
    }
    res.writeHead(404).end('não encontrado');
  });
  return { servidor, chamadas };
}

// ---------------------------------------------------------------------------
// navegador
// ---------------------------------------------------------------------------

function achaNavegador() {
  for (const nome of NAVEGADORES) {
    const r = spawnSync('which', [nome], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.trim();
  }
  return null;
}

/**
 * Roda o navegador de forma ASSÍNCRONA — e isso não é preferência de estilo.
 *
 * A primeira versão usava `spawnSync`, que bloqueia o laço de eventos do Node.
 * O servidor que serve `dist/` e a API falsa vive NESTE processo: com o laço
 * parado, ele nunca respondia, o Chrome ficava esperando a página para sempre
 * e o gate morria por timeout — um impasse entre as duas metades do próprio
 * script.
 */
function dumpDom(navegador, flags, url, { orcamento = 15000, exigeConteudo = true } = {}) {
  return new Promise((ok, erro) => {
    const proc = spawn(navegador, [...flags,
      `--virtual-time-budget=${orcamento}`, '--dump-dom', url,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    let saida = '';
    let encerrado = false;
    proc.stdout.setEncoding('utf8');
    // `--dump-dom` imprime o documento inteiro de uma vez e, com perfil
    // isolado, o processo às vezes fica vivo depois disso (serviços de fundo
    // encerrando). O que este gate quer é o DOM: assim que ele chegou inteiro,
    // o navegador já fez o seu trabalho e é encerrado daqui.
    proc.stdout.on('data', (p) => {
      saida += p;
      if (!encerrado && /<\/html>\s*$/i.test(saida)) {
        encerrado = true;
        clearTimeout(relogio);
        proc.kill('SIGKILL');
        ok(saida);
      }
    });

    const relogio = setTimeout(() => {
      proc.kill('SIGKILL');
      erro(new Error(`o navegador não terminou em 90 s para ${url}`));
    }, 90000);

    proc.on('error', (e) => { clearTimeout(relogio); erro(e); });
    proc.on('close', () => {
      if (encerrado) return;
      clearTimeout(relogio);
      // depois do pré-voo, DOM vazio é falha de arranque, não resposta em
      // branco: dizer isso aqui evita a cascata de afirmações de produto
      if (exigeConteudo && !saida.trim()) {
        erro(new Error(`o navegador saiu sem imprimir DOM para ${url} — arranque do `
          + 'navegador, não a página'));
        return;
      }
      ok(saida);
    });
  });
}

/**
 * Pré-voo: qual conjunto de flags faz ESTE navegador imprimir um DOM?
 *
 * Uma página `data:` mínima, sem servidor e sem script. Se nem ela sai, o
 * problema é o arranque do navegador — e é isso que precisa aparecer na tela,
 * em vez de trinta afirmações de produto falhando em cascata.
 */
async function escolheFlags(navegador) {
  const tentativas = [];
  for (const flags of CONJUNTOS_DE_FLAGS) {
    let dom = '';
    try {
      dom = await dumpDom(navegador, flags, 'data:text/html,<p id=prevoo>ok</p>',
        { orcamento: 2000, exigeConteudo: false });
    } catch (e) {
      tentativas.push(`${flags.join(' ')} → ${e.message}`);
      continue;
    }
    if (dom.includes('id="prevoo"')) return { flags, tentativas };
    tentativas.push(`${flags.join(' ')} → saiu sem imprimir DOM (${dom.length} bytes)`);
  }
  return { flags: null, tentativas };
}

// ---------------------------------------------------------------------------

const navegador = achaNavegador();
if (!navegador) {
  console.log('PULADO (navegador): nenhum Chrome/Chromium encontrado em PATH '
    + `(${NAVEGADORES.join(', ')}).`);
  console.log('  NÃO foram conferidos: renderização da resposta no bundle publicado, '
    + 'defesa contra javascript:/HTML injetado na resposta, reabertura por permalink '
    + 'e o fallback para /api/pesquisa.');
  console.log('  Defina CHROME_BIN ou instale um navegador para que este gate rode.');
  process.exit(0);
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('FALHOU (navegador): dist/index.html não existe — rode `npm run build` antes.');
  process.exit(1);
}

const { flags, tentativas } = await escolheFlags(navegador);
if (!flags) {
  console.log(`PULADO (navegador): ${navegador} existe mas não imprime DOM em nenhum `
    + 'conjunto de flags conhecido:');
  for (const t of tentativas) console.log(`    ${t}`);
  console.log('  NÃO foram conferidos: renderização da resposta no bundle publicado, '
    + 'defesa contra javascript:/HTML injetado na resposta, reabertura por permalink '
    + 'e o fallback para /api/pesquisa.');
  process.exit(0);
}

const falhas = [];
const exige = (cenario, condicao, mensagem) => {
  if (!condicao) falhas.push(`${cenario}: ${mensagem}`);
};

/**
 * Sobe o servidor numa porta livre e entrega a base a quem for testar.
 *
 * `listen(0)` deixa o sistema escolher: nada a configurar, nada a liberar e
 * nada de processo alheio para derrubar. `127.0.0.1` explícito em vez de
 * pilha dupla — o Chrome resolve `localhost` como `::1` em algumas máquinas e
 * como `127.0.0.1` noutras, e o endereço é montado a partir do que o servidor
 * de fato abriu.
 */
async function comServidor(modo, tarefa) {
  const { servidor, chamadas } = sobeServidor(modo);
  await new Promise((ok, erro) => {
    servidor.once('error', erro);
    servidor.listen(0, '127.0.0.1', ok);
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    return await tarefa(chamadas, base);
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
}

try {
  // ---------------------------------------------------- 1 e 2: resposta normal
  await comServidor('conversa', async (chamadas, base) => {
    const dom = await dumpDom(navegador, flags, `${base}/?q=${encodeURIComponent('e sobre previdência?')}`);
    const c = 'resposta';

    exige(c, chamadas.includes('/api/conversa/stream') || chamadas.includes('/api/conversa'),
      'a página não chamou /api/conversa/stream nem /api/conversa');
    exige(c, dom.includes('e sobre previdência?'), 'a pergunta não aparece na conversa');
    exige(c, /<h3[^>]*>O que está registrado<\/h3>/.test(dom),
      'os títulos de seção do Markdown não viraram <h3>');
    exige(c, /<li><strong>Primeiro:<\/strong>/.test(dom),
      'os bullets com negrito do formato "Candidatos" não foram renderizados');
    exige(c, dom.includes('<hr>'), 'o separador --- não virou <hr>');
    exige(c, /<em>inferência<\/em>/.test(dom), 'o itálico não foi renderizado');
    exige(c, /<a class="fonte-chip" href="https:\/\/exemplo\.org\/video-um"[^>]*>vídeo 13\/08\/2026<\/a>/.test(dom),
      'o marcador [S1] não virou chip legível com link direto para a fonte');
    exige(c, /<summary[^>]*>Ver as 2 fontes desta resposta<\/summary>/.test(dom),
      'a lista de fontes não está recolhida num <details>');
    exige(c, dom.includes('id="fonte-1-1"') && dom.includes('id="fonte-1-2"'),
      'as fontes não receberam as âncoras que os marcadores apontam');
    exige(c, dom.includes('https://exemplo.org/video-um'), 'o endereço da fonte 1 não aparece');
    exige(c, dom.includes('13/08/2026'), 'a data da fonte não foi formatada');
    exige(c, /legenda autom/.test(dom), 'a ressalva de transcrição automática não aparece');
    exige(c, dom.includes(RESPOSTA.rodape), 'o rodapé da resposta não aparece');

    // compartilhamento: a URL é a rota pública, curta e persistente
    exige(c, /href="https:\/\/wa\.me\/\?text=[^"]+"/.test(dom), 'não há link de WhatsApp');
    exige(c, /aria-label="Copiar texto"/.test(dom), 'não há botão de copiar texto');
    exige(c, /aria-label="Copiar Markdown"/.test(dom), 'não há botão de copiar Markdown');
    exige(c, /aria-label="Copiar link"/.test(dom), 'não há botão de copiar link');
    exige(c, !/Copiar permalink/.test(dom),
      'o botão ainda se chama "Copiar permalink" — o link agora é uma rota, não uma carga');
    // A MEDIÇÃO, no bundle publicado: o funil inteiro de um turno, com os
    // números que o painel vai somar — e sem nada que se pareça com prosa.
    const eventos = eventosDoDom(dom);
    const nomes = eventos.map((e) => e.evento);
    exige(c, nomes.includes('pergunta_enviada'),
      `o bundle não mediu pergunta_enviada (mediu: ${nomes.join(', ') || 'nada'})`);
    exige(c, nomes.includes('resposta_primeiro_texto'),
      'o bundle não mediu o tempo até o primeiro texto do stream');
    exige(c, nomes.includes('resposta_recebida'),
      'o bundle não mediu resposta_recebida');
    const enviada = evento(eventos, 'pergunta_enviada')?.props ?? {};
    exige(c, enviada.cargo === 'presidente' && enviada.pagina === 'home',
      `o contexto da página não acompanhou o evento: ${JSON.stringify(enviada)}`);
    exige(c, enviada.turno === 1 && enviada.origem === 'url'
      && enviada.tamanho === 'curta',
      `pergunta_enviada saiu com o conteúdo errado: ${JSON.stringify(enviada)}`);
    const recebida = evento(eventos, 'resposta_recebida')?.props ?? {};
    exige(c, recebida.fontes === 2 && recebida.sem_fontes === false
      && recebida.via_fallback === false,
      `resposta_recebida saiu com o conteúdo errado: ${JSON.stringify(recebida)}`);
    // a fixture é uma PRÉVIA (release_id null): a dimensão tem de FALTAR, não
    // aparecer como "null" — dimensão vazia no painel vira release fantasma
    exige(c, !('release_id' in recebida),
      'release_id nulo virou dimensão em vez de sumir');
    exige(c, typeof recebida.ms === 'number' && recebida.ms >= 0,
      'resposta_recebida saiu sem o tempo total');
    // a promessa de /privacidade, conferida no navegador e não no papel:
    // nenhum valor medido é prosa, e a pergunta não vaza por nenhum caminho
    const valores = eventos.flatMap((e) => Object.values(e.props ?? {}));
    exige(c, valores.every((v) => typeof v !== 'string' || !/\s/.test(v)),
      `um valor com espaço chegou à medição: ${JSON.stringify(valores)}`);
    exige(c, !JSON.stringify(eventos).includes('previdência'),
      'o texto da pergunta chegou à medição');

    const zap = decodeURIComponent(dom.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/)?.[1] ?? '');
    exige(c, zap.includes(`/resposta/${ID_PUBLICO}`),
      `a mensagem do WhatsApp não leva a URL pública da resposta: ${zap.slice(0, 400)}`);
    exige(c, zap.includes('e sobre previdência?'),
      'a mensagem do WhatsApp sai sem a pergunta que gerou a resposta');
    exige(c, zap.includes('Prévia interna'),
      'a mensagem do WhatsApp sai sem o estado dos dados');
    exige(c, !zap.includes('#r='),
      'a mensagem do WhatsApp ainda carrega o fragmento legado');
    exige(c, !dom.includes('#r='),
      'a página gerou um fragmento #r= para uma resposta que já tem endereço próprio');

    // segurança: o texto hostil continua sendo texto
    const s = 'segurança';
    exige(s, !/href="javascript:/i.test(dom), 'um href javascript: chegou ao DOM');
    // a home tem <img> legítimos (os cards de candidatos); o que não pode
    // existir é o ELEMENTO hostil — e o texto injetado tem de seguir texto
    exige(s, !/<img\b[^>]*onerror/i.test(dom), 'a resposta injetou um <img onerror> no DOM');
    exige(s, dom.includes('&lt;img src=x onerror=alert(1)&gt;'),
      'o <img> hostil não aparece como TEXTO escapado na resposta');
    exige(s, !/<script>alert\(2\)<\/script>/.test(dom), 'a resposta injetou um <script>');
    exige(s, dom.includes('clique aqui'),
      'o rótulo do link recusado sumiu — o leitor perde a referência');
    exige(s, /&lt;img src=x onerror=alert\(1\)&gt;/.test(dom),
      'o HTML injetado não aparece como texto escapado');
    exige(s, /href="\/acervo"/.test(dom), 'o link interno legítimo foi perdido junto');
  });

  // ------------------------------------------------------------- 3: permalink
  await comServidor('conversa', async (chamadas, base) => {
    const carga = await codifica({
      pergunta: 'pergunta vinda do permalink',
      texto: TEXTO_RESPOSTA,
      citacoes: RESPOSTA.citacoes,
      rodape: RESPOSTA.rodape,
      release_status: 'previa',
    });
    const dom = await dumpDom(navegador, flags, `${base}/#r=${carga}`);
    const c = 'permalink';

    exige(c, chamadas.length === 0,
      `reabrir um permalink chamou a API (${chamadas.join(', ')}) — ele tem de ser autossuficiente`);
    exige(c, dom.includes('pergunta vinda do permalink'), 'a pergunta não foi reconstruída');
    exige(c, /<h3[^>]*>O que está registrado<\/h3>/.test(dom), 'a resposta não foi reconstruída');
    exige(c, dom.includes('https://exemplo.org/post-dois'), 'as fontes não foram reconstruídas');
    exige(c, /link compartilhado/i.test(dom),
      'a página não diz que aquilo veio de um link compartilhado');
  });

  // ------------------------------------------------ 5: permalink hostil
  await comServidor('conversa', async (chamadas, base) => {
    const carga = await codifica({
      pergunta: 'pergunta plantada por quem montou o link',
      texto: 'Texto escrito pelo atacante, com uma "fonte" [S1].',
      citacoes: [{ marcadores: [1], nome: 'Fonte forjada', rotulo: 'documento',
        data: '2026-08-20', url: 'javascript:alert(1)' }],
      rodape: 'rodapé plantado',
      release_id: 'rel-forjada-2026',
      release_status: 'oficial',
    });
    const dom = await dumpDom(navegador, flags, `${base}/#r=${carga}`);
    const c = 'permalink hostil';

    exige(c, !/href="javascript:/i.test(dom),
      'um endereço javascript: vindo do fragmento virou href de fonte');
    // o rótulo oficial é `Release oficial <id>` (src/lib/release.mjs). Procurar
    // só "release oficial" acusaria o rótulo de PRÉVIA, que diz "aguardando
    // release oficial/Inspection" — gate que acusa o texto certo é gate que sai
    exige(c, !/Release oficial\s+\S/.test(dom),
      'o fragmento conseguiu carimbar a resposta como Release oficial');
    exige(c, !dom.includes('rel-forjada-2026'),
      'a release forjada no fragmento chegou à tela');
    exige(c, /N[ÃA]O é autenticado/i.test(dom),
      'a página não diz que o conteúdo do link não é autenticado');
    exige(c, dom.includes('Fonte forjada'),
      'a fonte sumiu inteira — o leitor perde a referência que o link alegava ter');
  });

  // ------------------------------------ 6: resposta sem compartilhamento_id
  await comServidor('sem-id', async (chamadas, base) => {
    const dom = await dumpDom(navegador, flags, `${base}/?q=${encodeURIComponent('pergunta sem id')}`);
    const c = 'sem id';

    exige(c, /aria-label="Copiar texto"/.test(dom), 'copiar texto sumiu junto com o link');
    exige(c, /aria-label="Copiar Markdown"/.test(dom), 'copiar Markdown sumiu junto com o link');
    exige(c, /aria-label="Link indisponível"/.test(dom),
      'a página não diz que não há link para esta resposta');
    exige(c, !dom.includes('#r='),
      'sem identificador a página caiu de volta no fragmento legado');
    exige(c, !/\/resposta\//.test(dom),
      'sem identificador a página inventou um endereço de resposta');
    const zap = decodeURIComponent(dom.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/)?.[1] ?? '');
    exige(c, zap.includes('pergunta sem id'),
      'a mensagem do WhatsApp perdeu a pergunta');
  });

  // -------------------------------------------------------------- 4: fallback
  await comServidor('fallback', async (chamadas, base) => {
    const dom = await dumpDom(navegador, flags, `${base}/?q=${encodeURIComponent('pergunta avulsa')}`);
    const c = 'fallback';

    exige(c, chamadas.includes('/api/conversa/stream') && chamadas.includes('/api/conversa')
      && chamadas.includes('/api/pesquisa'),
      `sem /api/conversa a página deveria tentar /api/pesquisa (chamou: ${chamadas.join(', ')})`);
    exige(c, /<h3[^>]*>O que está registrado<\/h3>/.test(dom),
      'a resposta do fallback não foi renderizada');
  });
  // ------------------------------- 7: a página de uma resposta compartilhada
  //
  // `/resposta/<id>` é servida com o app da HOME (a Pages Function devolve o
  // index.html), e a home é a conversa sobre presidente. Quem sabe de que
  // conversa a resposta é são o `escopo` e os `candidatos` do registro
  // público. Sem eles a página mostrava o recorte errado ("candidatos a
  // presidente") e engolia a causa da lacuna: quem recebe o link lia como
  // ausência de propostas o que é ausência de canal declarado ao TSE.
  await comServidor('conversa', async (chamadas, base) => {
    const dom = await dumpDom(navegador, flags, `${base}/resposta/${ID_PUBLICO}`);
    const c = 'compartilhada';

    exige(c, chamadas.includes(`/api/respostas/${ID_PUBLICO}`),
      `a página não foi buscar a resposta guardada (chamou: ${chamadas.join(', ')})`);
    exige(c, dom.includes('o que propõem para a segurança pública?'),
      'a pergunta guardada não aparece na conversa');
    exige(c, /class="cobertura"/.test(dom),
      'o bloco de cobertura não foi montado a partir de candidatos[]');
    // o recorte é conferido DENTRO do bloco: o texto fixo da home ("os 13
    // candidatos a presidente") está na página inteira e não diz nada sobre
    // o que a conversa adotou
    const cobertura = dom.match(/<section class="cobertura">([\s\S]*?)<\/section>/)?.[1] ?? '';
    exige(c, /3 candidatos — Governador de São Paulo/.test(cobertura),
      `a cobertura saiu com o recorte errado — a página não adotou o escopo da resposta: ${cobertura.slice(0, 120)}`);
    exige(c, !/candidatos a presidente/.test(cobertura),
      'a conversa de governador se anunciou como conversa de presidente');
    exige(c, /Não informaram site nem rede social ao TSE: Terceira Candidata/.test(dom),
      'a CAUSA da lacuna não chegou a quem abriu o link');
  });

  // ------------------------- 8: a pergunta que ficou sem resposta é apagável
  //
  // Ela ficava na tela sem explicação (o erro mora no #estado, que a pergunta
  // seguinte apaga) e sem como sair, porque o botão de apagar só nascia junto
  // com a resposta. Três perguntas seguidas sem resposta viravam três blocos
  // mudos e permanentes — foi o que o Thiago viu no celular.
  await comServidor('erro', async (chamadas, base) => {
    const dom = await dumpDom(navegador, flags, `${base}/?q=${encodeURIComponent('pergunta que falha')}`);
    const c = 'sem resposta';

    exige(c, dom.includes('pergunta que falha'), 'a pergunta sumiu da tela');
    exige(c, /class="turno turno-pergunta turno-sem-resposta"/.test(dom),
      'a pergunta sem resposta não foi marcada');
    exige(c, /<p class="sem-resposta">Sem resposta — o serviço não respondeu\.<\/p>/.test(dom),
      'a pergunta sem resposta não diz por quê');
    exige(c, /<button class="apagar-turno"[^>]*>Apagar<\/button>/.test(dom),
      'a pergunta sem resposta ficou sem botão de apagar');
  });

  // e o caminho normal continua com UM botão só, não dois
  await comServidor('conversa', async (chamadas, base) => {
    const dom = await dumpDom(navegador, flags, `${base}/?q=${encodeURIComponent('e sobre previdência?')}`);
    exige('sem resposta', (dom.match(/class="apagar-turno"/g) ?? []).length === 1,
      'a resposta respondida deveria ter exatamente um botão de apagar');
    exige('sem resposta', !dom.includes('Sem resposta —'),
      'a pergunta respondida foi marcada como sem resposta');
  });

} catch (e) {
  console.error(`FALHOU (navegador): ${e.message}`);
  process.exit(1);
}

if (falhas.length) {
  console.error('FALHOU (navegador):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (navegador): ${navegador} renderizou a resposta do bundle publicado, `
  + 'mediu o funil do turno sem deixar prosa passar, '
  + `compartilhou por /resposta/${ID_PUBLICO} sem emitir fragmento novo, recusou `
  + 'javascript:/HTML injetado, reabriu o permalink legado sem rede, recusou permalink '
  + 'forjado (endereço executável e release "oficial"), disse a indisponibilidade do link '
  + 'quando o serviço não devolve identificador, caiu no fallback de /api/pesquisa '
  + 'e abriu /resposta/<id> no escopo da resposta, com a causa da lacuna');

rmSync(PERFIL, { recursive: true, force: true });
