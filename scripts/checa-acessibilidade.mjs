#!/usr/bin/env node
/**
 * O piso de acessibilidade de TODAS as páginas construídas.
 *
 * Não substitui auditoria: é o conjunto de regressões que um redesenho
 * introduz sem ninguém perceber, porque nenhuma delas quebra o build.
 *
 * O que é cobrado no HTML de cada página:
 *   · `lang="pt-BR"` — sem isso o leitor de tela lê português com fonemas de
 *     inglês, e a página inteira fica incompreensível para quem depende dele;
 *   · `<title>` e `meta viewport` — nome na aba e comportamento em celular;
 *   · link de pular para o conteúdo — o site tem uma navegação de seis itens
 *     antes do conteúdo em toda página;
 *   · exatamente um `<h1>` — zero deixa a página sem título na navegação por
 *     cabeçalho; mais de um desfaz a hierarquia;
 *   · `alt` em toda imagem;
 *   · rótulo em todo controle de formulário (`<label for>`, `aria-label` ou
 *     `aria-labelledby`);
 *   · nenhum link sem texto acessível;
 *   · nenhum `tabindex` positivo, que reordena a navegação por teclado de um
 *     jeito que nunca corresponde à leitura visual.
 *
 * E na folha de estilo, três garantias que só existem em CSS:
 *   · `--alvo: 44px` aplicado aos controles — alvo de toque;
 *   · foco visível declarado, e nunca `outline: none` sem substituto;
 *   · contenção de rolagem horizontal.
 *
 * Páginas de redirecionamento (meta refresh, geradas pelo Astro) ficam de
 * fora: elas não têm conteúdo, título de seção nem navegação — exigir
 * estrutura delas seria exigir que deixassem de ser redirecionamento.
 *
 * Uso: npm run build && npm run test:acessibilidade
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const CSS = fileURLToPath(new URL('../src/styles/global.css', import.meta.url));

if (!existsSync(DIST)) {
  console.error('FALHOU (a11y): dist/ não existe — rode `npm run build` antes.');
  process.exit(1);
}

const paginas = [];
const varre = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) varre(caminho);
    else if (e.name.endsWith('.html')) paginas.push(caminho);
  }
};
varre(DIST);

const falhas = [];
const ehRedirecionamento = (html) => /http-equiv=["']refresh["']/i.test(html);

let conferidas = 0;
let pulados = 0;

for (const caminho of paginas) {
  const onde = relative(DIST, caminho);
  const html = readFileSync(caminho, 'utf8');
  if (ehRedirecionamento(html)) { pulados += 1; continue; }
  conferidas += 1;
  const erro = (m) => falhas.push(`${onde}: ${m}`);

  if (!/<html[^>]*\blang=["']pt-BR["']/i.test(html)) erro('sem lang="pt-BR" no <html>');
  if (!/<title>[^<]+<\/title>/i.test(html)) erro('sem <title> com texto');
  if (!/<meta[^>]*name=["']viewport["']/i.test(html)) erro('sem meta viewport');
  if (!/class=["'][^"']*\bskip-link\b/.test(html)) erro('sem link de pular para o conteúdo');

  const h1 = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1 !== 1) erro(`tem ${h1} <h1> (o esperado é exatamente 1)`);

  for (const img of html.match(/<img\b[^>]*>/gi) ?? []) {
    if (!/\balt=/.test(img)) erro(`<img> sem alt: ${img.slice(0, 80)}`);
  }

  // controles: precisam de rótulo por <label for>, aria-label ou aria-labelledby
  for (const controle of html.match(/<(?:input|select|textarea)\b[^>]*>/gi) ?? []) {
    const tipo = controle.match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (['hidden', 'submit', 'button', 'reset'].includes(tipo)) continue;
    if (/\baria-label(?:ledby)?=/.test(controle)) continue;
    const id = controle.match(/\bid=["']([^"']+)["']/)?.[1];
    if (id && new RegExp(`<label[^>]*\\bfor=["']${id}["']`).test(html)) continue;
    // a caixa do menu mobile é um controle de apresentação, com <label> ligado
    // por `for` e escondido de leitor de tela por não ter função semântica
    if (id === 'menu-aberto') continue;
    erro(`controle sem rótulo: ${controle.slice(0, 90)}`);
  }

  for (const link of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const texto = link[2].replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
    if (!texto && !/\baria-label=/.test(link[1])) {
      erro(`link sem texto acessível: <a${link[1].slice(0, 70)}>`);
    }
  }

  const tabindex = [...html.matchAll(/\btabindex=["'](\d+)["']/g)]
    .map((m) => Number(m[1])).filter((v) => v > 0);
  if (tabindex.length) erro(`tabindex positivo (${tabindex.join(', ')}) reordena o teclado`);
}

// ------------------------------------------------------------------- estilo

const css = readFileSync(CSS, 'utf8');
const exigenciasCss = [
  [/--alvo:\s*44px/, 'a folha não declara --alvo: 44px (alvo de toque mínimo)'],
  [/:focus-visible\s*\{[^}]*outline:/, 'a folha não declara foco visível em :focus-visible'],
  [/overflow-x:\s*hidden/, 'a folha não contém a rolagem horizontal do corpo'],
  [/table\s*\{[^}]*overflow-x:\s*auto/, 'tabela larga não rola dentro do próprio bloco'],
];
for (const [regra, mensagem] of exigenciasCss) {
  if (!regra.test(css)) falhas.push(`src/styles/global.css: ${mensagem}`);
}
// `outline: none` sem substituto é o jeito clássico de apagar o foco
for (const trecho of css.match(/outline:\s*(?:none|0)[^;]*;/g) ?? []) {
  falhas.push(`src/styles/global.css: '${trecho.trim()}' apaga o indicador de foco`);
}
// todo controle clicável declara altura de alvo
for (const classe of ['.botao', '.sugestao', '.campo']) {
  const regra = new RegExp(`\\${classe}\\s*\\{[^}]*min-height:\\s*var\\(--alvo\\)`);
  if (!regra.test(css)) {
    falhas.push(`src/styles/global.css: ${classe} não usa min-height: var(--alvo)`);
  }
}

if (falhas.length) {
  console.error('FALHOU (a11y):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (a11y): ${conferidas} páginas com idioma, título, viewport, link de pulo, `
  + 'um <h1>, imagens com alt, controles rotulados e sem tabindex positivo '
  + `(${pulados} redirecionamentos fora do escopo); folha com alvo de 44px, foco visível `
  + 'e rolagem horizontal contida');
