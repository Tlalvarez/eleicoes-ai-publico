/**
 * `npm test` — o comando convencional — É o gate completo.
 *
 * O que existia: `npm test` rodava só as checagens rápidas, e o gate de
 * verdade (build real + conferência do HTML construído) vivia num script
 * separado, `test:integracao`, declarado como obrigatório apenas no README.
 * Obrigação documental não é obrigação: quem digita `npm test` — pessoa ou
 * automação — via verde sem nunca ter compilado o site. E não há CI versionado
 * neste repositório para compensar isso.
 *
 * Agora `npm test` = checagens rápidas + `astro build` + conferência do dist.
 * Custa ~22 s, que é o preço de o comando padrão dizer a verdade. Quem precisa
 * do laço curto usa `npm run test:unit`.
 *
 * Este arquivo trava a composição dos scripts. Um teste sobre `package.json`
 * parece burocrático, mas o defeito corrigido era exatamente esse: uma linha
 * de configuração que fazia o gate padrão não ser o gate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { scripts } = JSON.parse(
  readFileSync(join(PROJETO, 'package.json'), 'utf8'));

/** Expande `npm run X` recursivamente e devolve os comandos folha. */
function expande(nome, vistos = new Set()) {
  if (vistos.has(nome)) {
    throw new Error(`recursão em npm run ${nome}`);
  }
  vistos.add(nome);
  const comando = scripts[nome];
  assert.ok(comando, `script '${nome}' não existe em package.json`);
  return comando.split('&&').flatMap((parte) => {
    const t = parte.trim();
    const m = t.match(/^npm run ([\w:-]+)$/);
    return m ? expande(m[1], vistos) : [t];
  });
}

test('npm test compila o site de verdade', () => {
  const folhas = expande('test');

  assert.ok(folhas.includes('astro build'),
    `npm test não roda o build: ${folhas.join(' | ')}`);
});

test('npm test confere o HTML construído, não só o código-fonte', () => {
  const folhas = expande('test');

  assert.ok(folhas.some((c) => c.includes('checa-home-dist')),
    `npm test não confere o dist: ${folhas.join(' | ')}`);
});

test('npm test roda o gate de catálogo', () => {
  const folhas = expande('test');

  assert.ok(folhas.some((c) => c.includes('checa-catalogo')),
    `npm test não roda o gate de catálogo: ${folhas.join(' | ')}`);
});

test('npm test confere que nada no dist monta HTML por string', () => {
  const folhas = expande('test');

  assert.ok(folhas.some((c) => c.includes('checa-render-seguro')),
    `npm test não roda o gate de renderização segura: ${folhas.join(' | ')}`);
});

test('npm test confere o estado de release publicado', () => {
  const folhas = expande('test');

  assert.ok(folhas.some((c) => c.includes('checa-previa')),
    `npm test não roda o gate de prévia: ${folhas.join(' | ')}`);
});

test('npm test confere o piso de acessibilidade das páginas', () => {
  const folhas = expande('test');

  assert.ok(folhas.some((c) => c.includes('checa-acessibilidade')),
    `npm test não roda o gate de acessibilidade: ${folhas.join(' | ')}`);
});

test('todo gate pós-build roda DEPOIS do build, nunca antes', () => {
  const folhas = expande('test');
  const build = folhas.indexOf('astro build');

  for (const gate of ['checa-home-dist', 'checa-render-seguro',
    'checa-previa', 'checa-acessibilidade']) {
    const onde = folhas.findIndex((c) => c.includes(gate));
    assert.ok(onde > build,
      `${gate} roda antes do build — ele conferiria o dist da rodada anterior`);
  }
});

test('npm test roda a suíte de rotas', () => {
  const folhas = expande('test');

  assert.ok(folhas.some((c) => c.includes('node --test')),
    `npm test não roda a suíte: ${folhas.join(' | ')}`);
});

test('existe um laço curto que NÃO compila', () => {
  const folhas = expande('test:unit');

  assert.ok(!folhas.includes('astro build'),
    'test:unit compila — deixou de ser o laço curto');
  assert.ok(folhas.some((c) => c.includes('node --test')));
});

test('nenhum script chama a si mesmo, direta ou indiretamente', () => {
  for (const nome of Object.keys(scripts)) {
    assert.doesNotThrow(() => expande(nome), `recursão a partir de ${nome}`);
  }
});

test('test:integracao continua existindo e é o mesmo gate', () => {
  // o README e o operacional citam esse nome; ele não pode virar um gate
  // MENOR que o padrão
  assert.deepEqual(expande('test:integracao'), expande('test'));
});
