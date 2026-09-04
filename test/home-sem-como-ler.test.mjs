/**
 * A home não renderiza o quadro "Como ler uma resposta".
 *
 * O quadro era um cartão fixo entre o chat e "Quem está no acervo", explicando
 * evidência, inferência e lacuna antes de existir qualquer resposta na tela. A
 * própria resposta já declara essas três coisas, com o rodapé de estatuto e as
 * fontes citadas; a explicação em duplicata empurrava para baixo a lista de
 * candidatos, que é a única navegação da home sem JavaScript.
 *
 * O que sai é APENAS o bloco da home: o <h2>, o div.cartao com a lista, o
 * parágrafo de rodapé e os estilos que ficam órfãos com eles. A metodologia
 * continua explicando a régua em /metodologia, e o chat, os chips e a faixa de
 * candidatos ficam intactos — este teste cobra os dois lados.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOME = fileURLToPath(new URL('../src/pages/index.astro', import.meta.url));
const fonte = readFileSync(HOME, 'utf8');
// o chat (formulário, compositor, script) mora no componente que a home inclui
const chat = readFileSync(fileURLToPath(new URL('../src/components/Chat.astro', import.meta.url)), 'utf8');

test('a home não traz o título "Como ler uma resposta"', () => {
  assert.ok(!/Como ler uma resposta/.test(fonte),
    'src/pages/index.astro ainda tem o h2 "Como ler uma resposta"');
});

test('a home não traz a lista nem o rodapé do quadro', () => {
  for (const marca of ['como-ler', 'exemplo-marcador', 'rodape-cartao']) {
    assert.ok(!fonte.includes(marca),
      `src/pages/index.astro ainda menciona "${marca}"`);
  }
  assert.ok(!/Conclusão primeiro/.test(fonte),
    'src/pages/index.astro ainda tem os itens da lista do quadro');
  assert.ok(!/não recomenda voto/.test(fonte),
    'src/pages/index.astro ainda tem o rodapé do cartão');
});

test('a home não deixa estilo órfão do quadro', () => {
  for (const seletor of ['.como-ler', '.exemplo-marcador', '.rodape-cartao']) {
    assert.ok(!fonte.includes(`${seletor} `) && !fonte.includes(`${seletor} {`),
      `src/pages/index.astro ainda declara o estilo ${seletor}`);
  }
});

test('o chat e os cards de candidatos continuam na home', () => {
  assert.match(fonte, /<Chat apiBase=\{apiBase\} \/>/, 'a home não inclui o componente do chat');
  assert.match(chat, /id="form-chat"/, 'o formulário do chat sumiu do componente');
  assert.match(fonte, /Candidatos a presidente/, 'a seção de candidatos sumiu da home');
  assert.match(fonte, /grade-candidatos/, 'os cards de candidatos sumiram da home');
});
