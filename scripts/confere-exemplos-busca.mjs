#!/usr/bin/env node
/**
 * Os exemplos da caixa de busca de um escopo têm de dar resultado.
 *
 * O exemplo que aparece no campo ("Ex.: Rodoanel, BRT, Tietê") é um convite:
 * se a pessoa digita e não acha nada, o site mentiu. Este script roda a MESMA
 * busca do navegador (src/lib/busca.mjs), só lexical — o piso garantido sem o
 * vetor da consulta — e conta as propostas relevantes de cada consulta.
 *
 *   node scripts/confere-exemplos-busca.mjs <escopo> '["a","b"]'
 *     → imprime JSON [{ q, relevantes }] (usado por v3/exemplos_busca.py)
 *   node scripts/confere-exemplos-busca.mjs --todos
 *     → confere cada data/busca/<escopo>/exemplos.json; falha se algum exemplo
 *       tiver menos de MIN_RELEVANTES propostas relevantes
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { busca, preparaBusca } from '../src/lib/busca.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MIN_RELEVANTES = 1;

export function relevantesPorConsulta(escopo, consultas) {
  const pasta = join(RAIZ, 'data', 'busca', escopo);
  const dados = JSON.parse(readFileSync(join(pasta, 'documentos.json'), 'utf8'));
  const indice = JSON.parse(readFileSync(join(pasta, 'indice.json'), 'utf8'));
  const estado = preparaBusca(dados, readFileSync(join(pasta, 'vetores-propostas.bin')), readFileSync(join(pasta, 'vetores-blocos.bin')), indice.dimensoes);
  return consultas.map((q) => ({
    q,
    relevantes: busca(estado, q, null, { maxPropostas: 200, maxTrechos: 0 }).propostas.filter((p) => p.relevante).length,
  }));
}

export function escoposComIndice() {
  const saida = [];
  const varre = (pasta, id) => {
    if (existsSync(join(pasta, 'indice.json'))) { saida.push(id); return; }
    if (!existsSync(pasta)) return;
    for (const e of readdirSync(pasta, { withFileTypes: true })) if (e.isDirectory()) varre(join(pasta, e.name), `${id}/${e.name}`);
  };
  for (const cargo of ['presidente', 'governador']) varre(join(RAIZ, 'data', 'busca', cargo), cargo);
  return saida;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--todos') {
    const falhas = [];
    for (const escopo of escoposComIndice()) {
      const arq = join(RAIZ, 'data', 'busca', escopo, 'exemplos.json');
      if (!existsSync(arq)) { falhas.push(`${escopo}: sem exemplos.json (rode v3/exemplos_busca.py)`); continue; }
      const { exemplos } = JSON.parse(readFileSync(arq, 'utf8'));
      if (!Array.isArray(exemplos) || exemplos.length < 3) { falhas.push(`${escopo}: menos de 3 exemplos`); continue; }
      for (const r of relevantesPorConsulta(escopo, exemplos)) {
        if (r.relevantes < MIN_RELEVANTES) falhas.push(`${escopo}: "${r.q}" traz ${r.relevantes} proposta(s) relevante(s)`);
      }
    }
    if (falhas.length) { console.error('FALHOU (exemplos da busca):\n  ' + falhas.join('\n  ')); process.exit(1); }
    console.log('OK (exemplos da busca): todo exemplo de todo escopo traz resultado');
  } else {
    const [escopo, json] = process.argv.slice(2);
    console.log(JSON.stringify(relevantesPorConsulta(escopo, JSON.parse(json))));
  }
}
