import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entendePergunta, vocabularioDasPropostas } from '../src/lib/pergunta.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const escopo = (rel) => {
  const d = JSON.parse(readFileSync(`${RAIZ}/data/busca/${rel}/documentos.json`, 'utf8'));
  return { candidatos: d.candidatos, paginas: d.paginas, vocabulario: vocabularioDasPropostas(d.propostas) };
};
const PRES = escopo('presidente');
const RJ = escopo('governador/rj');
const e = (q, ctx = PRES) => entendePergunta(q, ctx);

test('a moldura da pergunta sai: fica o assunto', () => {
  assert.deepEqual(e('quem é a favor de armas?'), { candidatos: [], tema: null, conteudo: 'armas' });
  assert.equal(e('o que vai mudar na aposentadoria?').conteudo, 'mudar aposentadoria');
  assert.equal(e('armas').conteudo, 'armas', 'palavra solta continua palavra solta');
  assert.equal(e('escala 6x1').conteudo, 'escala 6x1');
  assert.equal(e('o que propõem sobre IA?').conteudo, 'IA', 'sigla de duas letras é assunto');
});

test('nome de candidato vira seleção de colunas, na ordem das colunas, e sai da busca', () => {
  const r = e('o que o Lula e o Flávio Bolsonaro propõem sobre armas?');
  assert.deepEqual(r.candidatos, ['flavio-bolsonaro', 'lula']);
  assert.equal(r.conteudo, 'armas');
  assert.deepEqual(e('zema privatização').candidatos, ['romeu-zema']);
});

test('só quem e tema: a página do tema responde, sem busca', () => {
  assert.deepEqual(e('o que o Lula propõe para a saúde?'), { candidatos: ['lula'], tema: 'saude', conteudo: '' });
  const r = e('compare os programas de lula e flávio bolsonaro em relação a segurança e justiça');
  assert.deepEqual(r, { candidatos: ['flavio-bolsonaro', 'lula'], tema: 'seguranca-justica', conteudo: '' });
  assert.equal(e('o que os candidatos propõem para a educação?').tema, 'educacao');
});

test('tema com mais alguma coisa é busca, e a palavra do tema fica na consulta', () => {
  const r = e('fila do SUS na saúde');
  assert.equal(r.tema, null);
  assert.equal(r.conteudo, 'fila SUS saúde', 'a consulta guarda a grafia de quem escreveu');
});

test('nome que também é palavra de proposta só conta acompanhado', () => {
  // "Douglas Ruas" é candidato no RJ; "ruas" é palavra de proposta
  assert.deepEqual(e('asfaltar ruas', RJ).candidatos, []);
  assert.equal(e('asfaltar ruas', RJ).conteudo, 'asfaltar ruas');
  assert.equal(e('o que o douglas ruas propõe para a saúde?', RJ).candidatos.length, 1);
});

test('nenhum candidato e nenhum tema é tratado de forma diferente: todos, de todos os escopos, são achados pelo nome', () => {
  const ufs = readdirSync(`${RAIZ}/data/busca/governador`).filter((u) => existsSync(`${RAIZ}/data/busca/governador/${u}/documentos.json`));
  let candidatos = 0;
  for (const rel of ['presidente', ...ufs.map((u) => `governador/${u}`)]) {
    const ctx = escopo(rel);
    for (const c of ctx.candidatos) {
      candidatos += 1;
      assert.deepEqual(entendePergunta(`o que ${c.nome} propõe sobre impostos?`, ctx), { candidatos: [c.slug], tema: null, conteudo: 'impostos' }, `${rel}: ${c.nome}`);
    }
    for (const p of ctx.paginas) assert.equal(entendePergunta(`o que os candidatos propõem para ${p.nome}?`, ctx).tema, p.id, `${rel}: ${p.nome}`);
  }
  assert.ok(candidatos > 100, 'a varredura tem de alcançar as UFs, não só presidente');
});
