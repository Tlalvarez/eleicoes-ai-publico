/**
 * O contrato visual da V2 — a identidade eleitoral, cobrada por teste.
 *
 * Redesenho é a mudança que mais silenciosamente desfaz garantias: a paleta
 * some num `git revert` parcial, o título volta a pedir uma fonte externa,
 * o rodapé perde o aviso de independência e ninguém percebe porque nada
 * quebra o build. O que está aqui não é gosto — é o conjunto de promessas
 * que a identidade tem de manter:
 *
 *   · a paleta é UMA, declarada em tokens, e não muda de página para página;
 *   · nenhuma cor é atribuída a candidato — os chips da home são um por
 *     candidato, então variar cor entre chips seria variar cor por candidato;
 *   · o laranja é acento decorativo: não vira texto nem fundo do botão
 *     principal, porque não alcança contraste de leitura;
 *   · a tipografia é local: nenhuma requisição de fonte externa sai do site;
 *   · a faixa é geometria própria, reta, com as quatro cores — não é a
 *     bandeira, não é logomarca, não é ativo da Justiça Eleitoral;
 *   · o rodapé diz, com todas as letras, que o site é independente do TSE.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const le = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const css = le('../src/styles/global.css');
const base = le('../src/layouts/Base.astro');
const home = le('../src/pages/index.astro');

const arquivos = {
  'src/styles/global.css': css,
  'src/layouts/Base.astro': base,
  'src/pages/index.astro': home,
};

/** O primeiro bloco `:root { … }` da folha — o do tema claro. */
function raizClara(folha) {
  const i = folha.indexOf(':root');
  assert.ok(i >= 0, 'a folha não declara :root');
  const abre = folha.indexOf('{', i);
  const fecha = folha.indexOf('}', abre);
  return folha.slice(abre + 1, fecha);
}

