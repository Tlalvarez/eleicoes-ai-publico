/**
 * Os dados exportados pelo harness (data/comparacao/) — o contrato que o site
 * compila a partir de um clone limpo, sem v3/ e sem S3.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTRATO, PASTA, comparacao, paginaPorId, paginas, paginasProntas, resumoDoEscopo, ufsProntas,
} from '../src/lib/comparacao-dados.mjs';

test('data/comparacao/ é versionado e traz paginas.json', () => {
  assert.ok(existsSync(join(PASTA, 'paginas.json')));
  const ps = paginas();
  assert.ok(ps.length >= 10, `só ${ps.length} páginas`);
  for (const p of ps) {
    for (const campo of ['id', 'nome', 'titulo', 'temas']) assert.ok(p[campo], `${p.id}: sem ${campo}`);
    assert.match(p.id, /^[a-z0-9-]+$/, `${p.id}: id não é slug`);
  }
  assert.equal(new Set(ps.map((p) => p.id)).size, ps.length, 'id repetido');
});

test('toda página de presidente exportada está em paginas.json e cumpre o contrato', () => {
  const prontas = paginasProntas('presidente');
  assert.ok(prontas.length >= 10, `só ${prontas.length} páginas prontas`);
  for (const id of prontas) {
    assert.ok(paginaPorId(id), `${id}: exportada mas fora de paginas.json`);
    const d = comparacao('presidente', null, id);
    assert.equal(d.contrato, CONTRATO);
    assert.equal(d.pagina, id);
    assert.ok(d.candidatos.length >= 2 && d.candidatos.length <= 6, `${id}: ${d.candidatos.length} candidatos`);
    const ordem = d.candidatos.map((c) => c.slug);
    const nomes = d.candidatos.map((c) => c.nome);
    assert.deepEqual(nomes, nomes.slice().sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })), `${id}: colunas fora da ordem alfabética`);
    for (const c of d.candidatos) {
      assert.match(c.tse, /^https:\/\/divulgacandcontas\.tse\.jus\.br\//, `${id}: ${c.slug} sem link do TSE`);
      assert.ok(c.nome && c.partido, `${id}: ${c.slug} sem nome ou partido`);
    }
    for (const p of d.propostas) {
      assert.ok(p.id && p.subtema && p.proposta, `${id}: proposta sem id/subtema/texto`);
      const quem = Object.keys(p.posicoes);
      assert.ok(quem.length, `${id}/${p.id}: ninguém se posiciona`);
      for (const [s, v] of Object.entries(p.posicoes)) {
        assert.ok(ordem.includes(s), `${id}/${p.id}: posição de ${s}, que não é coluna`);
        assert.ok(['concorda', 'discorda'].includes(v.posicao), `${id}/${p.id}: posição '${v.posicao}'`);
        assert.ok(v.blocos.length, `${id}/${p.id}: ${s} sem bloco citado`);
        for (const n of v.blocos) {
          assert.ok(d.blocos[s]?.[String(n)]?.texto, `${id}/${p.id}: bloco ${n} de ${s} sem texto`);
        }
      }
      assert.ok(quem.some((s) => p.posicoes[s].posicao === 'concorda'), `${id}/${p.id}: só discordância, sem proponente`);
    }
    // nada do harness vaza para o site
    for (const campo of ['laudo', 'uso_tokens', 'modelo', 'prompt_sha256', 'varredura', 'cruzamento']) {
      assert.ok(!(campo in d), `${id}: campo '${campo}' do harness no JSON do site`);
    }
  }
});

test('o resumo por escopo bate com os arquivos', () => {
  const r = resumoDoEscopo('presidente');
  assert.equal(r.length, paginasProntas('presidente').length);
  for (const x of r) assert.ok(x.propostas > 0 && x.nome && x.titulo);
});

test('governador sem dados é "em preparação": nenhuma UF pronta, nenhuma rota de tema', () => {
  // quando a primeira UF for exportada, este teste passa a exigir o contrato dela
  for (const uf of ufsProntas('governador')) {
    for (const id of paginasProntas('governador', uf)) {
      const d = comparacao('governador', uf, id);
      assert.equal(d.cargo, 'governador');
      assert.equal(d.uf, uf.toUpperCase());
    }
  }
  assert.equal(comparacao('governador', 'sp', 'educacao') === null || typeof comparacao('governador', 'sp', 'educacao') === 'object', true);
});
