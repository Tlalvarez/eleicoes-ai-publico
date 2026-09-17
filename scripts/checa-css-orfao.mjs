#!/usr/bin/env node
/**
 * Gate: nenhum bloco de CSS sem seletor.
 *
 * Em 16/09/2026 um commit meu apagou o seletor de uma regra e as duas linhas
 * seguintes de declarações ficaram para trás, soltas entre outras regras:
 *
 *     .comparacao .contagem { flex-basis: 100%; }
 *
 *       font: inherit; font-size: .9rem; font-weight: 600; ...
 *       border-radius: 999px; cursor: pointer; }
 *
 * O Astro 5 descartava isso em silêncio — nada quebrava, nada avisava, e o
 * defeito viajou para produção. Só apareceu semanas depois, ao experimentar o
 * Astro 7, cujo minificador recusa o arquivo inteiro com "Invalid token in
 * pseudo element". Um erro de sintaxe que o navegador engole é pior que um que
 * ele cospe: ninguém o vê, e ele bloqueia a próxima atualização.
 *
 * O que se confere: varrendo cada <style> de .astro e cada .css de src/, nenhuma
 * declaração pode aparecer fora de um bloco. Comentários são neutralizados (sem
 * perder a contagem de linhas) para que texto dentro deles não seja confundido
 * com código.
 *
 * Uso: npm run test:css-orfao
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const falhas = [];

/** Todos os .astro e .css sob src/. */
function arquivos(dir, achados = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.(astro|css)$/.test(caminho)) achados.push(caminho);
  }
  return achados;
}

/** Os blocos de estilo de um arquivo, com a linha em que cada um começa. */
function blocosDeEstilo(caminho) {
  const texto = readFileSync(caminho, 'utf8');
  if (caminho.endsWith('.css')) return [{ css: texto, deslocamento: 0 }];
  const blocos = [];
  // `<style>`, `<style is:global>`, `<style is:inline>`: qualquer atributo serve
  for (const m of texto.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    blocos.push({ css: m[1], deslocamento: texto.slice(0, m.index).split('\n').length });
  }
  return blocos;
}

/**
 * Linhas com declaração fora de qualquer bloco. A conta é de profundidade de
 * chaves: na profundidade zero só podem existir seletor, arroba-regra, comentário
 * ou espaço — nunca `propriedade: valor;`.
 */
function declaracoesSoltas(css) {
  const semComentario = css.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length));
  const soltas = [];
  let profundidade = 0;
  semComentario.split('\n').forEach((linha, i) => {
    const declaracao = /^\s*[a-zA-Z-]+\s*:\s*[^;{]+;/.test(linha) && !linha.includes('{');
    if (profundidade === 0 && declaracao) soltas.push({ linha: i + 1, texto: linha.trim() });
    profundidade = Math.max(0, profundidade + (linha.split('{').length - 1) - (linha.split('}').length - 1));
  });
  return soltas;
}

let blocosConferidos = 0;
for (const caminho of arquivos(join(RAIZ, 'src'))) {
  for (const { css, deslocamento } of blocosDeEstilo(caminho)) {
    blocosConferidos += 1;
    for (const { linha, texto } of declaracoesSoltas(css)) {
      falhas.push(`${relative(RAIZ, caminho)}:${deslocamento + linha}: declaração fora de qualquer bloco — `
        + `o seletor sumiu e o navegador descarta isto em silêncio: ${texto.slice(0, 90)}`);
    }
  }
}

if (falhas.length) {
  console.error('FALHOU (css órfão):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (css órfão): ${blocosConferidos} bloco(s) de estilo sem declaração solta`);
