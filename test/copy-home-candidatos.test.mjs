import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
// o chat (formulário, compositor, exemplo do campo) mora no componente que a home inclui
const chat = await readFile(new URL('../src/components/Chat.astro', import.meta.url), 'utf8');
const textoHome = home.replace(/\s+/g, ' ');

test('home usa a chamada sobre candidatos solicitada', () => {
  assert.match(home, /<h1>Pergunte à IA sobre os candidatos<\/h1>/);
  assert.doesNotMatch(home, /Pergunte\. Confira as fontes\./);
  assert.match(home, /apenas <strong>materiais oficiais<\/strong> e <strong>citações diretas<\/strong> dos candidatos/);
  assert.match(textoHome, /reduzindo o risco de desinformação e ajudando você a fazer uma escolha mais consciente na hora de votar\./);
  assert.doesNotMatch(home, /Converse em português com as evidências reunidas sobre os candidatos\./);
  assert.match(chat, /placeholder = 'Ex\.: o que o candidato A fala sobre educação em seu plano de governo\? Compare quem tratou do tema X\.'/);
  assert.match(home, /<Chat apiBase=\{apiBase\} \/>/);
  assert.doesNotMatch(chat, /Ex\.: o que o candidato A já fala sobre sobre educação/);
  assert.match(home, /\.hero-home \.lead \{ max-width: none; \}/);
  assert.match(chat, /#nova \{ display: none; \}/);
  assert.match(chat, /id="nova" hidden/);
  assert.match(chat, /id="form-chat"/);
});
