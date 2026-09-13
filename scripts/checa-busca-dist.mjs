#!/usr/bin/env node
/**
 * Gate do dist: a busca está publicada inteira e coerente.
 *
 *   · dist/busca/<escopo>/{indice,documentos}.json e os dois .bin existem, e
 *     os tamanhos dos .bin batem com o que indice.json declara (vetor faltando
 *     é busca que quebra em silêncio no navegador);
 *   · dist/busca.html existe, com o formulário e o índice de escopos;
 *   · a home e o hub de presidente trazem a caixa de busca (action="/busca");
 *   · a Function /api/vetor está no lugar (functions/api/vetor.js).
 *
 * Uso: npm run build && npm run test:busca-dist
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const falhas = [];

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('FALHOU (busca): dist/ não existe — rode `npm run build` antes.');
  process.exit(1);
}
const escopos = [];
const varre = (pasta, id) => {
  if (existsSync(join(pasta, 'indice.json'))) { escopos.push({ id, pasta }); return; }
  if (!existsSync(pasta)) return;
  for (const e of readdirSync(pasta, { withFileTypes: true })) if (e.isDirectory()) varre(join(pasta, e.name), `${id}/${e.name}`);
};
for (const cargo of ['presidente', 'governador']) varre(join(DIST, 'busca', cargo), cargo);
if (!escopos.length) falhas.push('dist/busca/ sem nenhum escopo com indice.json');
for (const { id, pasta } of escopos) {
  const indice = JSON.parse(readFileSync(join(pasta, 'indice.json'), 'utf8'));
  if (indice.contrato !== 'busca/1') falhas.push(`${id}: contrato '${indice.contrato}'`);
  for (const [nome, esperado] of Object.entries(indice.bytes ?? {})) {
    const caminho = join(pasta, nome);
    if (!existsSync(caminho)) { falhas.push(`${id}: falta ${nome}`); continue; }
    const tamanho = statSync(caminho).size;
    if (tamanho !== esperado) falhas.push(`${id}: ${nome} tem ${tamanho} bytes, indice.json declara ${esperado}`);
  }
  const docs = JSON.parse(readFileSync(join(pasta, 'documentos.json'), 'utf8'));
  if (docs.propostas.length !== indice.propostas || docs.blocos.length !== indice.blocos) {
    falhas.push(`${id}: documentos.json tem ${docs.propostas.length}/${docs.blocos.length}, indice.json declara ${indice.propostas}/${indice.blocos}`);
  }
}
const pagina = join(DIST, 'busca.html');
if (!existsSync(pagina)) falhas.push('dist/busca.html não foi construída');
else {
  const html = readFileSync(pagina, 'utf8');
  if (!/<form[^>]*action="\/busca"/.test(html)) falhas.push('busca.html: sem o formulário de busca');
  if (!/__busca/.test(html)) falhas.push('busca.html: sem a configuração de escopos');
  // a configuração viaja por define:vars, com as aspas escapadas dentro de uma string JS
  for (const { id } of escopos) {
    if (!html.includes(`"id":"${id}"`) && !html.includes(`\\"id\\":\\"${id}\\"`)) falhas.push(`busca.html: não conhece o escopo ${id}`);
  }
}
for (const rel of ['index.html', 'presidente.html']) {
  const html = readFileSync(join(DIST, rel), 'utf8');
  if (!/<form[^>]*class="busca-caixa[^"]*"[^>]*action="\/busca"/.test(html)) falhas.push(`${rel}: sem a caixa de busca`);
}
if (!existsSync(join(RAIZ, 'functions', 'api', 'vetor.js'))) falhas.push('functions/api/vetor.js não existe — a busca ficaria só lexical');

if (falhas.length) {
  console.error('FALHOU (busca):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (busca): ${escopos.length} escopo(s) publicado(s) (${escopos.map((e) => e.id).join(', ')}) com índice e vetores coerentes; `
  + 'busca.html, caixa na home e no hub, Function /api/vetor no lugar');
