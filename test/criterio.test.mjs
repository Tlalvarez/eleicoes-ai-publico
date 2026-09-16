/**
 * Todo escopo com comparação pronta diz quem foi comparado e por quê:
 * data/comparacao/criterio.json tem uma entrada por escopo, a contagem bate
 * com os candidatos da comparação, e as páginas usam o componente.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { criterioDoEscopo, criterios, CONTRATO_CRITERIO } from '../src/lib/criterio.mjs';
import { resumoDoEscopo, ufsProntas } from '../src/lib/comparacao-dados.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

test('criterio.json cumpre o contrato e cobre presidente e toda UF pronta', () => {
  const d = criterios();
  assert.ok(d, 'data/comparacao/criterio.json não existe — rode v3/exporta_criterio.py');
  assert.equal(d.contrato, CONTRATO_CRITERIO);
  const pres = criterioDoEscopo('presidente');
  assert.equal(pres.comparados, resumoDoEscopo('presidente')[0].candidatos.length);
  assert.match(pres.registro ?? '', /^[A-Z]{2}\d{9}$/, 'presidente: sem número de registro da pesquisa');
  for (const uf of ufsProntas('governador')) {
    const c = criterioDoEscopo('governador', uf);
    assert.ok(c, `governador/${uf}: sem critério`);
    assert.equal(c.comparados, resumoDoEscopo('governador', uf)[0].candidatos.length, `governador/${uf}: contagem`);
    assert.ok(c.instituto && c.fim_campo, `governador/${uf}: pesquisa incompleta`);
    // 16/09 (revisão jurídica §3.2): pesquisa que decide quem entra precisa do registro
    // no PesqEle, com o campo como está no cadastro do TSE
    assert.match(c.registro ?? '', /^[A-Z]{2}\d{9}$/, `governador/${uf}: sem número de registro da pesquisa`);
    for (const campo of ['campo_inicio', 'campo_fim', 'divulgacao']) {
      assert.match(c[campo] ?? '', /^\d{4}-\d{2}-\d{2}$/, `governador/${uf}: ${campo} fora do cadastro`);
    }
    for (const f of c.fora) assert.ok(f.nome && f.motivo, `governador/${uf}: fora sem motivo`);
  }
});

test('home e página da UF mostram os candidatos comparados abaixo da busca', () => {
  const home = readFileSync(`${RAIZ}/src/pages/index.astro`, 'utf8');
  const uf = readFileSync(`${RAIZ}/src/pages/[cargo]/[uf].astro`, 'utf8');
  for (const [nome, t] of [['home', home], ['uf', uf]]) {
    assert.match(t, /<CandidatosComparados /, nome);
    assert.ok(t.indexOf('<Busca ') < t.indexOf('<CandidatosComparados '), `${nome}: os retratos vêm depois da busca`);
  }
});
