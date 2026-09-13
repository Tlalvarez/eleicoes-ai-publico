/**
 * O layout da comparação — a MESMA função no build e no navegador.
 *
 * O que se prova: cada proposta aparece uma vez; a faixa vai da primeira à
 * última coluna de quem se posiciona; o texto nunca começa sob quem discorda;
 * as seções são pelo número de candidatos que propõem; e filtrar candidatos
 * recalcula tudo isso só com quem está na tela.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contagens, contra, layout, ordena, quem, rotuloDaSecao, selecaoDaUrl, urlDaSelecao,
} from '../src/lib/comparacao.mjs';

const ORDEM = ['a', 'b', 'c', 'd', 'e'];
const p = (id, posicoes, subtema = 'x') => ({ id, subtema, proposta: `proposta ${id}`, posicoes, n_concorda: 0 });
const ok = (blocos = [1]) => ({ posicao: 'concorda', blocos, nota: '' });
const nao = (blocos = [2]) => ({ posicao: 'discorda', blocos, nota: '' });

const PROPOSTAS = [
  p('p1', { a: ok() }, 'só a'),
  p('p2', { c: ok() }, 'só c'),
  p('p3', { a: ok(), c: ok() }, 'a e c'),
  p('p4', { b: ok(), d: nao() }, 'b, d contra'),
  p('p5', { a: ok(), b: ok(), c: ok(), d: ok(), e: ok() }, 'todos'),
  p('p6', { d: ok(), b: nao() }, 'd, b contra'),
];

test('quem e contra seguem a ordem das colunas', () => {
  assert.deepEqual(quem(PROPOSTAS[4], ORDEM), ORDEM);
  assert.deepEqual(quem(PROPOSTAS[2], ['c', 'a']), ['c', 'a']);
  assert.deepEqual(contra(PROPOSTAS[3], ORDEM), ['d']);
});

test('cada proposta aparece exatamente uma vez no layout', () => {
  const L = layout(PROPOSTAS, ORDEM);
  const ids = L.linhas.flatMap((l) => (l.tipo === 'cartao' ? [l.id] : l.tipo === 'pilhas' ? l.pilhas.flat().map((c) => c.id) : []));
  assert.deepEqual(ids.slice().sort(), PROPOSTAS.map((x) => x.id).sort());
  assert.equal(L.total, PROPOSTAS.length);
  assert.equal(L.n, 5);
});

test('a faixa cobre da primeira à última coluna de quem se posiciona, com o meio marcado', () => {
  const L = layout(PROPOSTAS, ORDEM);
  const p3 = L.linhas.find((l) => l.id === 'p3');
  assert.equal(p3.ini, 0);
  assert.equal(p3.largura, 3);
  assert.deepEqual(p3.colunas, ['concorda', 'fora', 'concorda']);
  assert.equal(p3.comContra, false);
});

test('quem discorda entra na faixa em vermelho, e o texto fica só sobre quem propõe', () => {
  const L = layout(PROPOSTAS, ORDEM);
  const p6 = L.linhas.find((l) => l.id === 'p6');       // d propõe, b contra: faixa b..d
  assert.equal(p6.ini, 1);
  assert.equal(p6.largura, 3);
  assert.deepEqual(p6.colunas, ['contra', 'fora', 'concorda']);
  assert.equal(p6.a, 2, 'o texto começa sob d, nunca sob b');
  assert.equal(p6.b, 2);
  assert.equal(p6.comContra, true);
});

test('exclusivas: um cabeçalho por subtema; sem contrário vão para a pilha da coluna, com contrário viram faixa', () => {
  const L = layout(PROPOSTAS, ORDEM);
  const i = L.linhas.findIndex((l) => l.tipo === 'secao' && l.rotulo === rotuloDaSecao(1));
  const depois = L.linhas.slice(i + 1);
  // subtemas em ordem alfabética, cada um com a sua linha de pilhas (só onde há cartão)
  assert.deepEqual(depois.filter((l) => l.tipo === 'subtema').map((l) => l.rotulo), ['b, d contra', 'd, b contra', 'só a', 'só c']);
  const pilhas = depois.filter((l) => l.tipo === 'pilhas').map((l) => l.pilhas.map((x) => x.map((c) => c.id)));
  assert.deepEqual(pilhas, [[['p1'], [], [], [], []], [[], [], ['p2'], [], []]]);
  const faixas = depois.filter((l) => l.tipo === 'cartao').map((l) => l.id);
  assert.deepEqual(faixas, ['p4', 'p6']);
});

test('as seções são pelo número de candidatos que propõem, do que todos propõem ao que só um propõe', () => {
  const L = layout(PROPOSTAS, ORDEM);
  const secoes = L.linhas.filter((l) => l.tipo === 'secao').map((l) => l.rotulo);
  assert.deepEqual(secoes, [rotuloDaSecao(5), rotuloDaSecao(2), rotuloDaSecao(1)]);
  assert.equal(L.linhas.at(-1).tipo, 'pilhas', 'as exclusivas sem contrário fecham a página');
  // dentro de uma seção, um cabeçalho de subtema antes dos cartões
  const i5 = L.linhas.findIndex((l) => l.tipo === 'secao');
  assert.equal(L.linhas[i5 + 1].tipo, 'subtema');
  assert.equal(L.linhas[i5 + 1].rotulo, 'todos');
  assert.equal(rotuloDaSecao(3), 'Três candidatos propõem');
  assert.equal(rotuloDaSecao(7), '7 candidatos propõem');
});

test('filtrar candidatos recalcula só com quem está na tela', () => {
  const L = layout(PROPOSTAS, ['a', 'c']);
  assert.equal(L.n, 2);
  const ids = L.linhas.flatMap((l) => (l.tipo === 'cartao' ? [l.id] : l.tipo === 'pilhas' ? l.pilhas.flat().map((c) => c.id) : []));
  assert.deepEqual(ids.sort(), ['p1', 'p2', 'p3', 'p5'], 'p4 e p6 somem: ninguém da tela as propõe');
  const p5 = L.linhas.find((l) => l.id === 'p5');
  assert.equal(p5.largura, 2, 'todos os cinco vira "os dois": faixa de a a c');
  assert.deepEqual(p5.colunas, ['concorda', 'concorda']);
  const secoes = L.linhas.filter((l) => l.tipo === 'secao').map((l) => l.rotulo);
  assert.deepEqual(secoes, [rotuloDaSecao(2), rotuloDaSecao(1)]);
});

test('quem discorda fora da tela não entra na faixa', () => {
  const L = layout(PROPOSTAS, ['b', 'c']);
  const p4 = L.linhas.find((l) => l.id === 'p4')
    ?? L.linhas.filter((l) => l.tipo === 'pilhas').flatMap((l) => l.pilhas.flat()).find((c) => c.id === 'p4');
  assert.equal(p4.largura, 1);
  assert.equal(p4.comContra, false, 'd discorda, mas d não está na tela');
});

test('com um candidato só, não há seção — subtemas e a pilha dele', () => {
  const L = layout(PROPOSTAS, ['a']);
  assert.deepEqual(L.linhas.map((l) => l.tipo), ['subtema', 'pilhas', 'subtema', 'pilhas', 'subtema', 'pilhas']);
  assert.deepEqual(L.linhas.filter((l) => l.tipo === 'pilhas').map((l) => l.pilhas[0][0].id), ['p3', 'p1', 'p5'], 'por subtema');
});

test('a ordem é: mais candidatos primeiro, depois o subtema, depois a combinação de colunas', () => {
  const ids = ordena(PROPOSTAS, ORDEM).map((x) => x.id);
  assert.deepEqual(ids, ['p5', 'p3', 'p4', 'p6', 'p1', 'p2']);
});

test('a seleção da URL ignora slug desconhecido e trata vazio ou completo como "todos"', () => {
  assert.equal(selecaoDaUrl('', ORDEM), null);
  assert.equal(selecaoDaUrl('x,y', ORDEM), null);
  assert.deepEqual(selecaoDaUrl('c,a,x', ORDEM), ['a', 'c'], 'na ordem das colunas, não da URL');
  assert.equal(selecaoDaUrl('a,b,c,d,e', ORDEM), null);
  assert.equal(urlDaSelecao(ORDEM, ORDEM), null);
  assert.equal(urlDaSelecao(['a', 'c'], ORDEM), 'a,c');
});

test('as contagens por candidato: propõe, exclusivas, contraria', () => {
  const n = contagens(PROPOSTAS, ORDEM);
  assert.deepEqual(n.a, { propoe: 3, exclusivas: 1, contraria: 0 });
  assert.deepEqual(n.b, { propoe: 2, exclusivas: 1, contraria: 1 });
  assert.deepEqual(n.d, { propoe: 2, exclusivas: 1, contraria: 1 });
});
