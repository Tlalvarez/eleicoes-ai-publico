#!/usr/bin/env node
/**
 * Copia os índices da busca (data/busca/**) para dist/busca/** e os JSONs de
 * comparação (data/comparacao/**) para dist/comparacao/**, depois do
 * `astro build`. Eles não passam pelo Astro: são dados que o navegador busca
 * sob demanda — o índice ao buscar, e as páginas de outros temas quando a
 * busca cruza temas na matriz.
 *
 * Desde o resultado do primeiro turno (05/10/2026), a cópia não é mais literal: cada
 * página de comparação sai como `comparacao()` a entrega (com o resultado do TSE
 * aplicado), e a busca de cada escopo sai recortada nos mesmos candidatos, com os
 * vetores na mesma ordem dos documentos. O que o navegador baixa é o que a tela mostra.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparacao, paginasProntas } from '../src/lib/comparacao-dados.mjs';
import { recortaBusca } from '../src/lib/resultado.mjs';

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

// os escopos com busca: presidente e governador/<uf>
const escopos = [];
const varre = (pasta, rel) => {
  if (existsSync(join(pasta, 'indice.json'))) { escopos.push(rel); return; }
  for (const e of readdirSync(pasta, { withFileTypes: true })) if (e.isDirectory()) varre(join(pasta, e.name), `${rel}/${e.name}`);
};
for (const cargo of readdirSync(ORIGEM)) if (statSync(join(ORIGEM, cargo)).isDirectory()) varre(join(ORIGEM, cargo), cargo);

let recortados = 0;
for (const rel of escopos) {
  const [cargo, uf = null] = rel.split('/');
  const prontas = paginasProntas(cargo, uf);
  if (!prontas.length) continue;
  // as páginas de comparação, como a tela as mostra
  for (const id of prontas) {
    writeFileSync(join(DESTINO_COMP, rel, `${id}.json`), JSON.stringify(comparacao(cargo, uf, id)));
  }
  // a busca, nos mesmos candidatos
  const ficam = comparacao(cargo, uf, prontas[0]).candidatos.map((c) => c.slug);
  const pasta = join(DESTINO, rel);
  const documentos = JSON.parse(readFileSync(join(pasta, 'documentos.json'), 'utf8'));
  if (documentos.candidatos.every((c) => ficam.includes(c.slug))) continue;
  const indice = JSON.parse(readFileSync(join(pasta, 'indice.json'), 'utf8'));
  const r = recortaBusca(documentos, readFileSync(join(pasta, 'vetores-propostas.bin')), readFileSync(join(pasta, 'vetores-blocos.bin')), indice.dimensoes, ficam);
  const corpo = `${JSON.stringify(r.documentos)}\n`;
  writeFileSync(join(pasta, 'documentos.json'), corpo);
  writeFileSync(join(pasta, 'vetores-propostas.bin'), r.vp);
  writeFileSync(join(pasta, 'vetores-blocos.bin'), r.vb);
  writeFileSync(join(pasta, 'indice.json'), `${JSON.stringify({
    ...indice,
    propostas: r.documentos.propostas.length,
    blocos: r.documentos.blocos.length,
    com_sinonimos: r.documentos.propostas.filter((p) => (p.sinonimos ?? []).length).length,
    documentos_sha256: createHash('sha256').update(corpo).digest('hex'),
    bytes: { 'documentos.json': Buffer.byteLength(corpo), 'vetores-propostas.bin': r.vp.length, 'vetores-blocos.bin': r.vb.length },
    recorte: { candidatos: ficam, motivo: 'resultado do TSE (src/lib/resultado.mjs)' },
  }, null, 1)}\n`);
  recortados += 1;
}

let bytes = 0; let arquivos = 0;
const soma = (dir) => { for (const n of readdirSync(dir)) { const c = join(dir, n); const s = statSync(c); if (s.isDirectory()) soma(c); else { bytes += s.size; arquivos += 1; } } };
soma(DESTINO);
console.log(`dist/busca: ${arquivos} arquivos, ${(bytes / 1e6).toFixed(1)} MB; ${recortados} escopo(s) recortado(s) pelo resultado do TSE`);
