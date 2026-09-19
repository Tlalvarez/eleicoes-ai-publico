#!/usr/bin/env node
/**
 * Gate do dist: o que o assistente lê em /ia/dados é o dado inteiro, e só o dado.
 *
 *   · cada proposta de data/comparacao aparece uma vez no arquivo do tema dela, e a linha FIM
 *     diz a conta certa — é a linha FIM que deixa o assistente saber se a leitura foi cortada;
 *   · o texto de cada programa é PARTIÇÃO: somados os arquivos do candidato, os blocos são
 *     exatamente os de data/busca, nem um a mais, nem um a menos;
 *   · nenhum arquivo passa do tamanho que os assistentes leem sem cortar;
 *   · todo endereço de /ia/dados citado (na página /ia e nos próprios arquivos) existe no dist.
 *
 * Uso: npm run build && npm run test:ia
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparacao, paginasProntas } from '../src/lib/comparacao-dados.mjs';
import { LIMITE_BYTES } from './emite-ia-dist.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = join(RAIZ, 'dist', 'ia', 'dados');
const falhas = [];
if (!existsSync(join(DADOS, 'escopos.json')) || !existsSync(join(RAIZ, 'dist', 'ia.html'))) {
  console.error('FALHOU (ia): dist/ia não existe — rode `npm run build` antes.');
  process.exit(1);
}
const escopos = JSON.parse(readFileSync(join(DADOS, 'escopos.json'), 'utf8'));
const todos = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? todos(p) : [p]; });
const arquivos = todos(DADOS).filter((a) => a.endsWith('.md'));

let propostas = 0;
let blocos = 0;
for (const e of escopos) {
  const [cargo, uf = null] = e.rel.split('/');
  for (const tema of paginasProntas(cargo, uf)) {
    const d = comparacao(cargo, uf, tema);
    if (!d?.propostas?.length) continue;
    // o tema pode estar num arquivo só ou dividido em partes (tema-<id>-1.md…): junta-se tudo
    const pasta = join(DADOS, e.rel);
    const partes = readdirSync(pasta).filter((n) => new RegExp(`^tema-${tema}(-\\d+)?\\.md$`).test(n));
    if (!partes.length) { falhas.push(`${e.rel}/tema-${tema}.md não existe`); continue; }
    const textos = partes.map((n) => readFileSync(join(pasta, n), 'utf8'));
    const t = textos.join('\n');
    const ids = [...t.matchAll(/ \[([a-z0-9-]+)\/([A-Za-z0-9_-]+)\]$/gm)].map((m) => m[2]);
    const esperados = d.propostas.map((p) => p.id);
    if (ids.length !== esperados.length || new Set(ids).size !== ids.length || esperados.some((id) => !ids.includes(id))) falhas.push(`${e.rel}/tema-${tema}: ${ids.length} propostas nos arquivos, ${esperados.length} no dado`);
    const somaFim = textos.reduce((s, x) => s + Number(/^FIM — (\d+) proposta/m.exec(x)?.[1] ?? NaN), 0);
    if (somaFim !== esperados.length) falhas.push(`${e.rel}/tema-${tema}: as linhas FIM somam ${somaFim}, o dado tem ${esperados.length}`);
    for (const p of d.propostas) if (!t.includes(`**${p.proposta}**`)) { falhas.push(`${e.rel}/tema-${tema}: o texto de ${p.id} não é o do dado`); break; }
    propostas += esperados.length;
  }
  const busca = JSON.parse(readFileSync(join(RAIZ, 'data', 'busca', e.rel, 'documentos.json'), 'utf8'));
  const porSlug = new Map();
  for (const b of busca.blocos) porSlug.set(b.slug, (porSlug.get(b.slug) ?? 0) + 1);
  for (const [slug, n] of porSlug) {
    const partes = arquivos.filter((a) => a.startsWith(join(DADOS, e.rel, `programa-${slug}-`)));
    const soma = partes.reduce((s, a) => s + Number(/^FIM — (\d+) bloco/m.exec(readFileSync(a, 'utf8'))?.[1] ?? NaN), 0);
    const linhas = partes.reduce((s, a) => s + (readFileSync(a, 'utf8').match(/^\[b\d+\] \([a-z_]+\) /gm) ?? []).length, 0);
    if (soma !== n || linhas !== n) falhas.push(`${e.rel}: o programa de ${slug} tem ${n} blocos no dado, ${linhas} nos arquivos e ${soma} nas linhas FIM`);
    blocos += n;
  }
}

for (const a of arquivos) if (statSync(a).size > LIMITE_BYTES) falhas.push(`${a.slice(DADOS.length + 1)}: ${statSync(a).size} bytes — passa do que um assistente lê sem cortar`);

const citados = new Set();
const CARTAO = join(RAIZ, 'dist', 'llms.txt');
if (!existsSync(CARTAO)) falhas.push('dist/llms.txt não existe — a home não teria o que entregar ao assistente');
else if (statSync(CARTAO).size > 8000) falhas.push(`llms.txt com ${statSync(CARTAO).size} bytes: o cartão de visita tem de ser curto, é ele que decide a velocidade da primeira resposta`);
else if (!/^FIM — /m.test(readFileSync(CARTAO, 'utf8'))) falhas.push('llms.txt sem a linha FIM');
// Todo .md tem o gêmeo em HTML — é o HTML que o ChatGPT lê (o leitor dele recusa text/markdown,
// medido em 18/09) — com a mesma linha FIM, e os links do HTML apontam para HTML.
const htmls = todos(DADOS).filter((a) => a.endsWith('.html'));
for (const a of arquivos) {
  const gemeo = a.replace(/\.md$/, '.html');
  if (!existsSync(gemeo)) { falhas.push(`${a.slice(DADOS.length + 1)}: sem o gêmeo em HTML`); continue; }
  const fim = /^FIM — [^.:]*/m.exec(readFileSync(a, 'utf8'))?.[0];
  const h = readFileSync(gemeo, 'utf8');
  if (!fim || !h.includes(fim)) falhas.push(`${gemeo.slice(DADOS.length + 1)}: sem a linha FIM do markdown`);
  if (/\/ia\/dados\/[^"\s<]+\.md/.test(h)) falhas.push(`${gemeo.slice(DADOS.length + 1)}: link para .md dentro do HTML`);
}
const CARTAO_HTML = join(RAIZ, 'dist', 'ia', 'cartao.html');
if (!existsSync(CARTAO_HTML)) falhas.push('dist/ia/cartao.html não existe — a rota / não teria o que entregar ao ChatGPT');
for (const a of [...arquivos, ...htmls, join(RAIZ, 'dist', 'ia.html'), ...(existsSync(CARTAO) ? [CARTAO] : []), ...(existsSync(CARTAO_HTML) ? [CARTAO_HTML] : [])]) {
  for (const m of readFileSync(a, 'utf8').matchAll(/https?:\/\/[^\s"'<>|)]+\/ia\/dados\/([A-Za-z0-9_\/-]+(?:\.md)?)/g)) citados.add(m[1]);
}
for (const c of citados) {
  if (c.endsWith('-')) continue;   // o padrão de endereço explicado na /ia (`tema-<tema>`), não um endereço
  if (!existsSync(join(DADOS, c.endsWith('.md') ? c : `${c}.html`))) falhas.push(`endereço citado e inexistente: /ia/dados/${c}`);
}

if (falhas.length) {
  console.error(`FALHOU (ia): ${falhas.length} problema(s)`);
  for (const f of falhas.slice(0, 25)) console.error('  · ' + f);
  process.exit(1);
}
for (const e of escopos) if (!existsSync(join(DADOS, e.rel, 'panorama.html'))) falhas.push(`${e.rel}: sem o panorama da disputa`);
if (falhas.length) { console.error(`FALHOU (ia): ${falhas.length} problema(s)`); for (const f of falhas.slice(0, 25)) console.error('  · ' + f); process.exit(1); }
console.log(`OK (ia): ${escopos.length} escopos, ${arquivos.length} arquivos; ${propostas} propostas e ${blocos} blocos conferidos contra o dado; ${citados.size} endereços citados existem; nenhum arquivo acima de ${LIMITE_BYTES} bytes`);
