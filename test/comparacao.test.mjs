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
  contagens, contra, layout, modoDaUrl, ordena, quem, rotuloDaSecao, selecaoDaUrl, urlDaSelecao,
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

test('cada proposta aparece no layout, e só mais de uma vez quando os candidatos não são adjacentes', () => {
  const L = layout(PROPOSTAS, ORDEM, 'concordancia');
  const ids = L.linhas.flatMap((l) => (l.tipo === 'cartao' ? [l.id] : l.tipo === 'pilhas' ? l.pilhas.flat().map((c) => c.id) : []));
  assert.deepEqual([...new Set(ids)].sort(), PROPOSTAS.map((x) => x.id).sort());
  const chaves = L.linhas.flatMap((l) => (l.tipo === 'cartao' ? [l.chave] : l.tipo === 'pilhas' ? l.pilhas.flat().map((c) => c.chave) : []));
  assert.equal(new Set(chaves).size, chaves.length, 'nenhuma chave de cartão repetida');
  assert.equal(L.total, PROPOSTAS.length);
  assert.equal(L.n, 5);
});

test('candidatos não adjacentes: um cartão só, lacuna tracejada, texto no primeiro trecho e "Também propõe" nos outros', () => {
  const L = layout(PROPOSTAS, ORDEM, 'concordancia');
  const p3 = L.linhas.filter((l) => l.id === 'p3');   // a e c propõem, b no meio não fala do assunto
  assert.deepEqual(p3.map((c) => [c.chave, c.ini, c.largura, c.colunas, c.lacuna, c.a, c.b]),
    [['p3@0', 0, 3, ['concorda ini fim', 'fora', 'concorda ini fim rep rotulo'], true, 0, 0]]);
  const p5 = L.linhas.filter((l) => l.id === 'p5');   // todos: um cartão só, de ponta a ponta, sem lacuna
  assert.deepEqual(p5.map((c) => [c.ini, c.largura, c.lacuna]), [[0, 5, undefined]]);
  // trecho de dois candidatos depois da lacuna: "Também propõe" uma vez só
  const L2 = layout([p('y', { a: ok(), d: ok(), e: ok() }, 's')], ORDEM, 'concordancia');
  assert.deepEqual(L2.linhas.filter((l) => l.id === 'y')[0].colunas,
    ['concorda ini fim', 'fora', 'fora', 'concorda ini rep rotulo', 'concorda fim rep']);
});

test('quem discorda sem ser adjacente fica no mesmo cartão, ligado pela lacuna; o texto fica sob quem propõe', () => {
  const L = layout(PROPOSTAS, ORDEM, 'concordancia');
  const p6 = L.linhas.filter((l) => l.id === 'p6');   // d propõe, b contra, c no meio
  assert.deepEqual(p6.map((c) => [c.ini, c.largura, c.colunas, c.comContra, c.a, c.b]),
    [[1, 3, ['contra ini fim', 'fora', 'concorda ini fim'], true, 2, 2]]);
  // adjacentes: um cartão só, texto sobre quem propõe
  const L2 = layout([p('x', { b: ok(), c: nao() }, 's')], ORDEM, 'concordancia');
  const x = L2.linhas.filter((l) => l.id === 'x');
  assert.deepEqual(x.map((c) => [c.ini, c.largura, c.colunas, c.a, c.b, c.comContra]), [[1, 2, ['concorda', 'contra'], 0, 0, true]]);
});

test('exclusivas: um cabeçalho por subtema; sem contrário vão para a pilha da coluna, com contrário viram faixa', () => {
  const L = layout(PROPOSTAS, ORDEM, 'concordancia');
  const i = L.linhas.findIndex((l) => l.tipo === 'secao' && l.rotulo === rotuloDaSecao(1));
  const depois = L.linhas.slice(i + 1);
  // subtemas em ordem alfabética, cada um com a sua linha de pilhas (só onde há cartão)
  assert.deepEqual(depois.filter((l) => l.tipo === 'subtema').map((l) => l.rotulo), ['b, d contra', 'd, b contra', 'só a', 'só c']);
  const pilhas = depois.filter((l) => l.tipo === 'pilhas').map((l) => l.pilhas.map((x) => x.map((c) => c.id)));
  assert.deepEqual(pilhas, [[['p1'], [], [], [], []], [[], [], ['p2'], [], []]]);
  const faixas = depois.filter((l) => l.tipo === 'cartao').map((l) => l.id);
  assert.deepEqual(faixas, ['p4', 'p6'], 'não adjacentes: um cartão só, ligado pela lacuna');
});

