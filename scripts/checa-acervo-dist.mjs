#!/usr/bin/env node
/**
 * Checagem de RESULTADO da página /acervo construída.
 *
 * A promessa da página é forte: "todo o Acervo, por candidato e por fonte,
 * com link até cada registro e sua fonte original". Três jeitos de quebrá-la
 * sem que nada exploda no build, e que por isso são cobrados aqui:
 *
 *  1. **candidato faltando.** O índice do acervo é derivado do coletor e pode
 *     simplesmente não trazer quem ainda não tem material. Se a página listar
 *     só quem tem, ela mostra cobertura parcial com cara de cobertura total.
 *     Todo candidato do índice aparece, e quem não tem registro aparece com a
 *     lacuna dita.
 *
 *  2. **link que não leva a lugar nenhum.** São centenas de links para rotas
 *     geradas por `getStaticPaths`. Um rótulo de ano que não corresponda a uma
 *     página construída é um 404 que só o leitor descobre. Aqui TODO link
 *     interno é conferido contra o arquivo em `dist/`.
 *
 *  3. **página gigante.** O acervo tem dezenas de milhares de itens. A página
 *     de entrada tem de ser índice — contadores e links —, nunca a lista de
 *     itens. O teto de tamanho e a ausência de link para item individual são
 *     o que impede a regressão.
 *
 * Uso: npm run build && npm run test:acervo-dist
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { leDados, leManifesto } from '../src/lib/dados.mjs';
import { visaoDoAcervo } from '../src/lib/acervo-visao.mjs';
import { estadoDoSite } from '../src/lib/release.mjs';

/** Teto do HTML da página de entrada. Índice, não listagem. */
const LIMITE_BYTES = 400 * 1024;

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const alvo = join(DIST, 'acervo.html');

if (!existsSync(alvo)) {
  console.error('FALHOU (acervo/dist): dist/acervo.html não existe — rode `npm run build` antes.');
  process.exit(1);
}

const html = readFileSync(alvo, 'utf8');
const visao = visaoDoAcervo(leDados('acervo', 'indice.json'));
const falhas = [];

// ---------------------------------------------------------------- cobertura

for (const c of visao.candidatos) {
  if (!html.includes(`id="acervo-${c.slug}"`)) {
    falhas.push(`candidato '${c.slug}' do índice não tem bloco na página`);
    continue;
  }
  if (!html.includes(c.nome)) falhas.push(`nome público de '${c.slug}' não aparece na página`);
  if (!html.includes(`href="/acervo/${c.slug}"`)) {
    falhas.push(`'${c.slug}' não linka o próprio hub /acervo/${c.slug}`);
  }
}

const blocos = [...html.matchAll(/id="acervo-([a-z0-9-]+)"/g)].map((m) => m[1]);
const doIndice = new Set(visao.candidatos.map((c) => c.slug));
for (const slug of blocos) {
  if (!doIndice.has(slug)) falhas.push(`a página traz o bloco '${slug}', que não está no índice`);
}
if (blocos.length !== visao.candidatos.length) {
  falhas.push(`a página tem ${blocos.length} blocos para ${visao.candidatos.length} candidatos`);
}

// lacuna declarada para quem não tem coleta
const semColeta = visao.candidatos.filter((c) => c.semColeta);
for (const c of semColeta) {
  const bloco = html.split(`id="acervo-${c.slug}"`)[1]?.split('</section>')[0] ?? '';
  if (!/lacuna/i.test(bloco)) {
    falhas.push(`'${c.slug}' não tem registro nenhum e a página não diz que é lacuna`);
  }
}

// uma caixa de fonte por tipo, para cada candidato com coleta
for (const c of visao.candidatos.filter((x) => !x.semColeta)) {
  const bloco = html.split(`id="acervo-${c.slug}"`)[1]?.split('</section>')[0] ?? '';
  const grupos = [...bloco.matchAll(/data-fonte="([a-z0-9-]+)"/g)].map((m) => m[1]);
  const esperados = c.fontes.map((f) => f.tipo);
  if (grupos.join(',') !== esperados.join(',')) {
    falhas.push(`'${c.slug}': fontes na página (${grupos.join(', ') || '—'}) diferem do `
      + `índice, ou saem fora da ordem canônica (${esperados.join(', ')})`);
  }
}

// ------------------------------------------------------- integridade de link

const internos = [...new Set([...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]))];
const quebrados = internos.filter((href) => {
  const rel = href.replace(/^\//, '');
  return !(existsSync(join(DIST, `${rel}.html`))
    || existsSync(join(DIST, rel, 'index.html'))
    || existsSync(join(DIST, rel)));
});
for (const href of quebrados) falhas.push(`link interno sem página construída: ${href}`);

// e todo ano do índice tem de estar linkado
for (const c of visao.candidatos) {
  for (const f of c.fontes) {
    for (const a of f.anos) {
      if (!html.includes(`href="${a.href}"`)) {
        falhas.push(`${c.slug}/${f.tipo}/${a.ano} está no índice e não é linkado na página`);
      }
    }
  }
}

// -------------------------------------------------------------- índice, não lista

const bytes = statSync(alvo).size;
if (bytes > LIMITE_BYTES) {
  falhas.push(`dist/acervo.html tem ${(bytes / 1024).toFixed(0)} KiB, acima do teto de `
    + `${LIMITE_BYTES / 1024} KiB — a página de entrada virou listagem de itens`);
}
const paraItem = internos.filter((h) => /^\/acervo\/[^/]+\/item\//.test(h));
if (paraItem.length) {
  falhas.push(`a página linka ${paraItem.length} itens individuais — ela é índice de `
    + 'cobertura, e o acervo tem dezenas de milhares de registros');
}

// ------------------------------------------------------- estado e acessibilidade

const estado = estadoDoSite(leManifesto());
if (!html.includes(estado.rotulo)) {
  falhas.push(`a página não mostra o estado de release ("${estado.rotulo}")`);
}
if (!estado.oficial && /Acervo Oficial/i.test(html)) {
  falhas.push('a página diz "Acervo Oficial" sem release oficial declarada');
}

for (const id of ['f-busca', 'f-candidato', 'f-fonte', 'f-ano']) {
  if (!html.includes(`id="${id}"`)) falhas.push(`filtro '${id}' não está na página`);
  if (!new RegExp(`<label[^>]*for="${id}"`).test(html)) {
    falhas.push(`o filtro '${id}' não tem rótulo associado`);
  }
}
if (!/<noscript>/.test(html)) {
  falhas.push('a página não declara o que acontece sem JavaScript');
}

const vazios = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
  .filter((m) => !m[1].replace(/<[^>]*>/g, '').trim());
if (vazios.length) falhas.push(`${vazios.length} link(s) sem texto acessível`);

if (falhas.length) {
  console.error('FALHOU (acervo/dist):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (acervo/dist): ${visao.candidatos.length} candidatos `
  + `(${visao.totais.comColeta} com coleta, ${semColeta.length} com lacuna declarada), `
  + `${internos.length} links internos conferidos contra dist/, `
  + `${(bytes / 1024).toFixed(0)} KiB — ${estado.rotulo}`);
