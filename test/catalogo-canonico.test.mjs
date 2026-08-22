/**
 * O catálogo canônico é um arquivo VERSIONADO deste repositório, e o gate
 * padrão sempre compara os derivados contra ele.
 *
 * O que existia: `comparaCatalogos` aceitava uma lista esperada OPCIONAL, vinda
 * da variável de ambiente `CATALOGO_ESPERADO`. O gate obrigatório não definia
 * essa variável, então na prática ele só comparava `resumo.json` com
 * `indice.json` — dois derivados da MESMA exportação. Se a exportação
 * publicasse doze candidatos em vez de treze, os dois estariam igualmente
 * errados e o gate passaria anunciando "OK: 12 candidatos".
 *
 * Um gate cuja autoridade é opcional não é gate. Agora:
 *
 *   · `src/data/candidatos.json` é a fonte canônica, versionada, editada à mão
 *     — é o que declara quem DEVE estar publicado;
 *   · o gate compara canônico × itens × acervo × catálogo do índice de
 *     pesquisa (via manifesto da geração, e via SQLite quando disponível);
 *   · não há modo silencioso: sem a fonte canônica, o gate FALHA. Nenhuma
 *     variável de ambiente desliga a comparação.
 *
 * Na Onda 1 o arquivo canônico passa a ter treze, e é o mesmo gate que cai se
 * faltar, sobrar ou divergir qualquer um.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  catalogoCanonico, catalogoDoIndice, catalogoDoManifesto, catalogoDoResumo,
  comparaCatalogos, leCatalogoCanonico,
} from '../src/lib/catalogo.mjs';

const PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CINCO = {
  lula: 'Lula',
  'romeu-zema': 'Romeu Zema',
  'ronaldo-caiado': 'Ronaldo Caiado',
  'renan-santos': 'Renan Santos',
  'flavio-bolsonaro': 'Flávio Bolsonaro',
};

// O roster da Onda 1: os cinco acima e os oito que entraram no CATÁLOGO sem
// entrar na coleta. Está escrito aqui de propósito — é uma DECLARAÇÃO, o
// contraponto humano ao derivado. Derivar esta lista do próprio arquivo
// canônico tornaria o teste tautológico.
const ROSTER = {
  ...CINCO,
  'clariana-barao': 'Clariana Barão',
  'edmilson-costa': 'Edmilson Costa',
  'augusto-cury': 'Augusto Cury',
  'hertz-dias': 'Hertz Dias',
  'pablo-marcal': 'Pablo Marçal',
  'rui-costa-pimenta': 'Rui Costa Pimenta',
  samara: 'Samara',
  'wilson-grassi': 'Wilson Grassi',
};

const TREZE = Object.fromEntries(Array.from({ length: 13 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return [`candidata-${n}`, `Candidata ${n}`];
}));

const canonicoDe = (mapa) => ({
  atualizado_em: '2026-08-22',
  candidatos: Object.entries(mapa).map(([slug, nome]) => ({ slug, nome })),
});
const resumoDe = (mapa) => ({
  candidatos: Object.fromEntries(
    Object.entries(mapa).map(([slug, nome]) => [slug, { nome, total: 0, anos: [] }])),
});
const indiceDe = (mapa) => ({
  candidatos: Object.fromEntries(
    Object.entries(mapa).map(([slug, nome]) => [slug, { nome, tipos: {} }])),
});
const manifestoDe = (mapa) => ({ geracao: 'g1', catalogo: { ...mapa } });

function fontes(canon, resumo, indice, manifesto) {
  const f = {
    'src/data/candidatos.json (canônico)': catalogoCanonico(canonicoDe(canon)),
    'data/itens/resumo.json': catalogoDoResumo(resumoDe(resumo)),
    'data/acervo/indice.json': catalogoDoIndice(indiceDe(indice)),
  };
  if (manifesto) {
    f['data/current.json (catálogo da geração)'] =
      catalogoDoManifesto(manifestoDe(manifesto));
  }
  return f;
}

// --------------------------------------------------------------------------
// a fonte canônica versionada
// --------------------------------------------------------------------------

test('o arquivo canônico existe no repositório e traz os treze da Onda 1', () => {
  const canonico = leCatalogoCanonico();

  assert.deepEqual(canonico, ROSTER);
});

test('os cinco em produção continuam no canônico, com o mesmo nome', () => {
  const canonico = leCatalogoCanonico();

  for (const [slug, nome] of Object.entries(CINCO)) {
    assert.equal(canonico[slug], nome, `'${slug}' saiu ou mudou de nome`);
  }
});

test('candidato sem um único item continua no canônico', () => {
  // Os oito da Onda 1 não coletam nada: se o catálogo fosse derivado do que
  // existe em disco, eles sumiriam do site — e sumir é exatamente o que faz
  // um buraco de cobertura passar por completude.
  const canonico = leCatalogoCanonico();

  assert.equal(Object.keys(canonico).length, 13);
  for (const slug of ['pablo-marcal', 'samara', 'clariana-barao']) {
    assert.ok(slug in canonico, `'${slug}' não está no catálogo canônico`);
  }
});

test('o canônico é um arquivo versionável, não um derivado ignorado', () => {
  // `data/acervo/` e `data/geracoes/` são ignorados de propósito (derivados,
  // regenerados a cada rodada). A autoridade tem de ir para o histórico: se
  // ela puder ser ignorada, "quem deveria estar publicado" deixa de ter
  // registro auditável e vira estado local de uma máquina.
  let ignorado = false;
  try {
    execFileSync('git', ['check-ignore', '-q', 'src/data/candidatos.json'],
      { cwd: PROJETO, stdio: 'ignore' });
    ignorado = true;
  } catch { /* saída não zero = não ignorado, que é o esperado */ }

  assert.equal(ignorado, false,
    'o catálogo canônico está sob .gitignore — derivado não é autoridade');
});