/** O corpo da primeira regra cujo seletor casa exatamente com `seletor`. */
function regra(folha, seletor) {
  const re = new RegExp(`(^|[\\n};])\\s*${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm');
  const m = folha.match(re);
  return m ? m[2] : null;
}

// ------------------------------------------------------------------ paleta

const TOKENS = {
  '--azul': '#17365d',
  '--azul-claro': '#2d6fb7',
  '--amarelo': '#f2c94c',
  '--verde': '#2e7d32',
  '--laranja': '#e66b3d',
  '--papel': '#f7f4ea',
  '--cartao': '#ffffff',
};

test('a paleta da identidade eleitoral está declarada no :root', () => {
  const raiz = raizClara(css);
  for (const [token, valor] of Object.entries(TOKENS)) {
    const m = raiz.match(new RegExp(`${token}:\\s*([^;]+);`));
    assert.ok(m, `:root não declara ${token}`);
    assert.equal(m[1].trim().toLowerCase(), valor, `${token} deveria ser ${valor}`);
  }
});

test('os apelidos herdados continuam existindo — páginas antigas não ficam sem estilo', () => {
  const raiz = raizClara(css);
  for (const alias of ['--acento', '--acento-forte', '--acento-contraste', '--realce', '--atencao']) {
    assert.match(raiz, new RegExp(`${alias}:`), `:root deixou de declarar ${alias}`);
  }
});

test('a identidade mantém o fundo claro mesmo no sistema em modo escuro', () => {
  const raiz = raizClara(css);
  assert.match(raiz, /color-scheme:\s*light\s*;/,
    'a V2 deve declarar somente o esquema claro');
  assert.ok(!/@media\s*\(prefers-color-scheme:\s*dark\)/.test(css),
    'o modo escuro do sistema não pode substituir o papel marfim por fundo escuro');
});

test('a terracota da identidade antiga não sobrou em lugar nenhum', () => {
  for (const [nome, texto] of Object.entries(arquivos)) {
    for (const antigo of ['#c96442', '#a8492b', '#f7ecd9', '#f5f4ed', '#ddd9c9']) {
      assert.ok(!texto.toLowerCase().includes(antigo),
        `${nome} ainda usa a cor antiga ${antigo}`);
    }
  }
});

// ------------------------------------------------------ laranja é decorativo

test('o laranja nunca é cor de texto', () => {
  for (const [nome, texto] of Object.entries(arquivos)) {
    const usos = texto.match(/(?<!-)color:\s*var\(--laranja\)/g) ?? [];
    assert.equal(usos.length, 0, `${nome} usa --laranja como cor de texto`);
  }
});

test('o laranja nunca é o fundo do botão principal', () => {
  const botao = regra(css, '.botao');
  assert.ok(botao, 'a folha não tem mais a regra .botao');
  assert.ok(!/background:[^;]*--laranja/.test(botao),
    '.botao usa --laranja como fundo — o laranja não alcança contraste para texto');
  assert.match(botao, /background:\s*var\(--(azul|acento-forte)\)/,
    '.botao deveria ser azul-marinho');
});

// -------------------------------------------------------------- tipografia

test('títulos e corpo usam a pilha sans-serif local', () => {
  const raiz = raizClara(css);
  const m = raiz.match(/--fonte-titulo:\s*([^;]+);/);
  assert.ok(m, ':root não declara --fonte-titulo');
  const pilha = m[1].toLowerCase();
  assert.ok(pilha.includes('sans-serif'), `--fonte-titulo não termina em sans-serif: ${m[1]}`);
  assert.ok(!/serif\s*$/.test(pilha.replace(/sans-serif/g, '')),
    `--fonte-titulo ainda cai numa serifada: ${m[1]}`);
  for (const serifada of ['georgia', 'iowan', 'palatino', 'times']) {
    assert.ok(!pilha.includes(serifada), `--fonte-titulo ainda cita ${serifada}`);
  }
});

test('nenhuma fonte externa é requisitada', () => {
  for (const [nome, texto] of Object.entries(arquivos)) {
    assert.ok(!/@import/.test(texto), `${nome} usa @import — requisição externa`);
    assert.ok(!/fonts\.(googleapis|gstatic|bunny)/i.test(texto),
      `${nome} pede fonte de servidor externo`);
    assert.ok(!/@font-face/.test(texto), `${nome} declara @font-face — fonte baixada`);
    assert.ok(!/src=\s*url\(/i.test(texto), `${nome} baixa arquivo de fonte`);
  }
});

// ------------------------------------------------------------------- faixa

test('a faixa geométrica é reta e traz as quatro cores', () => {
  const faixa = regra(css, 'header.site::before');
  assert.ok(faixa, 'a folha não declara a faixa em header.site::before');
  assert.match(faixa, /content:/, 'a faixa não tem content — o pseudoelemento não aparece');
  assert.match(faixa, /linear-gradient/, 'a faixa não é uma faixa reta de cores');
  for (const cor of ['--amarelo', '--verde', '--azul-claro', '--laranja']) {
    assert.match(faixa, new RegExp(`var\\(${cor}\\)`), `a faixa não usa ${cor}`);
  }
  // transição dura: cada parada aparece duas vezes (fim de uma, início da outra)
  assert.ok(!/\d+deg[^)]*circle|radial-gradient/.test(faixa),
    'a faixa virou gradiente suave/radial — a geometria é reta');
});

test('o cabeçalho é azul-marinho, com marca textual em branco e amarelo', () => {
  const cabecalho = regra(css, 'header.site');
  assert.ok(cabecalho, 'a folha não tem mais a regra header.site');
  assert.match(cabecalho, /background:\s*var\(--azul\)/, 'o cabeçalho não é azul-marinho');
  const marcaSpan = regra(css, '.brand span');
  assert.ok(marcaSpan && /color:\s*var\(--amarelo\)/.test(marcaSpan),
    '.brand span (o “.ai”) não é amarelo');
  const ativo = regra(css, "nav.main a[aria-current='page']");
  assert.ok(ativo && /--amarelo/.test(ativo), 'o item ativo da navegação não é amarelo');
});

// ------------------------------------------------- neutralidade entre chips

test('nenhuma cor é atribuída a um chip específico — cada chip é um candidato', () => {
  const suspeitas = [...css.matchAll(/[^{}]*\.sugest[^{}]*\{[^}]*\}/g)]
    .map((m) => m[0])
    .filter((bloco) => /nth-child|nth-of-type|:first-child|:last-child/.test(bloco));
  assert.deepEqual(suspeitas, [],
    'há regra que colore chips por posição — na home cada chip é um candidato');
});

// ------------------------------------------------------------ independência

test('o rodapé declara a independência da Justiça Eleitoral', () => {
  assert.match(base, /iniciativa independente/i,
    'o layout não diz que o site é uma iniciativa independente');
  assert.match(base, /sem vínculo, patrocínio ou endosso da Justiça Eleitoral/i,
    'o layout não recusa vínculo, patrocínio ou endosso da Justiça Eleitoral');
});

/** O que de fato é publicado: comentário de código não vai para a página. */
const semComentarios = (texto) => texto
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

test('nenhum ativo, logomarca ou slogan da Justiça Eleitoral entra no site', () => {
  const proibidos = [
    /votonademocracia/i,
    /logomarca|logotipo/i,
    /\blogo\.(svg|png|jpe?g|webp)/i,
    /brasão|brasao/i,
    /tse\.jus\.br/i,
    /justiça eleitoral['"\s]*(logo|marca)/i,
    /\bestrela\b/i,
    /tribunal superior eleitoral/i,
  ];
  for (const [nome, texto] of Object.entries(arquivos)) {
    for (const re of proibidos) {
      assert.ok(!re.test(semComentarios(texto)), `${nome} traz ${re} — ativo/marca de fora`);
    }
  }
});

test('a marca continua sendo só texto — nenhuma imagem no cabeçalho', () => {
  const cabecalho = base.slice(base.indexOf('<header'), base.indexOf('</header>'));
  assert.ok(!/<img|<svg|background-image/i.test(cabecalho),
    'o cabeçalho ganhou imagem — a marca é textual');
});
