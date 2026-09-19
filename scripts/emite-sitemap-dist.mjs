#!/usr/bin/env node
/**
 * Emite `dist/sitemap.xml` — a lista das páginas que o site oferece a buscador.
 *
 * Por que ele é GERADO do dist, e não de uma lista de rotas: o que existe é o que
 * foi construído. Tema novo exportado, UF que ganhou dados, seção que saiu — tudo
 * isso muda o dist sem ninguém lembrar de um arquivo de rotas. A regra é uma só:
 * entra toda página construída que não se declara `noindex`, menos a 404.
 *
 * Em 18/09/2026 o site tinha 425 páginas e nenhum sitemap nem robots.txt: os dois
 * endereços devolviam a página 404, e o Google trazia 2 sessões em 470.
 *
 * O endereço público é sem `.html` (ver Base.astro), e é esse que vai aqui — o
 * mesmo do `og:url` e do `canonical`.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const ORIGEM = 'https://eleicoes.ai';

const htmls = (dir) => readdirSync(dir).flatMap((nome) => {
  const p = join(dir, nome);
  if (statSync(p).isDirectory()) return htmls(p);
  return nome.endsWith('.html') ? [p] : [];
});

const enderecos = htmls(DIST)
  .filter((arq) => relative(DIST, arq) !== '404.html')
  .filter((arq) => !/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(readFileSync(arq, 'utf8')))
  .map((arq) => '/' + relative(DIST, arq).split(sep).join('/').replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, ''))
  .map((c) => (c.length > 1 ? c.replace(/\/$/, '') : c))
  .sort();

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + enderecos.map((c) => `  <url><loc>${ORIGEM}${c}</loc></url>\n`).join('')
  + '</urlset>\n';
writeFileSync(join(DIST, 'sitemap.xml'), xml);
console.log(`OK (sitemap): ${enderecos.length} endereço(s) em dist/sitemap.xml`);
