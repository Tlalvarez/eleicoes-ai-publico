import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'node:url';

const le = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const home = le('../src/pages/index.astro');
const chat = le('../src/components/Chat.astro');   // o chat mora no componente que a home inclui

test('a home não renderiza quadros EstadoRelease (o componente saiu com o acervo em 05/09/2026)', () => {
  const { existsSync } = require('node:fs');
  assert.ok(!existsSync(new URL('../src/components/EstadoRelease.astro', import.meta.url)));
  for (const [nome, fonte] of [['home', home]]) {
    assert.ok(!/<EstadoRelease[\s/>]/.test(fonte), `${nome} ainda renderiza EstadoRelease`);
    assert.ok(!/import\s+EstadoRelease\s+from/.test(fonte), `${nome} ainda importa EstadoRelease`);
  }
});

test('a remoção preserva as superfícies principais', () => {
  assert.match(home, /<Chat apiBase=\{apiBase\} \/>/);
  assert.match(chat, /id="form-chat"/);
});
