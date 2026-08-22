#!/usr/bin/env node
/**
 * Checagem de CATÁLOGO: tudo que declara candidatos declara os MESMOS.
 *
 * A autoridade é `src/data/candidatos.json` — versionado, editado à mão. Os
 * derivados são conferidos contra ele:
 *
 *   · data/itens/resumo.json        (hub, arquivo, menções)
 *   · data/acervo/indice.json       (acervo navegável)
 *   · data/current.json → catalogo  (o catálogo declarado pela geração ativa)
 *   · a tabela `candidatos` do índice de pesquisa da geração, quando o
 *     ambiente sabe abrir SQLite
 *
 * A versão anterior comparava só os dois derivados entre si, e a lista
 * esperada era OPCIONAL, vinda de `CATALOGO_ESPERADO`. O gate obrigatório não
 * definia essa variável — então ele comparava dois produtos da mesma
 * exportação. Se ela perdesse um candidato, os dois estariam igualmente
 * errados e o gate anunciaria "OK: 12 candidatos". Um gate cuja autoridade é
 * opcional não é gate; aqui não há variável de ambiente que desligue nada, e
 * a ausência do arquivo canônico é FALHA.
 *
 * O catálogo do índice de pesquisa entra "quando disponível" no sentido
 * estrito: o manifesto SEMPRE traz o catálogo declarado da geração (e o
 * harness só publica uma geração cujo SQLite bate com ele — ver
 * harness/lib/geracao.py); a leitura direta do SQLite é a conferência extra,
 * feita quando o runtime tem `node:sqlite`. O que não entrou é DITO na saída,
 * nunca omitido.
 *
 * Uso: npm run test:catalogo [raiz-do-projeto]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  catalogoDoIndice, catalogoDoManifesto, catalogoDoResumo, comparaCatalogos,
  leCatalogoCanonico,
} from '../src/lib/catalogo.mjs';
import { leManifesto, raizDados } from '../src/lib/dados.mjs';

const RAIZ = resolve(process.argv[2]
  || join(dirname(fileURLToPath(import.meta.url)), '..'));

const le = (caminho) => JSON.parse(readFileSync(caminho, 'utf8'));

/** {slug: nome} da tabela autoritativa do índice — ou null com o motivo. */
async function catalogoDoSqlite(db) {
  if (!existsSync(db)) return [null, `${db} não existe`];
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    return [null, 'este runtime não abre SQLite (node:sqlite indisponível)'];
  }
  const con = new DatabaseSync(db, { readOnly: true });
  try {
    const linhas = con.prepare('SELECT slug, nome_publico FROM candidatos').all();
    return [Object.fromEntries(linhas.map((r) => [r.slug, r.nome_publico])), null];
  } catch (e) {
    return [null, `tabela 'candidatos' ilegível (${e.message})`];
  } finally {
    con.close();
  }
}

let fontes;
try {
  fontes = {
    'src/data/candidatos.json (canônico)': leCatalogoCanonico(RAIZ),
    'data/itens/resumo.json': catalogoDoResumo(
      le(join(raizDados('itens', 'resumo.json', RAIZ), 'resumo.json'))),
    'data/acervo/indice.json': catalogoDoIndice(
      le(join(raizDados('acervo', 'indice.json', RAIZ), 'indice.json'))),
  };
} catch (e) {
  console.error(`FALHOU (catálogo): ${e.message}`);
  process.exit(1);
}

const notas = [];
const manifesto = leManifesto(RAIZ);
if (manifesto) {
  fontes['data/current.json (catálogo da geração)'] = catalogoDoManifesto(manifesto);
  const [doSqlite, motivo] = await catalogoDoSqlite(
    join(RAIZ, 'data', manifesto.pesquisa ?? ''));
  if (doSqlite) {
    fontes['índice de pesquisa (tabela candidatos)'] = doSqlite;
  } else {
    notas.push(`índice de pesquisa NÃO conferido diretamente: ${motivo} `
      + '(o catálogo da geração, que o harness valida contra o SQLite antes de '
      + 'publicar, foi conferido)');
  }
} else {
  notas.push('sem data/current.json: os dados ainda vêm dos diretórios legados, '
    + 'e não há catálogo de geração nem índice de pesquisa a conferir');
}

const falhas = comparaCatalogos(fontes);

if (falhas.length) {
  console.error('FALHOU (catálogo):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
const quantos = Object.keys(fontes['src/data/candidatos.json (canônico)']).length;
console.log(`OK (catálogo): ${quantos} candidatos, mesmos slugs e nomes em `
  + `${Object.keys(fontes).length} fontes — ${Object.keys(fontes).join(' · ')}`);
for (const nota of notas) console.log(`  nota: ${nota}`);
