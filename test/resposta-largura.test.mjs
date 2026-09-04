import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// a resposta é desenhada pelo componente do chat, que a home inclui
const home = await readFile(new URL('../src/components/Chat.astro', import.meta.url), 'utf8');

test('texto da resposta ocupa toda a largura útil do cartão', () => {
  assert.match(home, /\.resposta-corpo\s*\{[^}]*max-width:\s*none;/s);
  assert.doesNotMatch(home, /\.resposta-corpo\s*\{[^}]*max-width:\s*40em;/s);
  assert.match(home, /const corpo = el\('div', 'resposta-corpo'\)/);
});
