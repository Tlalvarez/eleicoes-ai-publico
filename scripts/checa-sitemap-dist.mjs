#!/usr/bin/env node
/**
 * Gate do dist: o que o site oferece a buscador é o que ele publica, e só isso.
 *
 *   · `robots.txt` existe, não proíbe nada e aponta para o sitemap;
 *   · cada endereço do sitemap tem arquivo no dist, não é `noindex`, não é origem
 *     de regra do `_redirects` (a Pages aplica o redirecionamento ANTES do arquivo:
 *     endereço listado e redirecionado é endereço que o buscador nunca lê) e declara
 *     a si mesmo como canônico;
 *   · as páginas da comparação estão lá: a home, cada tema de presidente construído
 *     e cada UF de governador. Sitemap que esquece a comparação é sitemap vazio.
 *
 * Uso: npm run build && npm run test:sitemap
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const ORIGEM = 'https://eleicoes.ai';
const falhas = [];

const robots = existsSync(join(DIST, 'robots.txt')) ? readFileSync(join(DIST, 'robots.txt'), 'utf8') : '';
if (!robots) falhas.push('dist/robots.txt não existe');
if (/^Disallow:\s*\/\s*$/m.test(robots)) falhas.push('robots.txt proíbe o site inteiro');
if (!robots.includes(`Sitemap: ${ORIGEM}/sitemap.xml`)) falhas.push('robots.txt não aponta para o sitemap');

if (!existsSync(join(DIST, 'sitemap.xml'))) {
  console.error('FALHOU (sitemap): dist/sitemap.xml não existe — rode `npm run build` antes.');
  process.exit(1);
}
const locs = [...readFileSync(join(DIST, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (new Set(locs).size !== locs.length) falhas.push('sitemap com endereço repetido');

const redirecionados = new Set(readFileSync(join(DIST, '_redirects'), 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)[0]));

for (const loc of locs) {
  if (!loc.startsWith(ORIGEM)) { falhas.push(`${loc}: fora do domínio`); continue; }
  const caminho = loc.slice(ORIGEM.length) || '/';
  if (/\.html$|\?|#/.test(caminho)) falhas.push(`${caminho}: não é o endereço público (extensão, ? ou #)`);
  if (redirecionados.has(caminho)) falhas.push(`${caminho}: está no _redirects — o buscador nunca leria a página`);
  const arq = caminho === '/' ? 'index.html' : `${caminho.slice(1)}.html`;
  const alt = `${caminho.slice(1)}/index.html`;
  const onde = existsSync(join(DIST, arq)) ? arq : existsSync(join(DIST, alt)) ? alt : null;
  if (!onde) { falhas.push(`${caminho}: sem arquivo no dist`); continue; }
  const html = readFileSync(join(DIST, onde), 'utf8');
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) falhas.push(`${caminho}: página noindex listada`);
  if (!html.includes(`<link rel="canonical" href="${loc}"`)) falhas.push(`${caminho}: não declara a si mesma como canônica`);
}

const esperados = ['/', '/governador', '/metodologia', '/sobre',
  ...readdirSync(join(DIST, 'presidente')).filter((n) => n.endsWith('.html')).map((n) => `/presidente/${n.replace(/\.html$/, '')}`),
  ...readdirSync(join(DIST, 'governador')).filter((n) => /^[a-z]{2}\.html$/.test(n)).map((n) => `/governador/${n.slice(0, 2)}`)];
const tem = new Set(locs.map((l) => l.slice(ORIGEM.length) || '/'));
for (const e of esperados) if (!tem.has(e)) falhas.push(`${e}: página da comparação fora do sitemap`);
if (esperados.filter((e) => e.startsWith('/governador/')).length !== 27) falhas.push('não há 27 UFs de governador no dist');

if (falhas.length) {
  console.error(`FALHOU (sitemap): ${falhas.length} problema(s)`);
  for (const f of falhas.slice(0, 30)) console.error('  · ' + f);
  process.exit(1);
}
console.log(`OK (sitemap): ${locs.length} endereço(s), todos publicados, indexáveis, canônicos e fora do _redirects`);
