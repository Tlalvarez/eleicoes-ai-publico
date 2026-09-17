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

test('home e página da UF mostram os candidatos comparados depois da comparação', () => {
  // 16/09: a home passou a abrir a matriz do primeiro tema, e a busca separada saiu — a
  // matriz tem a sua. O que se cobra é a ordem: primeiro comparar, depois quem compõe.
  const home = readFileSync(`${RAIZ}/src/pages/index.astro`, 'utf8');
  const uf = readFileSync(`${RAIZ}/src/pages/[cargo]/[uf].astro`, 'utf8');
  for (const [nome, t] of [['home', home], ['uf', uf]]) {
    assert.match(t, /<CandidatosComparados /, nome);
    const antes = Math.max(t.indexOf('<Comparacao '), t.indexOf('<Busca '));
    assert.ok(antes >= 0, `${nome}: nem matriz nem busca na página`);
    assert.ok(antes < t.indexOf('<CandidatosComparados '), `${nome}: os retratos vêm por último`);
  }
});

test('a página da UF também abre a matriz do primeiro tema', () => {
  // 16/09: o mesmo padrão da home vale para governador — clicar num estado já mostra a
  // comparação, e o endereço do primeiro tema daquela UF redireciona para a página dela.
  const pagina = readFileSync(`${RAIZ}/src/pages/[cargo]/[uf].astro`, 'utf8');
  assert.match(pagina, /<Comparacao [^>]*naHome/, 'a página da UF monta a comparação');
  assert.doesNotMatch(pagina, /<GradeTemas /, 'a grade de temas saiu: o seletor da matriz faz esse papel');
  const tema = readFileSync(`${RAIZ}/src/pages/[cargo]/[uf]/[tema].astro`, 'utf8');
  assert.match(tema, /\.slice\(1\)/, 'o primeiro tema da UF não pode virar página: ele é a página da UF');
  const redirects = readFileSync(`${RAIZ}/public/_redirects`, 'utf8');
  // uma regra com curinga, não 27 linhas: a Pages aplica no máximo 100 regras estáticas e
  // ignora as excedentes sem avisar — com 27 linhas o arquivo passou de 100 e três UFs
  // ficaram servindo 404 em vez de redirecionar (16/09)
  assert.match(redirects, /^\/governador\/:uf\/[a-z-]+ \/governador\/:uf 301$/m,
    'o primeiro tema de cada UF precisa redirecionar para a página da UF');
  const regras = redirects.split('\n').filter((l) => l.startsWith('/')).length;
  assert.ok(regras <= 100, `_redirects tem ${regras} regras, e a Pages aplica 100`);
});

test('a home abre a matriz do primeiro tema, sem clique', () => {
  const home = readFileSync(`${RAIZ}/src/pages/index.astro`, 'utf8');
  assert.match(home, /<Comparacao [^>]*naHome/, 'a home monta a comparação em modo home');
  assert.doesNotMatch(home, /<GradeTemas /, 'a grade de temas saiu: o seletor da matriz faz esse papel');
  const tema = readFileSync(`${RAIZ}/src/pages/presidente/[tema].astro`, 'utf8');
  assert.match(tema, /prontas\.slice\(1\)/, 'o primeiro tema não pode virar página: ele é a home');
  assert.match(readFileSync(`${RAIZ}/public/_redirects`, 'utf8'), /^\/presidente\/[a-z-]+ \/ 301$/m,
    'o endereço do primeiro tema precisa redirecionar para a home');
});
