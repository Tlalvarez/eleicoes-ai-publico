/**
 * O registro público de correções (decisão de 16/09/2026, revisão jurídica §3.5):
 * todo pedido entra, aceito ou recusado, com motivo; a página existe e é
 * alcançável de onde o leitor procura; e o endereço antigo não vira link morto.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { correcoes, contestacoesDaProposta, indiceDeContestacoes, CONTRATO_CORRECOES } from '../src/lib/correcoes.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const arquivoTemp = (obj) => {
  const f = join(mkdtempSync(join(tmpdir(), 'correcoes-')), 'correcoes.json');
  writeFileSync(f, JSON.stringify(obj));
  return f;
};

test('correcoes.json cumpre o contrato', () => {
  const d = correcoes();
  assert.equal(d.contrato, CONTRATO_CORRECOES);
  assert.ok(Array.isArray(d.pedidos));
});

test('decisão sem motivo público é recusada pelo contrato', () => {
  const base = { id: '2026-09-16-1', recebido_em: '2026-09-16T12:00:00Z', origem: 'campanha', escopo: 'governador/sp', pagina: 'educacao', proposta: 'p3', pedido: 'o resumo não bate com o trecho' };
  const semMotivo = arquivoTemp({ contrato: CONTRATO_CORRECOES, pedidos: [{ ...base, decisao: 'recusado', motivo: '' }] });
  assert.throws(() => correcoes(semMotivo), /sem motivo público/);
  const emAnalise = arquivoTemp({ contrato: CONTRATO_CORRECOES, pedidos: [{ ...base, decisao: 'em análise', motivo: null }] });
  assert.equal(correcoes(emAnalise).pedidos.length, 1, 'pedido ainda não decidido não precisa de motivo');
  const origemEstranha = arquivoTemp({ contrato: CONTRATO_CORRECOES, pedidos: [{ ...base, origem: 'assessoria', decisao: 'aceito', motivo: 'x' }] });
  assert.throws(() => correcoes(origemEstranha), /origem/);
});

test('só pedido de campanha sobre uma proposta acende o selo', () => {
  const comum = { recebido_em: '2026-09-16T12:00:00Z', escopo: 'governador/sp', pagina: 'educacao', proposta: 'p3', pedido: 'x', decisao: 'recusado', motivo: 'o trecho sustenta a frase' };
  const f = arquivoTemp({ contrato: CONTRATO_CORRECOES, pedidos: [
    { ...comum, id: '2026-09-16-1', origem: 'campanha' },
    { ...comum, id: '2026-09-16-2', origem: 'leitor' },
    { ...comum, id: '2026-09-16-3', origem: 'campanha', proposta: null },
  ] });
  assert.deepEqual(contestacoesDaProposta('governador/sp', 'educacao', 'p3', f).map((p) => p.id), ['2026-09-16-1']);
  assert.deepEqual(indiceDeContestacoes(f), { 'governador/sp|educacao|p3': ['2026-09-16-1'] });
});

test('a página existe, diz o que não entra e não abre espaço de resposta', () => {
  const arquivo = readFileSync(`${RAIZ}/src/pages/correcoes.astro`, 'utf8');
  // o que o leitor vê é o gabarito, não o frontmatter: o comentário de cabeçalho
  // cita as palavras proibidas justamente para explicar por que elas não entram
  const mostrado = arquivo.slice(arquivo.indexOf('---', 3) + 3);
  for (const trecho of ['O que entra', 'O que não entra', '48 horas', 'Registro público', 'ordem judicial']) {
    assert.ok(mostrado.includes(trecho), `a página precisa falar de "${trecho}"`);
  }
  for (const proibido of ['informação adicional', 'editar sua proposta']) {
    assert.ok(!mostrado.includes(proibido), `a página nunca oferece "${proibido}"`);
  }
  // a recusa é explícita, e por isso o termo aparece: o que se cobra é a frase que nega,
  // não a ausência da palavra
  assert.ok(mostrado.includes('Não há espaço de resposta do candidato'), 'a página precisa recusar o espaço de resposta');
});

test('o leitor chega à página, e o endereço antigo redireciona', () => {
  for (const arq of ['src/layouts/Base.astro', 'src/pages/sobre.astro', 'src/pages/metodologia.astro']) {
    assert.match(readFileSync(`${RAIZ}/${arq}`, 'utf8'), /href="\/correcoes"/, `${arq} precisa linkar /correcoes`);
  }
  assert.ok(!existsSync(`${RAIZ}/src/pages/contato.astro`), 'a página antiga saiu');
  assert.match(readFileSync(`${RAIZ}/public/_redirects`, 'utf8'), /^\/contato \/correcoes 301$/m, '/contato precisa redirecionar');
});
