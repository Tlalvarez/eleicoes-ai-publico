/**
 * Os exemplos da caixa de busca (data/busca/<escopo>/exemplos.json) existem
 * para todo escopo publicado e cada um traz resultado na busca lexical.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIN_RELEVANTES, escoposComIndice, relevantesPorConsulta } from '../scripts/confere-exemplos-busca.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

test('todo escopo com índice tem exemplos, e todo exemplo traz resultado', () => {
  const escopos = escoposComIndice();
  assert.ok(escopos.includes('presidente'));
  for (const escopo of escopos) {
    const arq = `${RAIZ}/data/busca/${escopo}/exemplos.json`;
    assert.ok(existsSync(arq), `${escopo}: sem exemplos.json — rode v3/exemplos_busca.py`);
    const { exemplos } = JSON.parse(readFileSync(arq, 'utf8'));
    assert.ok(exemplos.length >= 3, `${escopo}: ${exemplos.length} exemplos`);
    for (const r of relevantesPorConsulta(escopo, exemplos)) {
      assert.ok(r.relevantes >= MIN_RELEVANTES, `${escopo}: "${r.q}" traz ${r.relevantes}`);
    }
  }
});

test('os exemplos de governador não repetem os de presidente', () => {
  const pres = new Set(JSON.parse(readFileSync(`${RAIZ}/data/busca/presidente/exemplos.json`, 'utf8')).exemplos);
  for (const escopo of escoposComIndice().filter((e) => e.startsWith('governador/'))) {
    const { exemplos } = JSON.parse(readFileSync(`${RAIZ}/data/busca/${escopo}/exemplos.json`, 'utf8'));
    assert.ok(!exemplos.every((e) => pres.has(e)), `${escopo}: exemplos iguais aos de presidente`);
  }
});