test('canônico vazio é falha, não catálogo', () => {
  assert.throws(() => catalogoCanonico({ candidatos: [] }), /vazio/i);
});

test('canônico com slug repetido é recusado', () => {
  assert.throws(() => catalogoCanonico({
    candidatos: [{ slug: 'a', nome: 'A' }, { slug: 'a', nome: 'A' }],
  }), /repetid/i);
});

test('canônico com entrada sem nome é recusado', () => {
  assert.throws(() => catalogoCanonico({ candidatos: [{ slug: 'a' }] }), /nome/i);
});

// --------------------------------------------------------------------------
// o gate compara os quatro
// --------------------------------------------------------------------------

test('os quatro iguais: nenhuma falha', () => {
  assert.deepEqual(
    comparaCatalogos(fontes(TREZE, TREZE, TREZE, TREZE)), []);
});

test('derivados iguais entre si e MENORES que o canônico: o gate cai', () => {
  // é o caso que passava batido: os dois derivados errados do mesmo jeito
  const { 'candidata-13': _, ...doze } = TREZE;

  const falhas = comparaCatalogos(fontes(TREZE, doze, doze, doze));

  assert.ok(falhas.length >= 3, `esperava falha em cada derivado: ${falhas}`);
  for (const falha of falhas) assert.match(falha, /candidata-13/);
});

test('candidato a mais nos derivados derruba o gate', () => {
  const quatorze = { ...TREZE, 'candidata-14': 'Candidata 14' };

  const falhas = comparaCatalogos(fontes(TREZE, quatorze, quatorze, quatorze));

  assert.ok(falhas.some((f) => /candidata-14/.test(f)));
});

test('nome divergente em um dos derivados derruba o gate', () => {
  const renomeado = { ...TREZE, 'candidata-04': 'Outro Nome' };

  const falhas = comparaCatalogos(fontes(TREZE, renomeado, TREZE, TREZE));

  assert.ok(falhas.some((f) => /Outro Nome/.test(f)), `falhas: ${falhas}`);
});

