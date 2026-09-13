/**
 * A busca, medida num gabarito: recall@10 de cada modo (lexical, vetorial,
 * híbrido) sobre os dados exportados de verdade (data/busca/presidente/).
 *
 * Os vetores das consultas vêm pré-calculados (scripts/vetores-do-gabarito.mjs)
 * para o teste rodar offline. A meta do híbrido é ≥ 0,85; o teste imprime a
 * tabela inteira para a regressão ser visível consulta a consulta, e falha só
 * na média — um gabarito de 40 consultas tem casos de fronteira.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONTRATO, busca, buscaLexical, buscaVetorial, criaIndice, preparaBusca, raiz, ranqueia, rrf, termos, unitario,
} from '../src/lib/busca.mjs';

const RAIZ = new URL('..', import.meta.url);
const le = (rel) => readFileSync(new URL(rel, RAIZ));
const dados = JSON.parse(le('data/busca/presidente/documentos.json'));
const indice = JSON.parse(le('data/busca/presidente/indice.json'));
const gabarito = JSON.parse(le('test/busca-gabarito.json'));
const vetoresConsulta = JSON.parse(le('test/busca-gabarito-vetores.json'));
const estado = preparaBusca(dados, le('data/busca/presidente/vetores-propostas.bin'), le('data/busca/presidente/vetores-blocos.bin'), indice.dimensoes);

test('termos: sem acento, sem palavras vazias, com raiz leve', () => {
  assert.deepEqual(termos('As regulações das ações públicas'), ['regulacao', 'acao', 'publica']);
  assert.deepEqual(termos('escala 6x1 e a jornada'), ['escala', '6x1', 'jornada']);
  assert.equal(raiz('professores'), 'professore');
  assert.equal(raiz('facilmente'), 'facil');
  assert.equal(termos('o que é isso').length, 0);
});

test('BM25: o documento com mais termos da consulta vem antes', () => {
  const idx = criaIndice([{ id: 'a', texto: 'escala de trabalho' }, { id: 'b', texto: 'acabar com a escala 6x1' }, { id: 'c', texto: 'nada a ver' }]);
  const r = buscaLexical(idx, 'escala 6x1');
  assert.equal(r[0].i, 1);
  assert.deepEqual(r.map((h) => h.i).sort(), [0, 1]);
});

test('vetores int8 e cosseno: o próprio vetor é o vizinho mais próximo', () => {
  const dims = 4;
  const v = new Int8Array([127, 0, 0, 0, 0, 127, 0, 0, 90, 90, 0, 0]);
  const r = buscaVetorial({ v, dims, n: 3 }, unitario([1, 0, 0, 0]), 3);
  assert.equal(r[0].i, 0);
  assert.ok(r[0].cos > 0.99);
  assert.equal(r[1].i, 2);
});

test('RRF soma 1/(k+pos) por lista', () => {
  const r = rrf([[1, 2], [2, 3]], 60);
  assert.equal(r[0].i, 2);
});

test('o índice exportado cumpre o contrato e os vetores batem com os documentos', () => {
  assert.equal(indice.contrato, CONTRATO);
  assert.equal(estado.docs.length, dados.propostas.length + dados.blocos.length);
  assert.equal(estado.vetores.n, estado.docs.length);
  assert.ok(dados.propostas.length >= 900, `só ${dados.propostas.length} propostas`);
  assert.ok(indice.com_sinonimos / indice.propostas >= 0.9, `só ${indice.com_sinonimos} de ${indice.propostas} propostas com sinônimos`);
  assert.equal(vetoresConsulta.modelo, indice.modelo);
  assert.equal(vetoresConsulta.dimensoes, indice.dimensoes);
});

function recallAt10(consulta, modo) {
  const vq = modo === 'lexical' ? null : unitario(vetoresConsulta.vetores[consulta.q]);
  let ids;
  if (modo === 'vetorial') {
    const vec = buscaVetorial(estado.vetores, vq, 60, 0);
    // só vetorial: agrupa como a busca faz, sem a lista lexical
    ids = [];
    for (const h of vec) {
      const d = estado.docs[h.i];
      const alvo = d.tipo === 'proposta' ? [d.id] : (d.ref.propostas?.length ? d.ref.propostas : [d.id]);
      for (const id of alvo) if (!ids.includes(id)) ids.push(id);
      if (ids.length >= 10) break;
    }
  } else {
    const r = busca(estado, consulta.q, vq);
    ids = [...r.propostas.map((p) => p.id), ...r.trechos.map((t) => t.id)].slice(0, 10);
  }
  const esperados = [...(consulta.propostas ?? []), ...(consulta.blocos ?? [])];
  if (!esperados.length) return { ids, recall: null };
  return { ids, recall: esperados.filter((e) => ids.includes(e)).length / esperados.length };
}

test('recall@10 no gabarito: híbrido ≥ 0,85, e a tabela por consulta', () => {
  const linhas = [];
  const medias = { lexical: [], vetorial: [], hibrido: [] };
  for (const c of gabarito.consultas) {
    assert.ok(vetoresConsulta.vetores[c.q], `sem vetor pré-calculado para "${c.q}" — rode scripts/vetores-do-gabarito.mjs`);
    const linha = { consulta: c.q };
    for (const modo of ['lexical', 'vetorial', 'hibrido']) {
      const { recall } = recallAt10(c, modo);
      linha[modo] = recall === null ? '—' : recall.toFixed(2);
      if (recall !== null) medias[modo].push(recall);
    }
    linhas.push(linha);
  }
  const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const resumo = { consulta: 'MÉDIA', lexical: media(medias.lexical).toFixed(3), vetorial: media(medias.vetorial).toFixed(3), hibrido: media(medias.hibrido).toFixed(3) };
  console.table([...linhas, resumo]);
  assert.ok(media(medias.hibrido) >= 0.85, `recall@10 híbrido = ${resumo.hibrido} (meta 0,85)`);
  assert.ok(media(medias.hibrido) >= media(medias.lexical) - 0.02, 'o híbrido não pode perder do lexical');
});

test('consulta sem assunto no corpus é dita como tal: nenhum resultado direto', () => {
  const c = gabarito.consultas.find((x) => x.vazio);
  const r = busca(estado, c.q, unitario(vetoresConsulta.vetores[c.q]));
  // um sinônimo gerado pelo modelo pode casar ("aborto legal" em direitos reprodutivos):
  // isso é "próxima", nunca "direta" — direta exige o termo no texto da proposta ou do trecho
  assert.equal(r.propostas.filter((p) => p.direto).length, 0, 'apresentou como direta uma proposta que não fala do assunto');
  assert.ok(r.sem_direto, `"${c.q}": a busca apresentou resultado como direto`);
  // e uma consulta com assunto presente não é marcada como fraca
  const ok = busca(estado, 'creche', unitario(vetoresConsulta.vetores.creche));
  assert.equal(ok.sem_direto, false);
  assert.ok(!ok.propostas[0].fraco);
});

test('a busca degrada para lexical sem vetor da consulta', () => {
  const r = busca(estado, 'creche', null);
  assert.equal(r.modo, 'lexical');
  assert.ok(r.propostas.some((p) => p.id === 'educacao/p71'));
  const h = ranqueia(estado, 'creche', unitario(vetoresConsulta.vetores.creche));
  assert.equal(h.modo, 'hibrido');
});