test('as seções são pelo número de candidatos que propõem, do que todos propõem ao que só um propõe', () => {
  const L = layout(PROPOSTAS, ORDEM, 'concordancia');
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
  const L = layout(PROPOSTAS, ['a', 'c'], 'concordancia');
  assert.equal(L.n, 2);
  const ids = L.linhas.flatMap((l) => (l.tipo === 'cartao' ? [l.id] : l.tipo === 'pilhas' ? l.pilhas.flat().map((c) => c.id) : []));
  assert.deepEqual(ids.sort(), ['p1', 'p2', 'p3', 'p5'], 'p4 e p6 somem: ninguém da tela as propõe');
  const p5 = L.linhas.find((l) => l.id === 'p5');
  assert.equal(p5.largura, 2, 'todos os cinco vira "os dois": a e c, agora adjacentes');
  assert.deepEqual(p5.colunas, ['concorda', 'concorda']);
  const secoes = L.linhas.filter((l) => l.tipo === 'secao').map((l) => l.rotulo);
  assert.deepEqual(secoes, [rotuloDaSecao(2), rotuloDaSecao(1)]);
});

test('quem discorda fora da tela não entra na faixa', () => {
  const L = layout(PROPOSTAS, ['b', 'c'], 'concordancia');
  const p4 = L.linhas.find((l) => l.id === 'p4')
    ?? L.linhas.filter((l) => l.tipo === 'pilhas').flatMap((l) => l.pilhas.flat()).find((c) => c.id === 'p4');
  assert.equal(p4.largura, 1);
  assert.equal(p4.comContra, false, 'd discorda, mas d não está na tela');
});

