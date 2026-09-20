/** Portão: o que não tem `<head>` sai do índice por cabeçalho (ver FORA_DO_INDICE). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { analisaHeaders, FORA_DO_INDICE } from '../scripts/emite-cabecalhos-dist.mjs';

const DIST = new URL('../dist/', import.meta.url);

test('os arquivos sem <head> saem do índice pelo _headers', () => {
  const arq = new URL('_headers', DIST);
  assert.ok(existsSync(arq), 'dist/_headers não existe — rode npm run build');
  const regras = analisaHeaders(readFileSync(arq, 'utf8'));
  for (const [caminho, valor] of FORA_DO_INDICE) {
    // o .md de /ia/dados e o /llms.txt não têm onde declarar noindex: sem esta regra, o buscador
    // escolhe entre o HTML (que sai do índice) e o markdown equivalente, que ficaria aberto
    assert.equal(regras[caminho]?.['X-Robots-Tag'], valor, `${caminho} sem X-Robots-Tag: ${valor}`);
  }
});
