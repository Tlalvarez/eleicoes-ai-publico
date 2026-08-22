/**
 * Equivalência entre as páginas de candidato "antes" (globs eager sobre
 * data/itens) e o "depois" (src/lib/itens.mjs, um arquivo por vez).
 *
 * Mesmas duas perguntas do acervo: o conteúdo continua o mesmo, e cada
 * página lê só o JSON de que precisa? Fixture sintética em diretório
 * temporário — dado gerado real não vira fixture versionada.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import {
  porAnoAntes, itensDoAnoAntes, mencoesAntes, recentesAntes,
} from './referencia-itens-eager.mjs';
import {
  anosDoArquivo, carregaAnoItens, carregaRecentes, mencoesDoCandidato, resumoPorAno,
} from '../src/lib/itens.mjs';

let base, raiz, resumo;

const item = (tipo, voz, extra = {}) => ({ tipo, voz, url: `https://exemplo/${tipo}`, ...extra });

before(() => {
  base = mkdtempSync(join(tmpdir(), 'itens-fixture-'));
  raiz = join(base, 'data', 'itens');

  const escreve = (rel, valor) => {
    const alvo = join(raiz, rel);
    mkdirSync(join(alvo, '..'), { recursive: true });
    writeFileSync(alvo, JSON.stringify(valor));
  };

  escreve('ana/2025.json', [
    item('post-x', 'propria', { data: '2025-03-01' }),
    item('post-instagram', 'propria', { data: '2025-04-02' }),
    item('video', 'propria', { data: '2025-05-03' }),
    item('mencao', 'terceiro', { data: '2025-06-04' }),
  ]);
  escreve('ana/2024.json', [
    item('discurso', 'propria', { data: '2024-01-01' }),
    item('post-x', 'terceiro', { data: '2024-02-02' }),
  ]);
  // ano sem data: entra em menções (c.anos inteiro) e sai do arquivo por ano
  escreve('ana/0000.json', [item('mencao', 'terceiro', {})]);
  escreve('ana/recentes.json', [
    item('video', 'propria', { data: '2026-08-01' }),
    item('mencao', 'terceiro', { data: '2026-08-02' }),
  ]);
  escreve('bia/2026.json', [item('artigo', 'propria', { data: '2026-07-07' })]);
  escreve('bia/recentes.json', []);

  resumo = {
    janela_recentes_dias: 30,
    candidatos: {
      // 2023 está em anos mas não tem arquivo — o `?? []` do glob tem de ser preservado
      ana: { nome: 'Ana', total: 7, anos: ['2025', '2024', '2023', '0000'] },
      bia: { nome: 'Bia', total: 1, anos: ['2026'] },
    },
  };
  writeFileSync(join(raiz, 'resumo.json'), JSON.stringify(resumo));
});

after(() => rmSync(base, { recursive: true, force: true }));

test('arquivo do candidato: mesmos contadores por ano do "antes"', () => {
  for (const [slug, c] of Object.entries(resumo.candidatos)) {
    const antes = porAnoAntes(raiz, slug, c);
    const depois = resumoPorAno(raiz, slug, anosDoArquivo(c));
    assert.deepEqual(depois, antes, slug);
  }
  // e o conteúdo esperado, explicitado
  assert.deepEqual(resumoPorAno(raiz, 'ana', anosDoArquivo(resumo.candidatos.ana)), [
    { ano: '2025', total: 3, posts: 2, longos: 1 },
    { ano: '2024', total: 1, posts: 0, longos: 1 },
    { ano: '2023', total: 0, posts: 0, longos: 0 },
  ]);
});

test('arquivo por ano: mesmos itens de voz própria do "antes"', () => {
  for (const [slug, ano] of [['ana', '2025'], ['ana', '2024'], ['ana', '2023'], ['bia', '2026']]) {
    const antes = itensDoAnoAntes(raiz, slug, ano);
    const depois = carregaAnoItens(raiz, slug, ano).filter((i) => i.voz !== 'terceiro');
    assert.deepEqual(depois, antes, `${slug}/${ano}`);
  }
});

test('menções: mesmos itens de terceiro do "antes", em todos os anos', () => {
  for (const [slug, c] of Object.entries(resumo.candidatos)) {
    assert.deepEqual(mencoesDoCandidato(raiz, slug, c.anos), mencoesAntes(raiz, slug, c), slug);
  }
  assert.equal(mencoesDoCandidato(raiz, 'ana', resumo.candidatos.ana.anos).length, 3);
  assert.equal(mencoesDoCandidato(raiz, 'bia', resumo.candidatos.bia.anos).length, 0);
});

test('recentes: mesmo conteúdo do "antes"', () => {
  for (const slug of Object.keys(resumo.candidatos)) {
    assert.deepEqual(carregaRecentes(raiz, slug), recentesAntes(raiz, slug), slug);
  }
});

test('ano listado no resumo mas sem arquivo devolve lista vazia', () => {
  assert.deepEqual(carregaAnoItens(raiz, 'ana', '2023'), []);
  assert.deepEqual(carregaRecentes(raiz, 'inexistente'), []);
});

test('o arquivo por ano lê só o JSON do slug/ano pedido', () => {
  const lidos = [];
  const espia = (caminho) => { lidos.push(relative(raiz, caminho)); return JSON.parse('[]'); };
  carregaAnoItens(raiz, 'ana', '2025', espia);
  assert.deepEqual(lidos, [join('ana', '2025.json')]);
});

test('a página do candidato lê só o recentes.json daquele slug', () => {
  const lidos = [];
  const espia = (caminho) => { lidos.push(relative(raiz, caminho)); return JSON.parse('[]'); };
  carregaRecentes(raiz, 'bia', espia);
  assert.deepEqual(lidos, [join('bia', 'recentes.json')]);
});

test('arquivo e menções abrem só os anos daquele candidato, nunca de outro', () => {
  const espiar = (fn) => {
    const lidos = [];
    fn((caminho) => {
      lidos.push(relative(raiz, caminho));
      return JSON.parse(readFileSync(caminho, 'utf8'));
    });
    return lidos;
  };
  const doArquivo = espiar((ler) => resumoPorAno(raiz, 'ana', anosDoArquivo(resumo.candidatos.ana), { ler }));
  const deMencoes = espiar((ler) => mencoesDoCandidato(raiz, 'ana', resumo.candidatos.ana.anos, { ler }));
  for (const lidos of [doArquivo, deMencoes]) {
    assert.ok(lidos.length > 0);
    assert.ok(lidos.every((c) => c.startsWith(`ana${sep}`)),
      `abriu arquivo de outro candidato: ${lidos}`);
    assert.ok(!lidos.some((c) => c.includes('recentes')), `abriu recentes à toa: ${lidos}`);
  }
});
