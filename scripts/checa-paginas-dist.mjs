#!/usr/bin/env node
/**
 * Gate do dist: as páginas da comparação existem e trazem o que prometem.
 *
 * O que se confere no HTML construído, não no código-fonte:
 *   · a home e /presidente existem e linkam TODAS as páginas com comparação
 *     pronta (data/comparacao/presidente/*.json) — tema exportado e sem link
 *     é tema invisível;
 *   · cada /presidente/<tema>.html traz uma coluna por candidato do JSON, um
 *     cartão por proposta, o seletor de candidatos e a faixa de temas;
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
  const cartoes = (html.match(/<button[^>]*class="proposta[^"]*"[^>]*data-p="/g) ?? []).length;
  if (cartoes !== dados.propostas.length) {
    falhas.push(`${rel}: ${cartoes} cartões para ${dados.propostas.length} propostas do JSON`);
  }
  for (const id of paginas) {
    if (!contaLinks(html, `${base}/${id}`)) falhas.push(`${rel}: a faixa de temas não linka ${base}/${id}`);
  }
  if (!/<dialog class="trechos"/.test(html)) falhas.push(`${rel}: sem o painel de trechos`);
  if (!/__comparacao/.test(html)) falhas.push(`${rel}: os dados da comparação não foram embutidos`);
}

// ------------------------------------------------------------- presidente
const prontas = paginasProntas('presidente');
if (!prontas.length) falhas.push('data/comparacao/presidente/ não tem página nenhuma');
const home = le('index.html');
const hub = le('presidente.html');
for (const id of prontas) {
  if (!contaLinks(home, `/presidente/${id}`)) falhas.push(`index.html: não linka /presidente/${id}`);
  if (!contaLinks(hub, `/presidente/${id}`)) falhas.push(`presidente.html: não linka /presidente/${id}`);
  confereTema(join('presidente', `${id}.html`), comparacao('presidente', null, id), '/presidente', prontas);
}
for (const id of prontas) {
  if (!paginaPorId(id)) falhas.push(`presidente/${id}.json não está em paginas.json`);
}

// -------------------------------------------------------------- por UF
for (const cargo of CARGOS_POR_UF) {
  const comDados = new Set(ufsProntas(cargo.slug));
  if (!contaLinks(home, cargo.href)) falhas.push(`index.html: não linka ${cargo.href}`);
  for (const uf of UFS) {
    const sigla = uf.sigla.toLowerCase();
    const rel = join(cargo.slug, `${sigla}.html`);
    const html = le(rel);
    if (!html) continue;
    if (!contaLinks(home, `${cargo.href}/${sigla}`)) falhas.push(`index.html: não linka ${cargo.href}/${sigla}`);
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
for (const rel of ['index.html', 'presidente.html', 'governador.html', 'sobre.html', 'privacidade.html', 'metodologia.html']) {
  const html = le(rel);
  if (/id="form-chat"|<section class="chat"|\/api\/conversa/.test(html)) falhas.push(`${rel}: ainda traz o chat`);
  if (/\/resposta\/[A-Za-z0-9_-]{22}/.test(html)) falhas.push(`${rel}: linka uma resposta guardada do chat`);
}

if (falhas.length) {
  console.error('FALHOU (páginas):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (páginas): home e hub linkam os ${prontas.length} temas de presidente; cada tema traz colunas, `
  + `cartões, seletor e faixa; ${UFS.length} UFs por cargo (${CARGOS_POR_UF.map((c) => c.nome).join(', ')}), `
  + 'com dados ou "em preparação"; nenhuma página traz o chat');