test('divergência só no catálogo da geração também derruba o gate', () => {
  const { 'candidata-02': _, ...doze } = TREZE;

  const falhas = comparaCatalogos(fontes(TREZE, TREZE, TREZE, doze));

  assert.ok(falhas.some((f) => /candidata-02/.test(f)), `falhas: ${falhas}`);
});

test('catálogo vazio em qualquer fonte é falha, não sucesso silencioso', () => {
  const falhas = comparaCatalogos({
    'src/data/candidatos.json (canônico)': TREZE,
    'data/itens/resumo.json': {},
  });

  assert.ok(falhas.some((f) => /vazio/.test(f)));
});

// --------------------------------------------------------------------------
// o script do gate, de ponta a ponta
// --------------------------------------------------------------------------

function projetoFalso(canon, resumo, indice, manifesto) {
  const base = mkdtempSync(join(tmpdir(), 'gate-catalogo-'));
  mkdirSync(join(base, 'src', 'data'), { recursive: true });
  mkdirSync(join(base, 'data', 'itens'), { recursive: true });
  mkdirSync(join(base, 'data', 'acervo'), { recursive: true });
  writeFileSync(join(base, 'src', 'data', 'candidatos.json'),
    JSON.stringify(canonicoDe(canon)));
  writeFileSync(join(base, 'data', 'itens', 'resumo.json'),
    JSON.stringify(resumoDe(resumo)));
  writeFileSync(join(base, 'data', 'acervo', 'indice.json'),
    JSON.stringify(indiceDe(indice)));
  if (manifesto) {
    writeFileSync(join(base, 'data', 'current.json'), JSON.stringify({
      geracao: 'g1',
      itens: 'itens', acervo: 'acervo',
      pesquisa: 'geracoes/g1/pesquisa/corpus.db',
      catalogo: { ...manifesto },
    }));
  }
  return base;
}

function rodaGate(raiz, env = {}) {
  try {
    const saida = execFileSync(process.execPath,
      [join(PROJETO, 'scripts', 'checa-catalogo.mjs'), raiz],
      { encoding: 'utf8', env: { ...process.env, ...env } });
    return { codigo: 0, saida };
  } catch (e) {
    return { codigo: e.status, saida: (e.stdout || '') + (e.stderr || '') };
  }
}

test('gate passa quando os derivados batem com o canônico', () => {
  const base = projetoFalso(TREZE, TREZE, TREZE, TREZE);
  try {
    const { codigo, saida } = rodaGate(base);
    assert.equal(codigo, 0, saida);
    assert.match(saida, /13/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('gate cai quando falta um candidato nos derivados', () => {
  const { 'candidata-09': _, ...doze } = TREZE;
  const base = projetoFalso(TREZE, doze, doze, doze);
  try {
    const { codigo, saida } = rodaGate(base);
    assert.notEqual(codigo, 0);
    assert.match(saida, /candidata-09/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('nenhuma variável de ambiente desliga a comparação canônica', () => {
  const { 'candidata-09': _, ...doze } = TREZE;
  const base = projetoFalso(TREZE, doze, doze, doze);
  try {
    for (const env of [{ CATALOGO_ESPERADO: '' },
      { CATALOGO_ESPERADO: Object.keys(doze).join(',') },
      { CI: 'false' }]) {
      const { codigo } = rodaGate(base, env);
      assert.notEqual(codigo, 0,
        `o gate passou com env ${JSON.stringify(env)} — modo silencioso por `
        + 'variável de ambiente é exatamente o que não pode existir');
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('sem a fonte canônica o gate FALHA (não passa "por não ter autoridade")', () => {
  const base = projetoFalso(TREZE, TREZE, TREZE, TREZE);
  try {
    rmSync(join(base, 'src', 'data', 'candidatos.json'));
    const { codigo, saida } = rodaGate(base);
    assert.notEqual(codigo, 0);
    assert.match(saida, /candidatos\.json/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('gate roda contra o projeto real e passa com os treze', () => {
  const { codigo, saida } = rodaGate(PROJETO);

  assert.equal(codigo, 0, saida);
  assert.match(saida, /OK \(catálogo\): 13 candidatos/);
});
