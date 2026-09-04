import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const le = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const home = le('../src/pages/index.astro');
const chat = le('../src/components/Chat.astro');   // o chat mora no componente que a home inclui
const acervo = le('../src/pages/acervo/index.astro');

test('home e acervo não renderizam quadros EstadoRelease', () => {
  for (const [nome, fonte] of [['home', home], ['acervo', acervo]]) {
    assert.ok(!/<EstadoRelease[\s/>]/.test(fonte), `${nome} ainda renderiza EstadoRelease`);
    assert.ok(!/import\s+EstadoRelease\s+from/.test(fonte), `${nome} ainda importa EstadoRelease`);
  }
});

test('a remoção preserva as superfícies principais', () => {
  assert.match(home, /<Chat apiBase=\{apiBase\} \/>/);
  assert.match(chat, /id="form-chat"/);
  assert.match(acervo, /<h1>Acervo<\/h1>/);
  assert.match(acervo, /id="f-busca"/);
});
