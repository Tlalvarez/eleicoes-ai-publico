/**
 * Equivalência entre o acervo "antes" (globs eager, tudo em memória) e o
 * "depois" (src/lib/acervo.mjs, um arquivo por vez).
 *
 * Duas perguntas:
 *   1. as rotas continuam as mesmas — candidatos, tipos, anos, meses e itens?
 *   2. cada página lê SÓ o JSON de que precisa?
 *
 * A fixture é sintética e montada em diretório temporário: dado gerado real
 * não vira fixture versionada.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { rotasMesAntes, rotasItemAntes, itensDoMesAntes } from './referencia-eager.mjs';
import {
  carregaAno, carregaItem, ehPaginadoPorMes, rotasAno, rotasItem, rotasMes,
} from '../src/lib/acervo.mjs';

const LIMITE = 3;   // fixture pequena: o limite real (400) é parâmetro
let base, raiz, indice;

const post = (data, n) => Array.from({ length: n }, (_, k) => ({
  id: `${data ?? 'sem-data'}-${k}`, data, texto: `post ${k}`, url: 'https://exemplo/x',
}));

before(() => {
  base = mkdtempSync(join(tmpdir(), 'acervo-fixture-'));
  raiz = join(base, 'data', 'acervo');

  const escreve = (rel, valor) => {
    const alvo = join(raiz, rel);
    mkdirSync(join(alvo, '..'), { recursive: true });
    writeFileSync(alvo, JSON.stringify(valor));
  };

  // ana/post-x/2025: 5 itens (> limite) em 2 meses + 1 sem data
  escreve('ana/post-x/2025.json', [
    ...post('2025-03-01', 2), ...post('2025-07-14', 2), ...post(null, 1),
  ]);
  // ana/post-x/2024: 2 itens (<= limite) — não vira página mensal
  escreve('ana/post-x/2024.json', post('2024-05-02', 2));
  // ana/video/2025: tipo não paginado, ainda que grande
  escreve('ana/video/2025.json', post('2025-01-09', 9));
  // ana/post-x/0000: sem data, acima do limite
  escreve('ana/post-x/0000.json', post(null, 4));
  // bia/post-instagram/2026: 4 itens em 1 mês
  escreve('bia/post-instagram/2026.json', post('2026-02-20', 4));
  // transcrições — casam com o glob '*/*/*.json' do "antes", mas não são rotas mensais
  escreve('ana/itens/vid1.json', { id: 'vid1', titulo: 'A', transcricao: '[00:00:01] oi' });
  escreve('ana/itens/sem-data-vid2.json', { id: 'vid2', titulo: 'B', transcricao: '' });
  escreve('bia/itens/vid3.json', { id: 'vid3', titulo: 'C', transcricao: '[00:00:02] ola' });

  indice = {
    candidatos: {
      ana: { nome: 'Ana', tipos: {
        'post-x': { total: 11, anos: { 2025: 5, 2024: 2, '0000': 4 } },
        video: { total: 9, anos: { 2025: 9 } },
      } },
      bia: { nome: 'Bia', tipos: {
        'post-instagram': { total: 4, anos: { 2026: 4 } },
      } },
    },
  };
  writeFileSync(join(raiz, 'indice.json'), JSON.stringify(indice));
});

after(() => rmSync(base, { recursive: true, force: true }));

const chave = (p) => [p.params.slug, p.params.tipo, p.params.ano, p.params.mes, p.params.id]
  .filter((v) => v !== undefined).join('/');
const ordenado = (rotas) => rotas.map(chave).sort();

test('rotas mensais: mesmos candidatos, tipos, anos e meses do "antes"', () => {
  const antes = ordenado(rotasMesAntes(raiz, LIMITE));
  const depois = ordenado(rotasMes(raiz, indice, { limite: LIMITE }));
  assert.deepEqual(depois, antes);
  assert.ok(antes.length > 0, 'fixture tem de gerar alguma rota mensal');
  // e o conteúdo esperado, explicitado
  assert.deepEqual(antes, ['ana/post-x/0000/00', 'ana/post-x/2025/00',
    'ana/post-x/2025/03', 'ana/post-x/2025/07', 'bia/post-instagram/2026/02']);
});

test('rotas de item: mesmos itens do "antes"', () => {
  assert.deepEqual(ordenado(rotasItem(raiz)), ordenado(rotasItemAntes(raiz)));
  assert.deepEqual(ordenado(rotasItem(raiz)), ['ana/sem-data-vid2', 'ana/vid1', 'bia/vid3']);
});

test('rotas anuais: um par slug/tipo/ano por arquivo do acervo', () => {
  assert.deepEqual(ordenado(rotasAno(indice)),
    ['ana/post-x/0000', 'ana/post-x/2024', 'ana/post-x/2025', 'ana/video/2025',
     'bia/post-instagram/2026']);
});

test('a página mensal lê só o JSON do slug/tipo/ano pedido', () => {
  const lidos = [];
  const espia = (caminho) => { lidos.push(relative(raiz, caminho)); return JSON.parse('[]'); };
  carregaAno(raiz, 'ana', 'post-x', '2025', espia);
  assert.deepEqual(lidos, [join('ana', 'post-x', '2025.json')]);
});

test('a página mensal devolve os mesmos itens do "antes"', () => {
  for (const [slug, tipo, ano, mes] of [['ana', 'post-x', '2025', '03'],
    ['ana', 'post-x', '2025', '00'], ['bia', 'post-instagram', '2026', '02']]) {
    const antes = itensDoMesAntes(raiz, slug, tipo, ano, mes);
    const depois = carregaAno(raiz, slug, tipo, ano)
      .filter((i) => (i.data ? i.data.slice(5, 7) : '00') === mes);
    assert.deepEqual(depois, antes, `${slug}/${tipo}/${ano}/${mes}`);
    assert.ok(antes.length > 0);
  }
});

test('a página de item lê só a transcrição daquele item', () => {
  const lidos = [];
  const espia = (caminho) => { lidos.push(relative(raiz, caminho)); return JSON.parse('{}'); };
  carregaItem(raiz, 'ana', 'vid1', espia);
  assert.deepEqual(lidos, [join('ana', 'itens', 'vid1.json')]);
});

test('montar as rotas mensais nunca abre transcrição nem tipo não paginado', () => {
  const lidos = [];
  const espia = (caminho) => {
    lidos.push(relative(raiz, caminho));
    return JSON.parse(readFileSync(caminho, 'utf8'));
  };
  rotasMes(raiz, indice, { limite: LIMITE, ler: espia });
  assert.ok(lidos.length > 0);
  assert.ok(!lidos.some((c) => c.includes('itens')), `abriu transcrição: ${lidos}`);
  assert.ok(!lidos.some((c) => c.includes('video')), `abriu tipo não paginado: ${lidos}`);
  assert.ok(lidos.length < 8, `leu ${lidos.length} arquivos — devia ler só os anos de post`);
});

test('o índice de meses da página do ano não aponta para rota inexistente', () => {
  const geradas = new Set(rotasMes(raiz, indice, { limite: LIMITE }).map(chave));
  for (const { params: { slug, tipo, ano } } of rotasAno(indice)) {
    const itens = carregaAno(raiz, slug, tipo, ano);
    if (!ehPaginadoPorMes(tipo, itens, LIMITE)) continue;
    for (const mes of new Set(itens.map((i) => (i.data ? i.data.slice(5, 7) : '00')))) {
      assert.ok(geradas.has(`${slug}/${tipo}/${ano}/${mes}`),
        `a página do ano linkaria /acervo/${slug}/${tipo}/${ano}/${mes}, que não é gerada`);
    }
  }
});
