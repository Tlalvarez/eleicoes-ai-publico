#!/usr/bin/env node
/**
 * Gate: o dist que vai a público carrega `_headers` coerente com ele mesmo.
 *
 * Confere três coisas que o emissor sozinho não prova depois de escrito:
 *   1. o arquivo existe e tem o bloco `/*` com CSP e os cabeçalhos fixos;
 *   2. TODO script inline presente no dist está autorizado por hash na CSP —
 *      um script novo embutido depois da emissão quebraria a página inteira
 *      em silêncio (o navegador o bloqueia, e nada avisa no build);
 *   3. o dist não tem o que a CSP recusaria (on*=, javascript:, data: em img).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CABECALHOS_FIXOS, analisaHeaders, inventarioDoDist } from './emite-cabecalhos-dist.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const falhas = [];

const caminho = join(DIST, '_headers');
if (!existsSync(caminho)) {
  console.error('FALHOU (cabeçalhos/dist): dist/_headers não existe — rode `npm run build`.');
  process.exit(1);
}
const regras = analisaHeaders(readFileSync(caminho, 'utf8'))['/*'] ?? {};
const csp = regras['Content-Security-Policy'] ?? '';
if (!csp) falhas.push('sem Content-Security-Policy no bloco /*');
for (const [nome, valor] of Object.entries(CABECALHOS_FIXOS)) {
  if (regras[nome] !== valor) falhas.push(`${nome}: esperado '${valor}', veio '${regras[nome] ?? '(ausente)'}'`);
}
for (const diretiva of [`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`]) {
  if (!csp.includes(diretiva)) falhas.push(`CSP sem '${diretiva}'`);
}
if (/'unsafe-inline'/.test(csp.match(/script-src[^;]*/)?.[0] ?? '') || /'unsafe-eval'/.test(csp)) {
  falhas.push('CSP autoriza script inline ou eval em bloco: o hash por script é o contrato');
}

const { hashes, problemas } = inventarioDoDist(DIST);
for (const [hash, { exemplo, paginas }] of hashes) {
  if (!csp.includes(`'sha256-${hash}'`)) {
    falhas.push(`script inline sem autorização na CSP (${paginas} página(s), ex.: ${exemplo.replace(DIST, 'dist')})`);
  }
}
falhas.push(...problemas.slice(0, 10));

if (falhas.length) {
  console.error('FALHOU (cabeçalhos/dist):');
  for (const f of falhas) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`OK (cabeçalhos/dist): _headers com CSP (${hashes.size} script(s) inline por hash), `
  + `${Object.keys(CABECALHOS_FIXOS).length} cabeçalhos fixos, nada no dist fora da política`);
