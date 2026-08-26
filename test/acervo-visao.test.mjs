/**
 * A visão de /acervo: todo o acervo por candidato e por fonte.
 *
 * Três regras que a página não pode quebrar, e que por isso vivem aqui em vez
 * de dentro do `.astro`:
 *
 *  1. **Todo candidato do catálogo aparece.** Inclusive o que não tem um único
 *     registro. Sumir com quem não tem material transforma buraco de cobertura
 *     em aparência de completude — é a mesma razão pela qual
 *     `data/itens/resumo.json` lista candidato com zero item.
 *
 *  2. **Tratamento visual igual.** As fontes saem na MESMA ordem para todos,
 *     fixa e declarada, nunca por volume. Ordenar as fontes de cada candidato
 *     por quantidade faria a página desenhar um perfil diferente para cada um
 *     a partir do que o coletor capturou, que não é medida de nada. Os
 *     candidatos saem em ordem alfabética, pela mesma razão.
 *
 *  3. **O acervo é superfície de evidência, não de posição.** A visão carrega
 *     registro, proveniência, cobertura e link — e nenhum campo de juízo,
 *     destaque ou ordenação por relevância.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ORDEM_TIPOS, combina, normaliza, opcoesDeFiltro, rotuloAno, visaoDoAcervo,
} from '../src/lib/acervo-visao.mjs';

/** Fixture sintética: ordem de inserção e volumes contrários à ordem final. */
const INDICE = {
  candidatos: {
    'zuleide-alves': {
      nome: 'Zuleide Alves',
      tipos: {
        'post-x': { total: 900, anos: { 2025: 400, 2026: 500 } },
        video: { total: 10, anos: { 2024: 4, 2026: 6, '0000': 0 } },
      },
    },
    'ana-brito': {
      nome: 'Ana Brito',
      tipos: {
        video: { total: 7, anos: { 2026: 7 } },
        discurso: { total: 3, anos: { 2023: 3 } },
      },
    },
    'carlos-dias': { nome: 'Carlos Dias', tipos: {} },
  },
};

const visao = () => visaoDoAcervo(INDICE);
const porSlug = (v, slug) => v.candidatos.find((c) => c.slug === slug);

// --------------------------------------------------------------------------
// cobertura
// --------------------------------------------------------------------------

test('todo candidato do índice aparece, inclusive sem um único registro', () => {
  const v = visao();

  assert.deepEqual(v.candidatos.map((c) => c.slug).sort(),
    ['ana-brito', 'carlos-dias', 'zuleide-alves']);
});

test('candidato sem coleta é marcado como LACUNA, não escondido', () => {
  const c = porSlug(visao(), 'carlos-dias');

  assert.equal(c.semColeta, true);
  assert.equal(c.total, 0);
  assert.deepEqual(c.fontes, []);
});

test('os totais separam quem tem coleta de quem não tem', () => {
  const { totais } = visao();

  assert.equal(totais.candidatos, 3);
  assert.equal(totais.comColeta, 2);
  assert.equal(totais.semColeta, 1);
  assert.equal(totais.registros, 900 + 10 + 7 + 3);
});

// --------------------------------------------------------------------------
// tratamento igual
// --------------------------------------------------------------------------

test('candidatos em ordem alfabética por nome — nunca por volume', () => {
  assert.deepEqual(visao().candidatos.map((c) => c.nome),
    ['Ana Brito', 'Carlos Dias', 'Zuleide Alves']);
});

test('as fontes saem na ordem canônica, igual para todos', () => {
  const v = visao();
  const posicao = (slug) => porSlug(v, slug).fontes.map((f) => ORDEM_TIPOS.indexOf(f.tipo));

  for (const slug of ['ana-brito', 'zuleide-alves']) {
    const p = posicao(slug);
    assert.deepEqual(p, [...p].sort((a, b) => a - b),
      `${slug} não segue a ordem canônica de fontes`);
  }
  // e o de mais volume NÃO vem primeiro só por isso
  assert.equal(porSlug(v, 'zuleide-alves').fontes[0].tipo, 'video');
});

test('tipo fora da ordem canônica entra no fim, com o próprio nome', () => {
  const v = visaoDoAcervo({ candidatos: { x: { nome: 'X',
    tipos: { 'formato-novo': { total: 1, anos: { 2026: 1 } },
      video: { total: 1, anos: { 2026: 1 } } } } } });

  assert.deepEqual(v.candidatos[0].fontes.map((f) => f.tipo), ['video', 'formato-novo']);
  assert.equal(v.candidatos[0].fontes[1].rotulo, 'formato-novo');
});

