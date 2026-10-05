/**
 * O resultado oficial do TSE aplicado à comparação (src/lib/resultado.mjs), decidido pelo
 * Thiago em 05/10/2026: onde há segundo turno, só os dois candidatos que o disputam; onde o
 * governador foi eleito no primeiro turno, todos continuam e o eleito leva a marca.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONTRATO_RESULTADO, aplicaResultado, emLista, normalizaSituacao, recortaBusca, resultadoDoEscopo, turnos,
} from '../src/lib/resultado.mjs';
import {
  PASTA_RESULTADO, comparacao, comparacaoIntegral, paginasProntas, ufsProntas,
} from '../src/lib/comparacao-dados.mjs';

// ------------------------------------------------------------------ a regra, em dados de mentira
const pagina = () => ({
  cargo: 'governador', uf: 'XX', pagina: 't',
  candidatos: [
    { slug: 'ana', nome: 'Ana', numero: '10' },
    { slug: 'beto', nome: 'Beto', numero: '20' },
    { slug: 'caio', nome: 'Caio', numero: '30' },
  ],
  propostas: [
    { id: 'p1', n_concorda: 3, posicoes: { ana: { posicao: 'concorda', blocos: [1] }, beto: { posicao: 'concorda', blocos: [2] }, caio: { posicao: 'concorda', blocos: [3] } } },
    { id: 'p2', n_concorda: 1, posicoes: { caio: { posicao: 'concorda', blocos: [4] } } },
    { id: 'p3', n_concorda: 1, posicoes: { caio: { posicao: 'concorda', blocos: [5] }, ana: { posicao: 'discorda', blocos: [6] } } },
  ],
  blocos: { ana: { 1: {}, 6: {} }, beto: { 2: {} }, caio: { 3: {}, 4: {}, 5: {} } },
});
const escopo = (situacoes, turno = 1) => ({
  turno, fonte: 'https://tse/x-u.json', divulgado_em: '05/10/2026 12:00:00', pagina_publica: 'https://tse/',
  candidatos: Object.entries(situacoes).map(([numero, [situacao, genero]]) => ({
    numero, nome_urna: `N${numero}`, situacao, situacao_tse: situacao, ...(genero ? { genero } : {}),
  })),
});

test('segundo turno: só os dois ficam, com as posições, trechos e propostas deles', () => {
  const d = aplicaResultado(pagina(), escopo({ 10: ['segundo_turno', 'feminino'], 20: ['segundo_turno', 'masculino'], 30: ['nao_eleito'] }));
  assert.deepEqual(d.candidatos.map((c) => c.slug), ['ana', 'beto']);
  // p2 era só de Caio: sai; p3 fica porque Ana se posiciona (contra), com zero que propõem
  assert.deepEqual(d.propostas.map((p) => p.id), ['p1', 'p3']);
  assert.deepEqual(Object.keys(d.propostas[0].posicoes), ['ana', 'beto']);
  assert.equal(d.propostas[0].n_concorda, 2);
  assert.equal(d.propostas[1].n_concorda, 0);
  assert.deepEqual(Object.keys(d.blocos), ['ana', 'beto']);
  assert.equal(d.resultado.segundo_turno, true);
  assert.ok(d.candidatos.every((c) => !c.eleito), 'ninguém é eleito antes do segundo turno');
});

test('eleito no primeiro turno: todos continuam, e o eleito leva a marca na concordância certa', () => {
  const original = pagina();
  const d = aplicaResultado(original, escopo({ 10: ['eleito', 'feminino'], 20: ['nao_eleito'], 30: ['nao_eleito'] }));
  assert.deepEqual(d.candidatos.map((c) => c.slug), ['ana', 'beto', 'caio']);
  assert.deepEqual(d.propostas.map((p) => p.id), ['p1', 'p2', 'p3']);
  assert.equal(d.candidatos[0].eleito, true);
  assert.equal(d.candidatos[0].rotulo_eleito, 'eleita');
  assert.equal(d.resultado.segundo_turno, false);
  assert.deepEqual(d.resultado.eleitos, ['ana']);
  assert.equal(original.candidatos[0].eleito, undefined, 'o JSON lido não pode ser alterado');
  const m = aplicaResultado(pagina(), escopo({ 20: ['eleito', 'masculino'], 10: ['nao_eleito'] }));
  assert.equal(m.candidatos.find((c) => c.slug === 'beto').rotulo_eleito, 'eleito');
});

test('falha alto: quem o TSE pôs no segundo turno, ou elegeu, e não está na comparação', () => {
  assert.throws(() => aplicaResultado(pagina(), escopo({ 10: ['segundo_turno', 'feminino'], 99: ['segundo_turno', 'masculino'] })), /N99 \(nº 99\)/);
  assert.throws(() => aplicaResultado(pagina(), escopo({ 99: ['eleito', 'masculino'] })), /nº 99/);
  assert.throws(() => aplicaResultado(pagina(), escopo({ 10: ['eleito'] })), /sem gênero/);
  assert.throws(() => normalizaSituacao('Eleito por QP'), /desconhecida/);
  assert.equal(normalizaSituacao('2º turno'), 'segundo_turno');
});

test('sem resultado para o escopo, a página fica como o harness a exportou', () => {
  const p = pagina();
  assert.equal(aplicaResultado(p, null), p);
});

test('segundo turno, quando houver: ficam os dois que o disputaram; o estado decidido no primeiro lê o turno 1', () => {
  const lista = [
    { turno: 1, presidente: { candidatos: [] }, governador: { xx: { candidatos: [] }, yy: { candidatos: [] } } },
    { turno: 2, governador: { xx: { candidatos: [] } } },
  ];
  assert.equal(resultadoDoEscopo(lista, 'governador', 'XX').turno, 2);
  assert.equal(resultadoDoEscopo(lista, 'governador', 'yy').turno, 1);
  assert.equal(resultadoDoEscopo(lista, 'presidente').turno, 1);
  assert.equal(resultadoDoEscopo(lista, 'governador', 'zz'), null);
  const d = aplicaResultado(pagina(), escopo({ 10: ['eleito', 'feminino'], 20: ['nao_eleito'] }, 2));
  assert.deepEqual(d.candidatos.map((c) => c.slug), ['ana', 'beto']);
  assert.equal(d.candidatos[0].rotulo_eleito, 'eleita');
});

test('a busca recortada mantém cada vetor na linha do seu documento', () => {
  const dims = 2;
  const documentos = {
    candidatos: [{ slug: 'ana' }, { slug: 'caio' }],
    paginas: [{ id: 'a' }, { id: 'b' }],
    propostas: [
      { id: 'a/p1', pagina: 'a', candidatos: ['ana', 'caio'], contra: [] },
      { id: 'b/p2', pagina: 'b', candidatos: ['caio'], contra: [] },
      { id: 'a/p3', pagina: 'a', candidatos: ['caio'], contra: ['ana'] },
    ],
    blocos: [
      { id: 'caio/1', slug: 'caio', propostas: ['a/p1'] },
      { id: 'ana/7', slug: 'ana', propostas: ['a/p1', 'a/p3'] },
    ],
  };
  const vp = Buffer.from([1, 1, 2, 2, 3, 3]);
  const vb = Buffer.from([8, 8, 9, 9]);
  const r = recortaBusca(documentos, vp, vb, dims, ['ana']);
  assert.deepEqual(r.documentos.propostas.map((p) => p.id), ['a/p1', 'a/p3']);
  assert.deepEqual(r.documentos.propostas.map((p) => p.candidatos), [['ana'], []]);
  assert.deepEqual([...r.vp], [1, 1, 3, 3]);
  assert.deepEqual(r.documentos.blocos.map((b) => b.id), ['ana/7']);
  assert.deepEqual([...r.vb], [9, 9]);
  assert.deepEqual(r.documentos.candidatos, [{ slug: 'ana' }]);
  assert.deepEqual(r.documentos.paginas, [{ id: 'a' }]);
});

test('emLista junta nomes em português', () => {
  assert.equal(emLista(['A']), 'A');
  assert.equal(emLista(['A', 'B']), 'A e B');
  assert.equal(emLista(['A', 'B', 'C']), 'A, B e C');
});

// ------------------------------------------------------------------ o resultado de verdade
test('data/resultado/turno-1.json: o primeiro turno de 2026, totalizado, com presidente e as 27 UFs', () => {
  assert.ok(existsSync(join(PASTA_RESULTADO, 'turno-1.json')), 'rode scripts/baixa-resultado-tse.mjs --turno 1');
  const [t1] = turnos(PASTA_RESULTADO);
  assert.equal(t1.contrato, CONTRATO_RESULTADO);
  assert.equal(t1.turno, 1);
  const escopos = [t1.presidente, ...Object.values(t1.governador)];
  assert.equal(Object.keys(t1.governador).length, 27);
  for (const e of escopos) {
    assert.match(e.fonte, /^https:\/\/resultados\.tse\.jus\.br\/oficial\/ele2026\/\d+\/dados\/[a-z]{2}\/[a-z]{2}-c\d{4}-e\d{6}-u\.json$/);
    assert.equal(e.totalizacao_final, true, `${e.fonte}: não totalizado`);
    const decididos = e.candidatos.filter((c) => ['eleito', 'segundo_turno'].includes(c.situacao));
    // um eleito, ou dois no segundo turno — nunca outra coisa num cargo majoritário
    const forma = decididos.map((c) => c.situacao).sort().join(',');
    assert.ok(['eleito', 'segundo_turno,segundo_turno'].includes(forma), `${e.fonte}: ${forma}`);
    for (const c of decididos) assert.ok(['feminino', 'masculino'].includes(c.genero), `${c.nome_urna}: sem gênero`);
  }
});

test('o site mostra o que o TSE decidiu: segundo turno com os dois, eleito marcado com todos', () => {
  const lista = turnos(PASTA_RESULTADO);
  const confere = (cargo, uf) => {
    const rotulo = uf ? `${cargo}/${uf}` : cargo;
    const e = resultadoDoEscopo(lista, cargo, uf);
    for (const id of paginasProntas(cargo, uf)) {
      const d = comparacao(cargo, uf, id);
      const integral = comparacaoIntegral(cargo, uf, id);
      const numeros = d.candidatos.map((c) => String(c.numero)).sort();
      const segundo = e.candidatos.filter((c) => c.situacao === 'segundo_turno').map((c) => c.numero).sort();
      const eleito = e.candidatos.find((c) => c.situacao === 'eleito');
      if (segundo.length) {
        assert.deepEqual(numeros, segundo, `${rotulo}/${id}: a tela não é a do segundo turno`);
        assert.ok(d.propostas.every((p) => Object.keys(p.posicoes).every((s) => d.candidatos.some((c) => c.slug === s))), `${rotulo}/${id}: posição de quem saiu`);
        assert.ok(d.candidatos.every((c) => !c.eleito), `${rotulo}/${id}: eleito antes do segundo turno`);
      } else {
        assert.equal(d.candidatos.length, integral.candidatos.length, `${rotulo}/${id}: candidato sumiu num estado decidido`);
        assert.equal(d.propostas.length, integral.propostas.length, `${rotulo}/${id}: proposta sumiu num estado decidido`);
        const marcados = d.candidatos.filter((c) => c.eleito);
        assert.equal(marcados.length, 1, `${rotulo}/${id}: ${marcados.length} marcados como eleito`);
        assert.equal(String(marcados[0].numero), eleito.numero, `${rotulo}/${id}: marcou o candidato errado`);
        assert.equal(marcados[0].rotulo_eleito, eleito.genero === 'feminino' ? 'eleita' : 'eleito');
      }
    }
  };
  confere('presidente', null);
  for (const uf of ufsProntas('governador')) confere('governador', uf);
  // presidente vai ao segundo turno: a tela tem dois candidatos
  assert.equal(comparacao('presidente', null, paginasProntas('presidente')[0]).candidatos.length, 2);
});
