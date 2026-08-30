/**
 * O site resolve os dados pelo MANIFESTO da geração ativa — o mesmo que a
 * pesquisa resolve.
 *
 * `data/itens` e `data/acervo` eram diretórios fixos, promovidos por
 * exportações independentes. Cada uma era atômica em si e mesmo assim o
 * conjunto ficava incoerente: o site lia `itens` de uma geração e `acervo` de
 * outra, e a pesquisa respondia de um terceiro índice. Agora os três produtos
 * nascem sob `data/geracoes/<id>/` e viram públicos pela troca de UM ponteiro,
 * `data/current.json`.
 *
 * A compatibilidade importa tanto quanto a resolução: enquanto a migração não
 * acontece — e ela é operação separada, não efeito colateral de um deploy —
 * não existe `current.json` no repositório, e o site tem de continuar lendo
 * `data/itens` e `data/acervo` exatamente como hoje.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leDados, leManifesto, raizDados } from '../src/lib/dados.mjs';
import { raizAcervo } from '../src/lib/acervo.mjs';
import { raizItens } from '../src/lib/itens.mjs';

const PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function comManifesto({ geracao = 'g1', manifesto = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'manifesto-'));
  const gen = join(base, 'data', 'geracoes', geracao);
  mkdirSync(join(gen, 'itens', 'lula'), { recursive: true });
  mkdirSync(join(gen, 'acervo', 'lula'), { recursive: true });
  writeFileSync(join(gen, 'itens', 'resumo.json'),
    JSON.stringify({ candidatos: { lula: { nome: 'Lula', total: 1, anos: [] } } }));
  writeFileSync(join(gen, 'acervo', 'indice.json'),
    JSON.stringify({ candidatos: { lula: { nome: 'Lula', tipos: {} } } }));
  if (manifesto) {
    writeFileSync(join(base, 'data', 'current.json'), JSON.stringify({
      geracao,
      itens: `geracoes/${geracao}/itens`,
      acervo: `geracoes/${geracao}/acervo`,
      pesquisa: `geracoes/${geracao}/pesquisa/corpus.db`,
      catalogo: { lula: 'Lula' },
    }));
  }
  return { base, gen };
}

function legado() {
  const base = mkdtempSync(join(tmpdir(), 'legado-'));
  mkdirSync(join(base, 'data', 'itens'), { recursive: true });
  mkdirSync(join(base, 'data', 'acervo'), { recursive: true });
  writeFileSync(join(base, 'data', 'itens', 'resumo.json'),
    JSON.stringify({ candidatos: { lula: { nome: 'Lula', total: 2, anos: [] } } }));
  writeFileSync(join(base, 'data', 'acervo', 'indice.json'),
    JSON.stringify({ candidatos: { lula: { nome: 'Lula', tipos: {} } } }));
  return base;
}

test('com manifesto, itens e acervo saem da MESMA geração', () => {
  const { base, gen } = comManifesto();
  try {
    assert.equal(raizItens(base), join(gen, 'itens'));
    assert.equal(raizAcervo(base), join(gen, 'acervo'));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('sem manifesto, o caminho legado continua valendo', () => {
  const base = legado();
  try {
    assert.equal(raizItens(base), join(base, 'data', 'itens'));
    assert.equal(raizAcervo(base), join(base, 'data', 'acervo'));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('leManifesto devolve null quando não há geração publicada', () => {
  const base = legado();
  try {
    assert.equal(leManifesto(base), null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('leManifesto devolve o ponteiro quando há', () => {
  const { base } = comManifesto({ geracao: 'gX' });
  try {
    assert.equal(leManifesto(base).geracao, 'gX');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('manifesto apontando para geração que não existe é erro, não silêncio', () => {
  const { base } = comManifesto();
  try {
    writeFileSync(join(base, 'data', 'current.json'), JSON.stringify({
      geracao: 'sumiu', itens: 'geracoes/sumiu/itens',
      acervo: 'geracoes/sumiu/acervo',
    }));
    assert.throws(() => raizItens(base), /sumiu/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('leDados abre o arquivo da geração ativa', () => {
  const { base } = comManifesto();
  try {
    assert.equal(leDados('itens', 'resumo.json', base).candidatos.lula.total, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('leDados no legado abre o arquivo legado', () => {
  const base = legado();
  try {
    assert.equal(leDados('itens', 'resumo.json', base).candidatos.lula.total, 2);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('o projeto real resolve pelo manifesto quando ele existe, senão pelo legado', () => {
  const m = leManifesto();
  assert.equal(raizItens(), join(PROJETO, 'data', m?.itens ?? 'itens'));
});

test('nenhuma página importa data/itens ou data/acervo por caminho fixo', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const paginas = [];
  const varre = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) varre(join(dir, e.name));
      else if (e.name.endsWith('.astro')) paginas.push(join(dir, e.name));
    }
  };
  varre(join(PROJETO, 'src', 'pages'));

  const culpadas = paginas.filter((p) =>
    /^\s*import\s+\w+\s+from\s+['"][^'"]*data\/(itens|acervo)\//m
      .test(readFileSync(p, 'utf8')));

  assert.deepEqual(culpadas, [],
    'página lendo data/ por caminho fixo não passa pelo manifesto — ficaria '
    + 'presa a uma geração enquanto o resto do site anda');
});
