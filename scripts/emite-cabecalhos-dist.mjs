#!/usr/bin/env node
/**
 * Emite `dist/_headers` — os cabeçalhos de segurança do site publicado.
 *
 * A Cloudflare Pages aplica este arquivo a todo ativo estático que serve (e ao
 * que a Function de /resposta/<id> lê de `env.ASSETS`). Sem ele o site sai
 * sem CSP, sem HSTS e sem proteção contra ser embutido em iframe de terceiro —
 * num produto eleitoral, embutir a página numa moldura que a comente é o
 * ataque barato.
 *
 * Por que ele é GERADO, e não versionado em `public/_headers`: a CSP proíbe
 * script inline, e o build tem dois deles que não dá para tirar — o stub do
 * PostHog (`is:inline`, em todas as páginas) e o filtro do acervo, que o Astro
 * embute por ser pequeno. A saída é autorizar exatamente esses dois pelo hash
 * do conteúdo. O hash muda quando o script muda, então ele tem de ser
 * calculado sobre o dist que vai a público, e não digitado à mão.
 *
 * O que a política autoriza, e só isso:
 *   · script: os do próprio site (`/_astro/*`), os inline por hash, e o
 *     `array.js` que o stub do PostHog carrega de `us-assets.i.posthog.com`;
 *   · estilo: o do site e inline (`<style>` embutido pelo Astro e `style=""`
 *     nos cartões: centenas deles, hash por hash não compensa e estilo inline
 *     não executa nada);
 *   · imagem: o site e as fotos oficiais do TSE;
 *   · conexão: o site (API na mesma origem, no gate), o serviço de evidências
 *     e o PostHog;
 *   · nada de `object`, nada de `<base>` alheio, formulário só para o site,
 *     e a página não pode ser emoldurada por ninguém.
 *
 * Falha (exit 1) se encontrar no dist algo que a política bloquearia e que
 * não esteja autorizado: `on*=""` inline, `href="javascript:"` ou `data:` em
 * imagem. Ou o ativo entra na política de propósito, ou não vai a público.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { API_PADRAO } from '../src/lib/resposta-publica.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');

/** Origens fixas da política. Mudou o fornecedor, muda-se aqui e no Base.astro. */
export const ORIGENS = Object.freeze({
  posthogIngestao: 'https://us.i.posthog.com',
  posthogAtivos: 'https://us-assets.i.posthog.com',
  fotosTse: 'https://divulgacandcontas.tse.jus.br',
});

/** Cabeçalhos que não dependem do build. */
export const CABECALHOS_FIXOS = Object.freeze({
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
});

function htmls(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) htmls(caminho, saida);
    else if (extname(caminho) === '.html') saida.push(caminho);
  }
  return saida;
}

const RE_SCRIPT_INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
const RE_HANDLER_INLINE = /<[a-z][^>]*\son[a-z]+\s*=/i;
const RE_HREF_JS = /\b(?:href|src)\s*=\s*["']\s*javascript:/i;
const RE_IMG_DATA = /<img[^>]*\bsrc\s*=\s*["']data:/i;

/** Hashes (sha256, base64) de todo script inline do dist, e o que a CSP recusaria. */
export function inventarioDoDist(dist = DIST) {
  const hashes = new Map();
  const problemas = [];
  for (const arquivo of htmls(dist)) {
    const html = readFileSync(arquivo, 'utf8');
    for (const m of html.matchAll(RE_SCRIPT_INLINE)) {
      const hash = createHash('sha256').update(m[1]).digest('base64');
      if (!hashes.has(hash)) hashes.set(hash, { exemplo: arquivo, paginas: 0 });
      hashes.get(hash).paginas += 1;
    }
    if (RE_HANDLER_INLINE.test(html)) problemas.push(`${arquivo}: atributo on*= inline`);
    if (RE_HREF_JS.test(html)) problemas.push(`${arquivo}: href/src javascript:`);
    if (RE_IMG_DATA.test(html)) problemas.push(`${arquivo}: <img src="data:">`);
  }
  return { hashes, problemas };
}

/** A origem do serviço de evidências embutida no build, se houver, além do padrão. */
function origensDaApi() {
  const origens = new Set([API_PADRAO]);
  const env = process.env.PUBLIC_PESQUISA_API;
  if (env) {
    try { origens.add(new URL(env).origin); } catch { /* relativo ou vazio: mesma origem */ }
  }
  return [...origens];
}

/** A CSP inteira, dados os hashes dos scripts inline. */
export function politica(hashes, { api = origensDaApi() } = {}) {
  const inline = [...hashes].map((h) => `'sha256-${h}'`).join(' ');
  return [
    `default-src 'self'`,
    `script-src 'self' ${inline} ${ORIGENS.posthogAtivos}`.replace(/\s+/g, ' '),
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' ${ORIGENS.fotosTse}`,
    `connect-src 'self' ${api.join(' ')} ${ORIGENS.posthogIngestao} ${ORIGENS.posthogAtivos}`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

/** O texto de `_headers` no formato da Pages: um bloco `/*` com os cabeçalhos. */
export function textoHeaders(csp) {
  const linhas = ['/*', `  Content-Security-Policy: ${csp}`];
  for (const [nome, valor] of Object.entries(CABECALHOS_FIXOS)) linhas.push(`  ${nome}: ${valor}`);
  return `${linhas.join('\n')}\n`;
}

/** Lê um `_headers` no formato da Pages → { '/*': { Nome: valor } }. */
export function analisaHeaders(texto) {
  const regras = {};
  let atual = null;
  for (const linha of String(texto).split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    if (!/^\s/.test(linha)) { atual = linha.trim(); regras[atual] = {}; continue; }
    const dois = linha.indexOf(':');
    if (atual && dois > 0) regras[atual][linha.slice(0, dois).trim()] = linha.slice(dois + 1).trim();
  }
  return regras;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('FALHOU (cabeçalhos): dist/index.html não existe — rode `astro build` antes.');
    process.exit(1);
  }
  const { hashes, problemas } = inventarioDoDist();
  if (problemas.length) {
    console.error('FALHOU (cabeçalhos): o dist tem o que a CSP bloquearia —');
    for (const p of problemas.slice(0, 10)) console.error(`  ${p}`);
    process.exit(1);
  }
  const csp = politica(hashes.keys());
  writeFileSync(join(DIST, '_headers'), textoHeaders(csp));
  console.log(`dist/_headers: CSP com ${hashes.size} script(s) inline autorizado(s) por hash, `
    + `${Object.keys(CABECALHOS_FIXOS).length} cabeçalhos fixos`);
  for (const [hash, { exemplo, paginas }] of hashes) {
    console.log(`  sha256-${hash.slice(0, 16)}… em ${paginas} página(s), ex.: ${exemplo.replace(DIST, 'dist')}`);
  }
}
