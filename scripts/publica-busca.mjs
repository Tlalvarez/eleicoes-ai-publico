#!/usr/bin/env node
/**
 * Copia os índices da busca (data/busca/**) para dist/busca/** e os JSONs de
 * comparação (data/comparacao/**) para dist/comparacao/**, depois do
 * `astro build`. Eles não passam pelo Astro: são dados que o navegador busca
 * sob demanda — o índice ao buscar, e as páginas de outros temas quando a
 * busca cruza temas na matriz.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = join(RAIZ, 'data', 'busca');
const DESTINO = join(RAIZ, 'dist', 'busca');
const ORIGEM_COMP = join(RAIZ, 'data', 'comparacao');
const DESTINO_COMP = join(RAIZ, 'dist', 'comparacao');

if (!existsSync(join(RAIZ, 'dist', 'index.html'))) {
  console.error('FALHOU (busca): dist/index.html não existe — rode `astro build` antes.');
  process.exit(1);
}
if (!existsSync(ORIGEM)) {
  console.log('dist/busca: sem data/busca/ — a busca não é publicada');
  process.exit(0);
}
mkdirSync(DESTINO, { recursive: true });
cpSync(ORIGEM, DESTINO, { recursive: true });
if (existsSync(ORIGEM_COMP)) {
  mkdirSync(DESTINO_COMP, { recursive: true });
  cpSync(ORIGEM_COMP, DESTINO_COMP, { recursive: true });
}
let bytes = 0; let arquivos = 0;
const soma = (dir) => { for (const n of readdirSync(dir)) { const c = join(dir, n); const s = statSync(c); if (s.isDirectory()) soma(c); else { bytes += s.size; arquivos += 1; } } };
soma(DESTINO);
console.log(`dist/busca: ${arquivos} arquivos, ${(bytes / 1e6).toFixed(1)} MB`);
