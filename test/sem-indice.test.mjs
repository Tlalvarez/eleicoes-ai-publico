/** Portão: o que não tem `<head>` sai do índice por cabeçalho (ver FORA_DO_INDICE). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisaHeaders, textoHeaders, FORA_DO_INDICE } from '../scripts/emite-cabecalhos-dist.mjs';

test('o _headers emitido tira do índice quem não tem <head>', () => {
  // o .md de /ia/dados e o /llms.txt não têm onde declarar noindex: sem esta regra, tirar o gêmeo HTML
  // do índice só troca qual das duas cópias o buscador escolhe (parecer de SEO, 20/09/2026)
  const regras = analisaHeaders(textoHeaders("default-src 'self'"));
  for (const [caminho, valor] of FORA_DO_INDICE) {
    assert.equal(regras[caminho]?.['X-Robots-Tag'], valor, `${caminho} sem X-Robots-Tag: ${valor}`);
  }
  assert.ok(regras['/*']?.['Content-Security-Policy'], 'a regra geral continua de pé');
});
