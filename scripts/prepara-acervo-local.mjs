#!/usr/bin/env node
/**
 * Prepara um acervo LOCAL para desenvolvimento nesta worktree.
 *
 * `data/acervo/` é derivado e está sob .gitignore: ele é publicado pelo
 * harness, não versionado. Numa worktree recém-criada ele simplesmente não
 * existe, e sem ele nada compila — nem `/acervo`, nem o gate de catálogo.
 *
 * Este script NÃO gera conteúdo de acervo. Ele faz duas coisas:
 *
 *   1. aponta (por symlink) os diretórios de candidato de uma exportação real
 *      já existente em disco — o conteúdo bruto fica intocado, e nada é
 *      copiado nem reescrito;
 *
 *   2. escreve `data/acervo/indice.json` = o índice daquela exportação MAIS
 *      uma entrada VAZIA (`tipos: {}`) para cada candidato do catálogo
 *      canônico que a exportação não cobre.
 *
 * O passo 2 não é maquiagem: `data/itens/resumo.json` já lista candidato com
 * zero item, e o site depende disso (ver src/data/candidatos.json, nota
 * `_onda_1` — "candidato que some por não ter material transforma buraco de
 * cobertura em aparência de completude"). O índice do acervo omitindo esses
 * candidatos é que estava fora do invariante. Entrada vazia aparece no site
 * como LACUNA declarada, com o nome do candidato e "sem registros no acervo".
 *
 * O resultado é uma PRÉVIA INTERNA. Ele não vira release oficial: o site só
 * chama os dados de oficiais quando existe `data/current.json` com
 * `release_status: "oficial"` e `release_id` (ver src/lib/release.mjs), e este
 * script não escreve esse arquivo.
 *
 * Uso:
 *   node scripts/prepara-acervo-local.mjs [--origem <dir-do-acervo-exportado>]
 *   ACERVO_ORIGEM=/caminho/data/acervo node scripts/prepara-acervo-local.mjs
 */
import {
  existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leCatalogoCanonico } from '../src/lib/catalogo.mjs';
import { leJson } from '../src/lib/dados.mjs';

const PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argOrigem = (() => {
  const i = process.argv.indexOf('--origem');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

const CANDIDATOS_DEFAULT = [
  process.env.ACERVO_ORIGEM,
  join(PROJETO, '..', '..', 'repos', 'eleicoes-ai-publico', 'data', 'acervo'),
  join(PROJETO, '..', '..', 'eleicoes-ai-publico', 'data', 'acervo'),
];

const origem = resolve(argOrigem
  ?? CANDIDATOS_DEFAULT.find((c) => c && existsSync(join(c, 'indice.json')))
  ?? '');

if (!origem || !existsSync(join(origem, 'indice.json'))) {
  console.error('FALHOU (acervo local): nenhuma exportação de acervo encontrada.\n'
    + '  Passe --origem <dir> ou defina ACERVO_ORIGEM apontando para um\n'
    + '  diretório que contenha indice.json (saída de exporta_acervo.py).');
  process.exit(1);
}

const destino = join(PROJETO, 'data', 'acervo');
const indiceOrigem = leJson(join(origem, 'indice.json'));
const canonico = leCatalogoCanonico(PROJETO);

mkdirSync(destino, { recursive: true });

// symlinks: um por candidato COBERTO pela exportação. O conteúdo bruto não é
// copiado nem tocado.
const ligados = [];
for (const slug of Object.keys(indiceOrigem.candidatos ?? {})) {
  const alvo = join(origem, slug);
  if (!existsSync(alvo)) continue;
  const link = join(destino, slug);
  if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false })) {
    rmSync(link, { recursive: true, force: true });
  }
  symlinkSync(alvo, link, 'dir');
  ligados.push(slug);
}

// índice: o da exportação + lacuna declarada para quem o catálogo exige e a
// exportação não cobre
const candidatos = {};
const lacunas = [];
for (const [slug, nome] of Object.entries(canonico)) {
  const doExport = indiceOrigem.candidatos?.[slug];
  if (doExport) {
    candidatos[slug] = doExport;
  } else {
    candidatos[slug] = { nome, tipos: {} };
    lacunas.push(slug);
  }
}
for (const slug of Object.keys(indiceOrigem.candidatos ?? {})) {
  if (!(slug in candidatos)) {
    console.error(`FALHOU (acervo local): a exportação traz '${slug}', que não `
      + 'está no catálogo canônico — isso é divergência de catálogo, não lacuna '
      + 'de coleta, e não pode ser resolvida aqui.');
    process.exit(1);
  }
}

writeFileSync(join(destino, 'indice.json'), JSON.stringify({
  ...indiceOrigem,
  origem_local: {
    _: 'PRÉVIA INTERNA — índice montado por scripts/prepara-acervo-local.mjs',
    exportacao: origem,
    gerado_em_origem: indiceOrigem.gerado_em ?? null,
    sem_coleta: lacunas,
  },
  candidatos,
}, null, 1) + '\n');

console.log(`OK (acervo local): PRÉVIA INTERNA montada em data/acervo`);
console.log(`  exportação de origem: ${origem}`);
console.log(`  ${ligados.length} candidatos com coleta (symlink, conteúdo intocado): ${ligados.join(', ')}`);
console.log(`  ${lacunas.length} candidatos SEM coleta, declarados como lacuna: ${lacunas.join(', ') || '—'}`);
console.log('  isto NÃO é release oficial: não há data/current.json com release_status.');
