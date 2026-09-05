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
  // cópia aprovada pelo Thiago em 05/09/2026: as três origens do acervo (TSE, contas
  // próprias, vídeos em que falam), link de cada item, sem prazo ("cinco anos" não era
  // verdade) e sem "apenas materiais oficiais" (há entrevistas em canais de terceiros)
  assert.match(textoHome, /<strong>registraram na Justiça Eleitoral<\/strong>, <strong>publicaram nas próprias contas<\/strong> e <strong>disseram em vídeos<\/strong> de entrevistas, debates e discursos, com o link de cada item\./);
  assert.match(textoHome, /para você conferir antes de votar\./);
  assert.doesNotMatch(textoHome, /últimos cinco anos|apenas <strong>materiais oficiais/);
  assert.doesNotMatch(home, /Converse em português com as evidências reunidas sobre os candidatos\./);
  assert.match(chat, /placeholder = 'Ex\.: o que o candidato A fala sobre educação em seu plano de governo\? Compare quem tratou do tema X\.'/);
  assert.match(home, /<Chat apiBase=\{apiBase\} \/>/);
  assert.doesNotMatch(chat, /Ex\.: o que o candidato A já fala sobre sobre educação/);
  assert.match(home, /\.hero-home \.lead \{ max-width: none; \}/);
  assert.match(chat, /#nova \{ display: none; \}/);
  assert.match(chat, /id="nova" hidden/);
  assert.match(chat, /id="form-chat"/);
});
