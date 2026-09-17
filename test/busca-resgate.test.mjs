/**
 * Resgate por sentido: quando NENHUMA palavra da consulta casa, o vetor decide.
 *
 * Decisão do Thiago (16/09/2026). Ele digitou "Ferrogão" — a palavra sem o "r", que é o
 * exemplo oferecido pelo próprio campo — e a busca respondeu "nenhuma proposta fala disso",
 * enquanto "Ferrogrão" trazia dez. O vetor da consulta já era calculado em toda busca e
 * descartado quando o lexical falhava; agora ele é o último recurso.
 *
 * O que se prova aqui:
 *   · o resgate SÓ entra quando nada é relevante — a consulta que já funciona não muda;
 *   · o que ele devolve vem marcado (`aproximado` na proposta, `resgatado` no resultado),
 *     porque apresentar aproximação como acerto engana mais do que dizer que não achou;
 *   · sem vetor de consulta não há resgate: o piso lexical continua sendo o piso.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { busca, preparaBusca, COSSENO_RESGATE, COSSENO_FORTE } from '../src/lib/busca.mjs';

/** Um índice de mentira, com vetores escolhidos à mão: 3 dimensões bastam para a regra. */
function indiceDeTeste() {
  const dados = {
    contrato: 'busca/1',
    paginas: [{ id: 'transporte', nome: 'Transporte' }],
    candidatos: [{ slug: 'a', nome: 'Candidata A' }],
    propostas: [
      { id: 'transporte/p1', pagina: 'transporte', pid: 'p1', subtema: 'Ferrovias', texto: 'Executar a Ferrogrão como obra prioritária', sinonimos: [], posicoes: {} },
      { id: 'transporte/p2', pagina: 'transporte', pid: 'p2', subtema: 'Portos', texto: 'Dragar o porto de Santos', sinonimos: [], posicoes: {} },
    ],
    blocos: [],
  };
  // p1 fica na FAIXA DO RESGATE: perto o bastante para valer como vizinho (cos ~0,37) e
  // longe do forte (0,45), que já era relevante antes. É essa faixa que a mudança criou.
  // p2 fica longe de tudo. cos = (v · q) / 127, com q unitário.
  const vp = Buffer.from(Int8Array.from([47, 118, 0, 0, 0, 127]).buffer);
  const vb = Buffer.alloc(0);
  return preparaBusca(dados, vp, vb, 3);
}

const vetor = (x, y, z) => Float32Array.from([x, y, z]);

test('a consulta que casa pelas palavras não passa pelo resgate', () => {
  const estado = indiceDeTeste();
  const r = busca(estado, 'Ferrogrão', vetor(1, 0, 0), { maxPropostas: 10, maxTrechos: 0 });
  assert.equal(r.propostas[0].pid, 'p1', 'a palavra da consulta está em p1');
  const relevantes = r.propostas.filter((p) => p.relevante);
  assert.equal(r.resgatado, false, 'havia resultado lexical: o resgate não podia entrar');
  assert.ok(relevantes.length >= 1);
  assert.ok(!relevantes.some((p) => p.aproximado), 'resultado direto não é aproximado');
});

test('sem palavra que case, o vizinho vetorial forte é resgatado e vem marcado', () => {
  const estado = indiceDeTeste();
  // "Ferrogão" não casa com nenhum termo; o vetor aponta para a mesma direção de p1
  const r = busca(estado, 'Ferrogão', vetor(1, 0, 0), { maxPropostas: 10, maxTrechos: 0 });
  const relevantes = r.propostas.filter((p) => p.relevante);
  assert.equal(r.resgatado, true, 'nada casou pelas palavras: o resgate tinha de entrar');
  assert.ok(relevantes.length >= 1, 'o vizinho próximo precisa aparecer');
  assert.ok(relevantes.every((p) => p.aproximado), 'todo resgatado vem marcado como aproximado');
  assert.ok(relevantes.every((p) => p.cos >= COSSENO_RESGATE), 'só entra acima do limiar de resgate');
});

test('vizinho distante não é resgatado: sem nada bom, a busca continua dizendo que não achou', () => {
  const estado = indiceDeTeste();
  // vetor ortogonal a p1: cosseno zero, abaixo do limiar de resgate
  const r = busca(estado, 'assunto inexistente aqui', vetor(0, 0, 0), { maxPropostas: 10, maxTrechos: 0 });
  assert.equal(r.resgatado, false);
  assert.equal(r.propostas.filter((p) => p.relevante).length, 0);
});

test('sem vetor de consulta não há resgate: o piso lexical continua sendo o piso', () => {
  const estado = indiceDeTeste();
  const r = busca(estado, 'Ferrogão', null, { maxPropostas: 10, maxTrechos: 0 });
  assert.equal(r.resgatado, false);
  assert.equal(r.propostas.filter((p) => p.relevante).length, 0);
});

test('o limiar de resgate é mais baixo que o de relevância forte, e ambos estão declarados', () => {
  assert.ok(COSSENO_RESGATE < COSSENO_FORTE, 'resgatar exige menos que ser relevante por sentido');
  assert.ok(COSSENO_RESGATE > 0.2, 'mas não tão baixo a ponto de trazer qualquer coisa');
});
