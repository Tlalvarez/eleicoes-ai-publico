import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');

test('home usa a chamada sobre candidatos solicitada', () => {
  assert.match(home, /<h1>Pergunte à IA sobre os candidatos<\/h1>/);
  assert.doesNotMatch(home, /Pergunte\. Confira as fontes\./);
  assert.match(home, /id="form-chat"/);
});
