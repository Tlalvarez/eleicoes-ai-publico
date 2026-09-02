#!/usr/bin/env node
/**
 * Emite `dist/release.json` — a declaração de proveniência do artefato.
 *
 * O deploy confere esta declaração contra o ponteiro ANTES do upload: dist
 * velho, de outra release, é o caso realista que ela existe para pegar. Sem
 * ponteiro publicado (build de desenvolvimento no caminho legado) não se
 * declara nada — e o deploy oficial recusa dist sem declaração.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nome = process.env.ELEICOES_SITE_PONTEIRO || 'current.json';
const caminho = join(RAIZ, 'data', nome);
if (!existsSync(caminho)) process.exit(0);
const p = JSON.parse(readFileSync(caminho, 'utf8'));
if (!p?.release_id || !p?.manifest_hash) process.exit(0);
writeFileSync(join(RAIZ, 'dist', 'release.json'), JSON.stringify({
  schema: 'site-release/1',
  release_id: p.release_id,
  manifest_hash: p.manifest_hash,
  release_status: p.release_status ?? null,
  ponteiro: p.schema ?? 'legado',
}, null, 1) + '\n');
console.log(`dist/release.json: ${p.release_id}`);
