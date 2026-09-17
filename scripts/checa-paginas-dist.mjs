#!/usr/bin/env node
/**
 * Gate do dist: as páginas da comparação existem e trazem o que prometem.
 *
 * O que se confere no HTML construído, não no código-fonte:
 *   · a home É a comparação do primeiro tema (16/09) e se confere como tal:
 *     colunas, cartões, seletor, caixa de temas e dados embutidos. Ela linka
 *     TODAS as páginas com comparação pronta (data/comparacao/presidente/*.json)
 *     — tema exportado e sem link é tema invisível;
 *   · o primeiro tema NÃO tem página própria: o endereço dele redireciona para
 *     a home, e um arquivo em dist/ seria servido no lugar do redirecionamento;
 *   · cada /presidente/<tema>.html traz uma coluna por candidato do JSON, um
 *     cartão por proposta, o seletor de candidatos e a caixa de temas;
 *   · /governador/<uf>.html existe para as 27 UFs; sem dados, diz "em
 *     preparação"; com dados, linka cada tema pronto, e cada tema existe;
 *   · nenhuma página construída traz o chat (formulário de pergunta) nem
 *     endereço de resposta guardada — o produto mudou e o dist tem de dizer.
 *
 * Uso: npm run build && npm run test:paginas-dist
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CARGOS_POR_UF, UFS } from '../src/lib/cargos.mjs';
import { comparacao, paginaPorId, paginasProntas, ufsProntas } from '../src/lib/comparacao-dados.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const falhas = [];
const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('FALHOU (páginas): dist/index.html não existe — rode `npm run build` antes.');
  process.exit(1);
}
const le = (rel) => {
  const caminho = join(DIST, rel);
  if (!existsSync(caminho)) { falhas.push(`${rel}: não foi construída`); return ''; }
  return readFileSync(caminho, 'utf8');
};
const contaLinks = (html, href) => (html.match(new RegExp(`href="${escapa(href)}"`, 'g')) ?? []).length;

/** Uma página de tema: colunas, cartões, seletor, faixa. */
function confereTema(rel, dados, base, paginas) {
  const html = le(rel);
  if (!html) return;
  for (const c of dados.candidatos) {
    if (!new RegExp(`class="candidato" data-slug="${escapa(c.slug)}"`).test(html)) falhas.push(`${rel}: sem a coluna de ${c.slug}`);
    if (!new RegExp(`class="chip" aria-pressed="true" data-slug="${escapa(c.slug)}"`).test(html)) falhas.push(`${rel}: sem o chip de ${c.slug} no seletor`);
  }
  // uma proposta pode virar mais de um cartão (candidatos não adjacentes): conta-se por id
  const ids = new Set([...html.matchAll(/<button[^>]*class="proposta[^"]*"[^>]*data-p="([^"]+)"/g)].map((m) => m[1]));
  if (ids.size !== dados.propostas.length) {
    falhas.push(`${rel}: ${ids.size} propostas com cartão para ${dados.propostas.length} do JSON`);
  }
  for (const id of paginas) {
    if (!new RegExp(`<a href="${escapa(base)}/${escapa(id)}"[^>]*data-tema="${escapa(id)}"`).test(html)) falhas.push(`${rel}: o menu de temas não linka ${base}/${id}`);
  }
  if (!new RegExp(`data-tema="${escapa(dados.pagina)}" aria-current="page"`).test(html)) falhas.push(`${rel}: o menu de temas não marca o tema atual`);
  if (!new RegExp(`class="seletor-tema" data-base="${escapa(base)}"`).test(html)) falhas.push(`${rel}: o menu de temas não sabe o escopo (${base})`);
  if (!/<dialog class="trechos"/.test(html)) falhas.push(`${rel}: sem o painel de trechos`);
  if (!/__comparacao/.test(html)) falhas.push(`${rel}: os dados da comparação não foram embutidos`);
}

// ------------------------------------------------------------- presidente
const prontas = paginasProntas('presidente');
if (!prontas.length) falhas.push('data/comparacao/presidente/ não tem página nenhuma');
const home = le('index.html');
// /presidente redireciona para a home (13/09): o hub não existe mais
if (existsSync(join(DIST, 'presidente.html')) && !/http-equiv=["']refresh["']/i.test(readFileSync(join(DIST, 'presidente.html'), 'utf8'))) {
  falhas.push('presidente.html: o hub voltou a existir como página — ele redireciona para a home');
}
// o primeiro tema mora na home; os demais têm página própria
const naHome = prontas[0];
if (existsSync(join(DIST, 'presidente', `${naHome}.html`))) {
  falhas.push(`presidente/${naHome}.html: existe como arquivo, e a Cloudflare o serviria no lugar do redirecionamento para a home`);
}
confereTema('index.html', comparacao('presidente', null, naHome), '/presidente', prontas);
for (const id of prontas) {
  if (!contaLinks(home, `/presidente/${id}`)) falhas.push(`index.html: não linka /presidente/${id}`);
  if (id === naHome) continue;
  confereTema(join('presidente', `${id}.html`), comparacao('presidente', null, id), '/presidente', prontas);
}
for (const id of prontas) {
  if (!paginaPorId(id)) falhas.push(`presidente/${id}.json não está em paginas.json`);
}

// -------------------------------------------------------------- por UF
for (const cargo of CARGOS_POR_UF) {
  const comDados = new Set(ufsProntas(cargo.slug));
  // o cargo no menu é linkado pelo cabeçalho de toda página; a escolha da UF é a página do cargo
  if (cargo.menu && !contaLinks(home, cargo.href)) falhas.push(`index.html: o menu não linka ${cargo.href}`);
  if (!cargo.menu && contaLinks(home, cargo.href)) falhas.push(`index.html: linka ${cargo.href}, que está fora do menu`);
  const escolha = le(`${cargo.slug}.html`);
  for (const uf of UFS) {
    const sigla = uf.sigla.toLowerCase();
    const rel = join(cargo.slug, `${sigla}.html`);
    const html = le(rel);
    if (!html) continue;
    if (escolha && !contaLinks(escolha, `${cargo.href}/${sigla}`)) falhas.push(`${cargo.slug}.html: não linka ${cargo.href}/${sigla}`);
    if (!comDados.has(sigla)) {
      if (!/em preparação/.test(html)) falhas.push(`${rel}: sem dados e sem dizer "em preparação"`);
      continue;
    }
    const temas = paginasProntas(cargo.slug, sigla);
    for (const id of temas) {
      if (!contaLinks(html, `${cargo.href}/${sigla}/${id}`)) falhas.push(`${rel}: não linka o tema ${id}`);
      confereTema(join(cargo.slug, sigla, `${id}.html`), comparacao(cargo.slug, sigla, id), `${cargo.href}/${sigla}`, temas);
    }
  }
}

// ------------------------------------------------------- o chat não voltou
for (const rel of ['index.html', 'governador.html', 'sobre.html', 'privacidade.html', 'metodologia.html']) {
  const html = le(rel);
  if (/id="form-chat"|<section class="chat"|\/api\/conversa/.test(html)) falhas.push(`${rel}: ainda traz o chat`);
  if (/\/resposta\/[A-Za-z0-9_-]{22}/.test(html)) falhas.push(`${rel}: linka uma resposta guardada do chat`);
}

if (falhas.length) {
  console.error('FALHOU (páginas):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (páginas): a home É a comparação de "${prontas[0]}" e linka os ${prontas.length} temas de presidente; cada tema traz colunas, `
  + `cartões, seletor e caixa de temas; ${UFS.length} UFs por cargo (${CARGOS_POR_UF.map((c) => c.nome).join(', ')}), `
  + 'com dados ou "em preparação"; nenhuma página traz o chat');
