#!/usr/bin/env node
/**
 * Nada no site publicado transforma STRING em ESTRUTURA.
 *
 * O chat renderiza Markdown que vem de um serviço e cita fontes de terceiros:
 * é texto que o site não escreveu, com endereços que o site não escolheu. A
 * versão anterior montava isso com `innerHTML` sobre um mini-markdown que
 * escapava `& < > " '` à mão — e o escape cobria o texto, não o endereço, de
 * modo que `[clique](javascript:…)` virava link executável. No formato
 * "Candidatos" quase toda linha carrega link de fonte: o caminho de ataque
 * era o caminho principal do produto.
 *
 * A correção foi arquitetural (src/lib/markdown.mjs materializa nó a nó), e
 * esta checagem é o que impede a volta: ela varre o BUNDLE PUBLICADO, não o
 * código-fonte. Entre um e outro há um empacotador, e "o .astro está limpo"
 * nunca foi prova de que o `dist/` está.
 *
 * Uso: npm run build && npm run test:render-seguro
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

/** Cada padrão vem com o motivo: mensagem de gate sem motivo não é lida. */
const PROIBIDOS = [
  ['innerHTML', 'monta estrutura a partir de string — é o defeito original'],
  ['outerHTML', 'idem, substituindo o próprio nó'],
  ['insertAdjacentHTML', 'idem, inserindo ao lado'],
  ['document.write', 'escreve marcação crua no documento'],
  ['dangerouslySetInnerHTML', 'idem, por outro nome'],
  ['createContextualFragment', 'transforma string em fragmento de DOM'],
  ['set:html', 'diretiva do Astro que injeta HTML sem sanitização'],
];

/** `eval` e `new Function` transformam string em CÓDIGO, o grau seguinte. */
const PROIBIDOS_CODIGO = [
  [/\beval\s*\(/, 'eval() executa string como código'],
  [/\bnew\s+Function\s*\(/, 'new Function() executa string como código'],
];

/**
 * Tira comentários antes de procurar.
 *
 * Este repositório documenta o defeito que corrigiu: o cabeçalho de
 * src/lib/markdown.mjs explica, em português, por que `innerHTML` saiu. Um
 * gate que acusasse essa frase estaria proibindo a EXPLICAÇÃO em vez do
 * código — e gate que acusa o que não é problema é gate que alguém desliga na
 * primeira vez que atrapalha.
 *
 * O corte de `//` exige que ele não venha logo depois de `:`, senão
 * `https://exemplo` seria lido como início de comentário.
 */
function semComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function arquivos(raiz, extensoes) {
  const saida = [];
  const varre = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, e.name);
      if (e.isDirectory()) varre(caminho);
      else if (extensoes.some((x) => e.name.endsWith(x))) saida.push(caminho);
    }
  };
  varre(raiz);
  return saida;
}

const falhas = [];

let conferidos = 0;
for (const raiz of [DIST, SRC]) {
  let lista;
  try {
    statSync(raiz);
    lista = arquivos(raiz, raiz === DIST ? ['.html', '.js', '.mjs'] : ['.astro', '.mjs', '.js']);
  } catch {
    console.error(`FALHOU (render): ${raiz} não existe — rode \`npm run build\` antes.`);
    process.exit(1);
  }
  for (const caminho of lista) {
    conferidos += 1;
    const texto = semComentarios(readFileSync(caminho, 'utf8'));
    const onde = relative(fileURLToPath(new URL('../', import.meta.url)), caminho);
    // este próprio arquivo cita os padrões que proíbe
    if (onde.endsWith('scripts/checa-render-seguro.mjs')) continue;
    for (const [padrao, motivo] of PROIBIDOS) {
      if (texto.includes(padrao)) falhas.push(`${onde}: usa '${padrao}' — ${motivo}`);
    }
    for (const [padrao, motivo] of PROIBIDOS_CODIGO) {
      if (padrao.test(texto)) falhas.push(`${onde}: ${motivo}`);
    }
  }
}

// e o contrário: o renderizador seguro tem de estar mesmo no bundle publicado
const bundles = arquivos(DIST, ['.js', '.html']);
const temRenderizador = bundles.some((c) => /createDocumentFragment|createElement/
  .test(readFileSync(c, 'utf8')));
if (!temRenderizador) {
  falhas.push('nenhum bundle publicado materializa nós de DOM — o renderizador seguro '
    + 'não chegou ao dist/, e a resposta do chat não tem como aparecer');
}

if (falhas.length) {
  console.error('FALHOU (render):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (render): ${conferidos} arquivos de src/ e dist/ sem innerHTML, `
  + 'set:html, document.write, eval ou new Function — a resposta de terceiro só vira '
  + 'DOM por createElement/createTextNode');
