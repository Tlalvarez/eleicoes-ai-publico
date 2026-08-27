import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const textoHome = home.replace(/\s+/g, ' ');

test('home usa a chamada sobre candidatos solicitada', () => {
  assert.match(home, /<h1>Pergunte à IA sobre os candidatos<\/h1>/);
  assert.doesNotMatch(home, /Pergunte\. Confira as fontes\./);
  assert.match(textoHome, /Reunimos neste site apenas materiais oficiais e citações diretas dos candidatos/);
  assert.match(textoHome, /reduzindo o risco de desinformação e ajudando você a fazer uma escolha mais consciente na hora de votar\./);
  assert.doesNotMatch(home, /Converse em português com as evidências reunidas sobre os candidatos\./);
  assert.match(home, /id="form-chat"/);
});
