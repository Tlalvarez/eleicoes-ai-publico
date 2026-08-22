/**
 * A raiz dos dados sai do MÓDULO, não do diretório de onde alguém chamou.
 *
 * `raizDados` resolvia a partir de `process.cwd()` e subia procurando um
 * `data/<sub>/<marcador>`. Duas consequências:
 *
 *  - acoplamento ao diretório de execução: importar este módulo de fora da
 *    raiz do projeto (build por ferramenta de monorepo, script chamado de
 *    /tmp) quebrava com "não encontrado", mesmo com o projeto inteiro ali;
 *  - a busca ascendente podia casar, em silêncio, um `data/` homônimo de um
 *    diretório acima — o build lendo dado de outro projeto sem avisar.
 *
 * A raiz agora vem de `import.meta.url` (o módulo sabe onde ele mesmo está), e
 * quem precisar de outra raiz passa explicitamente. Sem busca ascendente.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { raizDados } from '../src/lib/dados.mjs';
import { raizAcervo } from '../src/lib/acervo.mjs';
import { raizItens } from '../src/lib/itens.mjs';

const PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('a raiz dos dados é a do projeto, qualquer que seja o cwd', () => {
  assert.equal(raizItens(), join(PROJETO, 'data', 'itens'));
  assert.equal(raizAcervo(), join(PROJETO, 'data', 'acervo'));
});

test('importar e executar a partir de /tmp resolve a mesma raiz', () => {
  const fora = mkdtempSync(join(tmpdir(), 'fora-do-projeto-'));
  try {
    const script = `
      import { raizItens } from ${JSON.stringify(join(PROJETO, 'src/lib/itens.mjs'))};
      import { raizAcervo } from ${JSON.stringify(join(PROJETO, 'src/lib/acervo.mjs'))};
      process.stdout.write(JSON.stringify([raizItens(), raizAcervo()]));
    `;
    const saida = execFileSync(process.execPath, ['--input-type=module', '-e', script],
      { cwd: fora, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(saida),
      [join(PROJETO, 'data', 'itens'), join(PROJETO, 'data', 'acervo')]);
  } finally {
    rmSync(fora, { recursive: true, force: true });
  }
});

test('uma raiz explícita é respeitada — é assim que o teste monta fixture', () => {
  const base = mkdtempSync(join(tmpdir(), 'raiz-explicita-'));
  try {
    mkdirSync(join(base, 'data', 'itens'), { recursive: true });
    writeFileSync(join(base, 'data', 'itens', 'resumo.json'), '{}');
    assert.equal(raizItens(base), join(base, 'data', 'itens'));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('não há busca ascendente: raiz sem os dados falha, não sobe', () => {
  const base = mkdtempSync(join(tmpdir(), 'raiz-vazia-'));
  try {
    // o ancestral TEM um data/itens/resumo.json; a raiz pedida, não
    mkdirSync(join(base, 'data', 'itens'), { recursive: true });
    writeFileSync(join(base, 'data', 'itens', 'resumo.json'), '{"candidatos":{}}');
    const filho = join(base, 'sub', 'projeto');
    mkdirSync(filho, { recursive: true });

    assert.throws(() => raizItens(filho), /resumo\.json/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a mensagem de erro diz qual caminho foi procurado', () => {
  const base = mkdtempSync(join(tmpdir(), 'sem-dados-'));
  try {
    assert.throws(() => raizDados('acervo', 'indice.json', base),
      (e) => e.message.includes(join(base, 'data', 'acervo', 'indice.json')));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