test('a visão não tem campo de juízo, destaque ou ranking', () => {
  const proibidos = /destaque|relevancia|relevância|score|nota|ranking|posicao|posição/i;
  const serializada = JSON.stringify(visao());

  assert.doesNotMatch(serializada, proibidos);
});

// --------------------------------------------------------------------------
// proveniência e navegação
// --------------------------------------------------------------------------

test('cada fonte linka o hub do candidato e cada ano linka a própria página', () => {
  const c = porSlug(visao(), 'ana-brito');

  assert.equal(c.href, '/acervo/ana-brito');
  const video = c.fontes.find((f) => f.tipo === 'video');
  assert.equal(video.anos[0].href, '/acervo/ana-brito/video/2026');
});

test('anos em ordem decrescente, e "sem data" por último', () => {
  const video = porSlug(visao(), 'zuleide-alves').fontes.find((f) => f.tipo === 'video');

  assert.deepEqual(video.anos.map((a) => a.ano), ['2026', '2024', '0000']);
  assert.equal(rotuloAno('0000'), 'sem data');
  assert.equal(rotuloAno('2026'), '2026');
});

test('a fonte declara o canal público de origem, não só o tipo interno', () => {
  const video = porSlug(visao(), 'ana-brito').fontes.find((f) => f.tipo === 'video');

  assert.equal(video.tipo, 'video');
  assert.match(video.rotulo, /v[ií]deo/i);
  assert.match(video.fonte, /YouTube/i);
});

test('os anos do candidato são a união dos anos de todas as fontes', () => {
  assert.deepEqual(porSlug(visao(), 'zuleide-alves').anos, ['2026', '2025', '2024', '0000']);
});

test('índice vazio não quebra e não anuncia completude', () => {
  const v = visaoDoAcervo({});

  assert.deepEqual(v.candidatos, []);
  assert.equal(v.totais.registros, 0);
});

// --------------------------------------------------------------------------
// filtros (o mesmo predicado que a página usa no cliente)
// --------------------------------------------------------------------------

const GRUPO = {
  candidato: 'ana-brito', nome: 'Ana Brito', fonte: 'video',
  anos: ['2026', '2024'], busca: 'Ana Brito vídeos youtube',
};

test('sem filtro, tudo passa', () => {
  assert.equal(combina(GRUPO, {}), true);
  assert.equal(combina(GRUPO, { candidato: '', fonte: '', ano: '', busca: '' }), true);
});

test('filtra por candidato, por fonte e por ano', () => {
  assert.equal(combina(GRUPO, { candidato: 'ana-brito' }), true);
  assert.equal(combina(GRUPO, { candidato: 'outro' }), false);
  assert.equal(combina(GRUPO, { fonte: 'video' }), true);
  assert.equal(combina(GRUPO, { fonte: 'post-x' }), false);
  assert.equal(combina(GRUPO, { ano: '2024' }), true);
  assert.equal(combina(GRUPO, { ano: '2023' }), false);
});

test('os filtros se combinam por E, não por OU', () => {
  assert.equal(combina(GRUPO, { candidato: 'ana-brito', fonte: 'post-x' }), false);
  assert.equal(combina(GRUPO, { candidato: 'ana-brito', ano: '2026' }), true);
});

test('a busca ignora acento e caixa', () => {
  assert.equal(combina({ ...GRUPO, busca: 'Flávio Bolsonaro' }, { busca: 'flavio' }), true);
  assert.equal(combina({ ...GRUPO, busca: 'Flávio Bolsonaro' }, { busca: 'FLÁVIO' }), true);
  assert.equal(combina({ ...GRUPO, busca: 'Flávio Bolsonaro' }, { busca: 'zema' }), false);
  assert.equal(normaliza('Pablo Marçal'), 'pablo marcal');
});

test('as opções de filtro saem da própria visão, sem lista escrita à mão', () => {
  const o = opcoesDeFiltro(visao());

  assert.deepEqual(o.candidatos.map((x) => x.valor),
    ['ana-brito', 'carlos-dias', 'zuleide-alves']);
  assert.deepEqual(o.anos.map((x) => x.valor), ['2026', '2025', '2024', '2023', '0000']);
  assert.deepEqual(o.fontes.map((x) => x.valor), ['video', 'discurso', 'post-x']);
  // o seletor mostra o canal público, não o identificador interno do tipo
  assert.match(o.fontes.find((x) => x.valor === 'post-x').rotulo, /X/);
  assert.doesNotMatch(o.fontes.find((x) => x.valor === 'post-x').rotulo, /post-x/);
});

test('a lista de anos das opções não repete nem inclui ano inexistente', () => {
  const anos = opcoesDeFiltro(visao()).anos.map((x) => x.valor);

  assert.equal(new Set(anos).size, anos.length);
  assert.equal(anos.includes('2019'), false);
});
