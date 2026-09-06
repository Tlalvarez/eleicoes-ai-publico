import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
// o chat (formulário, compositor, exemplo do campo) mora no componente que a home inclui
const chat = await readFile(new URL('../src/components/Chat.astro', import.meta.url), 'utf8');
const textoHome = home.replace(/\s+/g, ' ');

test('home usa a chamada sobre candidatos solicitada', () => {
  // a home é a porta de entrada E a seção de Presidente: o título tem de dizer
  // o escopo, senão promete todos os cargos e a pergunta sobre Senado cai num
  // vazio (a busca só olha o escopo da página). Pedido do Thiago em 06/09/2026.
  assert.match(home, /<h1>Pergunte à IA sobre os candidatos a presidente<\/h1>/);
  assert.match(home, /<p class="sobretitulo">Eleições gerais de 2026 · Presidente<\/p>/);
  assert.match(home, /Esta página responde sobre os \{cards\.length\} candidatos a presidente/);
  assert.match(home, /<a href="\/governador">governador<\/a>/);
  assert.match(home, /<a href="\/senador">senador<\/a>/);
  assert.doesNotMatch(home, /Pergunte\. Confira as fontes\./);
  // cópia aprovada pelo Thiago em 05/09/2026: as três origens do acervo (TSE, contas
  // próprias, vídeos em que falam), link de cada item, sem prazo ("cinco anos" não era
  // verdade) e sem "apenas materiais oficiais" (há entrevistas em canais de terceiros)
  assert.match(textoHome, /<strong>registraram na Justiça Eleitoral<\/strong>, <strong>publicaram nas próprias contas<\/strong> e <strong>disseram em vídeos<\/strong> de entrevistas, debates e discursos, com o link de cada item\./);
  assert.match(textoHome, /para você conferir antes de votar\./);
  assert.doesNotMatch(textoHome, /últimos cinco anos|apenas <strong>materiais oficiais/);
  assert.doesNotMatch(home, /Converse em português com as evidências reunidas sobre os candidatos\./);
  // a caixa da home segue a forma das páginas por cargo: pergunta concreta,
  // um tema, nenhum candidato citado (pedido do Thiago em 06/09/2026)
  assert.match(chat, /placeholder = 'Ex\.: o que os candidatos a presidente propõem para a segurança pública\?'/);
  assert.doesNotMatch(chat, /candidato A|tema X/);
  assert.match(home, /<Chat apiBase=\{apiBase\} \/>/);
  assert.doesNotMatch(chat, /Ex\.: o que o candidato A já fala sobre sobre educação/);
  assert.match(home, /\.hero-home \.lead \{ max-width: none; \}/);
  assert.match(chat, /#nova \{ display: none; \}/);
  assert.match(chat, /id="nova" hidden/);
  assert.match(chat, /id="form-chat"/);
});