test('com um candidato só, não há seção — subtemas e a pilha dele', () => {
  const L = layout(PROPOSTAS, ['a'], 'concordancia');
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

test('modo assunto: cada subtema é uma seção com faixas e pilhas lado a lado', () => {
  const L = layout(PROPOSTAS, ORDEM, 'assunto');
  const secoes = L.linhas.filter((l) => l.tipo === 'secao').map((l) => l.rotulo);
  assert.deepEqual(secoes, ['a e c', 'b, d contra', 'd, b contra', 'só a', 'só c', 'todos'], 'subtemas em ordem alfabética');
  assert.equal(L.total, PROPOSTAS.length);
  // "b, d contra": exclusiva com contrário vira faixa, não pilha
  const i = L.linhas.findIndex((l) => l.tipo === 'secao' && l.rotulo === 'b, d contra');
  assert.equal(L.linhas[i + 1].tipo, 'cartao');
  assert.equal(L.linhas[i + 1].id, 'p4');
  assert.ok(L.linhas[i + 1].lacuna && L.linhas[i + 2].id !== 'p4', 'b propõe e d discorda, c no meio: um cartão com lacuna');
  // "só a": pilha na coluna de a
  const j = L.linhas.findIndex((l) => l.tipo === 'secao' && l.rotulo === 'só a');
  assert.deepEqual(L.linhas[j + 1].pilhas.map((x) => x.map((c) => c.id)), [['p1'], [], [], [], []]);
  // nenhum cabeçalho de subtema separado: o subtema É a seção
  assert.ok(!L.linhas.some((l) => l.tipo === 'subtema'));
});

test('modo assunto: um assunto com faixa e exclusivas mostra as duas coisas juntas', () => {
  const misto = [
    p('m1', { a: ok(), b: ok(), c: ok() }, 'blocos'),
    p('m2', { a: ok() }, 'blocos'),
    p('m3', { d: ok() }, 'blocos'),
  ];
  const L = layout(misto, ORDEM, 'assunto');
  assert.deepEqual(L.linhas.map((l) => l.tipo), ['secao', 'cartao', 'pilhas']);
  assert.equal(L.linhas[1].id, 'm1');
  assert.deepEqual(L.linhas[2].pilhas.map((x) => x.map((c) => c.id)), [['m2'], [], [], ['m3'], []]);
});

test('o modo vem da URL só se for conhecido', () => {
  assert.equal(modoDaUrl('assunto'), 'assunto');
  assert.equal(modoDaUrl('concordancia'), 'concordancia');
  assert.equal(modoDaUrl('xpto'), 'concordancia');
  assert.equal(modoDaUrl(null), 'concordancia');
});

test('sem modo, a página é por assunto', () => {
  assert.deepEqual(layout(PROPOSTAS, ORDEM).linhas.filter((l) => l.tipo === 'secao').map((l) => l.rotulo),
    layout(PROPOSTAS, ORDEM, 'assunto').linhas.filter((l) => l.tipo === 'secao').map((l) => l.rotulo));
});

test('proposta própria derivada (correção de fidelidade) vem logo abaixo da faixa de onde saiu, fora da pilha', () => {
  const pai = p('comum', { a: ok(), b: ok() }, 'blocos');
  const derivada = { ...p('propria-c', { c: ok() }, 'blocos'), derivada_de: 'comum' };
  const outra = p('outra', { d: ok(), e: ok() }, 'blocos');
  const solta = p('solta', { c: ok() }, 'blocos');
  const L = layout([outra, solta, derivada, pai], ORDEM, 'assunto');
  const seq = L.linhas.flatMap((l) => (l.tipo === 'cartao' ? [l.id] : l.tipo === 'pilhas' ? l.pilhas.flat().map((c) => `pilha:${c.id}`) : []));
  const i = seq.indexOf('comum');
  assert.equal(seq[i + 1], 'propria-c', `a derivada vem logo depois da faixa: ${seq}`);
  assert.ok(!seq.includes('pilha:propria-c'), 'a derivada não vai para a pilha');
  assert.ok(seq.includes('pilha:solta'), 'exclusiva comum continua na pilha');
  // sem o pai na tela, a derivada volta ao lugar normal
  const L2 = layout([derivada, solta], ORDEM, 'assunto');
  const seq2 = L2.linhas.flatMap((l) => (l.tipo === 'pilhas' ? l.pilhas.flat().map((c) => c.id) : []));
  assert.ok(seq2.includes('propria-c'));
});

test('cartão de origem com um candidato só também traz as derivadas logo abaixo', () => {
  const pai = p('pai', { a: ok() }, 'blocos');
  const f1 = { ...p('f1', { b: ok() }, 'blocos'), derivada_de: 'pai' };
  const f2 = { ...p('f2', { d: ok(), e: ok() }, 'blocos'), derivada_de: 'pai' };
  const solta = p('solta', { c: ok() }, 'blocos');
  const L = layout([solta, f2, f1, pai], ORDEM, 'assunto');
  const seq = L.linhas.flatMap((l) => (l.tipo === 'cartao' ? [l.id] : l.tipo === 'pilhas' ? l.pilhas.flat().map((c) => `pilha:${c.id}`) : []));
  const i = seq.indexOf('pai');
  assert.ok(i >= 0, `o pai vira faixa: ${seq}`);
  assert.deepEqual(seq.slice(i + 1, i + 3).sort(), ['f1', 'f2'], `derivadas logo abaixo: ${seq}`);
  assert.ok(!seq.includes('pilha:pai') && !seq.includes('pilha:f1'));
  assert.ok(seq.includes('pilha:solta'));
});


test('meta do candidato vira tarja na coluna dele, dentro do cartão', () => {
  const comMeta = {
    id: 'm1', subtema: 's', proposta: 'Ampliar e fortalecer o seguro rural.',
    posicoes: {
      a: { posicao: 'concorda', blocos: [1], nota: '', metas: [{ rotulo: 'produção agropecuária', valor: 'dobrar em 8 a 10 anos' }] },
      c: { posicao: 'concorda', blocos: [2], nota: '' },
    },
  };
  const L = layout([comMeta], ORDEM, 'concordancia');
  const cartao = L.linhas.find((l) => l.tipo === 'cartao');
  assert.deepEqual(cartao.metas, [{ col: 0, itens: [{ rotulo: 'produção agropecuária', valor: 'dobrar em 8 a 10 anos' }] }]);
  assert.equal(cartao.largura, 3, 'a tarja não muda a largura do cartão');
});

test('cartão sem meta não ganha o campo', () => {
  const L = layout(PROPOSTAS, ORDEM, 'concordancia');
  assert.ok(L.linhas.filter((l) => l.tipo === 'cartao').every((c) => c.metas === undefined));
});

// o cartão nasce de duas formas: faixa (linha própria) e pilha (proposta de um
// candidato só, empilhada na coluna dele). O selo vale nas duas.
const cartoesDoLayout = (L) => L.linhas.flatMap(
  (l) => (l.tipo === 'cartao' ? [l] : l.tipo === 'pilhas' ? l.pilhas.flat() : []));

test('selo de contestação: só a proposta que uma campanha contestou o recebe, e o cartão não ganha texto livre', () => {
  // §3.6 da revisão jurídica (16/09): o pedido de campanha registrado em correcoes.json
  // acende um selo no cartão, ligado à entrada do registro. Pedido recusado também
  // aparece, porque a recusa é pública.
  const L = layout([{ ...PROPOSTAS[4], contestacoes: ['2026-09-16-1'] }, PROPOSTAS[2], PROPOSTAS[0]], ORDEM);
  const cartoes = cartoesDoLayout(L);
  assert.deepEqual(cartoes.filter((c) => c.contestada).map((c) => [c.id, c.contestada]),
    [['p5', ['2026-09-16-1']]]);
  for (const id of ['p3', 'p1']) {
    assert.equal(cartoes.find((c) => c.id === id).contestada, undefined, `${id} não tem pedido: sem selo`);
  }
  // o selo não carrega texto do candidato: só os ids do registro
  assert.ok(cartoes.find((c) => c.contestada).contestada.every((x) => typeof x === 'string'));
});

test('lista de contestações vazia não acende selo, e a proposta de um candidato só também pode ser contestada', () => {
  const vazia = cartoesDoLayout(layout([{ ...PROPOSTAS[4], contestacoes: [] }], ORDEM));
  assert.equal(vazia[0].contestada, undefined);
  const naPilha = cartoesDoLayout(layout([{ ...PROPOSTAS[0], contestacoes: ['2026-09-16-9'] }], ORDEM));
  assert.deepEqual(naPilha.map((c) => c.contestada), [['2026-09-16-9']], 'na pilha o selo também acende');
});

test('C4: posição contrária de quem está na seleção não some quando quem propõe sai', () => {
  // p4: b propõe, d propõe o contrário
  const ids = (sel) => layout(PROPOSTAS, sel, 'assunto').linhas.flatMap((l) => (l.tipo === 'cartao' ? [l.id] : l.tipo === 'pilhas' ? l.pilhas.flat().map((c) => c.id) : []));
  assert.ok(ids(['b', 'd']).includes('p4'), 'os dois na tela');
  assert.ok(ids(['d']).includes('p4'), 'só quem é contra: o cartão fica');
  assert.ok(ids(['a', 'd']).includes('p4'), 'quem é contra e um terceiro: o cartão fica');
  assert.ok(!ids(['a', 'c']).includes('p4'), 'ninguém da seleção se posiciona: o cartão sai');
  const soD = layout(PROPOSTAS, ['d'], 'assunto');
  const c = soD.linhas.find((l) => l.id === 'p4');
  assert.deepEqual([c.colunas, c.nConcorda, c.comContra], [['contra'], 0, true]);
  // a contagem é de propostas FEITAS por alguém da seleção: d faz p5 e p6; p4 é só posição contrária
  assert.equal(soD.total, 2);
});
