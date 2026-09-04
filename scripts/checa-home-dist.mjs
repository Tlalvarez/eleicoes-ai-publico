#!/usr/bin/env node
/**
 * Checagem de RESULTADO: o HTML construído da home.
 *
 * Irmã pós-build de scripts/checa-home-fonte.mjs. A de origem cobra o
 * código; esta cobra o que foi realmente publicado — porque entre um e outro
 * existe um bundler, e "o .astro está certo" nunca foi prova de que o
 * `dist/index.html` está.
 *
 * O que ela garante:
 *   · cobertura simétrica — a home lista EXATAMENTE os candidatos de
 *     data/itens/resumo.json, nos cards e nas sugestões, com a mesma
 *     formulação para todos;
 *   · a home é o chat — o formulário, o campo de pergunta e o módulo do
 *     cliente estão na página;
 *   · a página não chama os dados de oficiais (o estado dos dados é dito no
 *     rodapé de cada resposta do chat, não num quadro fixo no topo).
 *
 * Uso: npm run build && npm run test:home-dist
 */
import { existsSync, readFileSync } from 'node:fs';

import { leDados } from '../src/lib/dados.mjs';
import { estadoDoSite } from '../src/lib/release.mjs';
import { leManifesto } from '../src/lib/dados.mjs';
import { BASE_DIVULGA, urlsPorSlug } from '../src/lib/tse.mjs';

const alvo = new URL('../dist/index.html', import.meta.url);
if (!existsSync(alvo)) {
  console.error('FALHOU (dist): dist/index.html não existe — rode `npm run build` antes.');
  process.exit(1);
}

// mesmo manifesto que o build usou (ver src/lib/dados.mjs)
const resumo = leDados('itens', 'resumo.json');
const html = readFileSync(alvo, 'utf8');

const candidatos = Object.entries(resumo.candidatos);
const falhas = [];

const desescapa = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---------------------------------------------------------------- cobertura

// o retrato de cada candidato leva à página OFICIAL da candidatura no TSE
// (as seções internas de candidato e de acervo estão escondidas). A cobertura
// simétrica passa a ser cobrada por esses links: um por candidato do resumo,
// nenhum a mais.
const urlTse = urlsPorSlug();
const slugPorUrl = new Map(Object.entries(urlTse).map(([slug, url]) => [url, slug]));
const escapa = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const links = [...html.matchAll(new RegExp(`href="(${escapa(BASE_DIVULGA)}[^"]*)"`, 'g'))]
  .map((m) => desescapa(m[1]));
const naHome = new Set(links.map((url) => slugPorUrl.get(url) ?? url));
for (const [slug, c] of candidatos) {
  if (!naHome.has(slug)) falhas.push(`candidato '${slug}' do resumo.json não aparece na home com link para o TSE`);
  if (!html.includes(c.nome)) falhas.push(`nome público de '${slug}' ('${c.nome}') não aparece na home`);
}
for (const slug of naHome) {
  if (!resumo.candidatos[slug]) falhas.push(`home linka '${slug}' no TSE, que não está no resumo.json`);
}
for (const escondida of ['/candidato', '/acervo']) {
  if (new RegExp(`href="${escondida}(?:[/"?#]|$)`).test(html)) {
    falhas.push(`a home construída linka ${escondida} — a seção está escondida`);
  }
}


// ------------------------------------------------------------------ o chat

const exigencias = [
  [/<form[^>]*id="form-chat"/, 'a home construída não tem o formulário do chat'],
  [/<textarea[^>]*id="q"/, 'a home construída não tem o campo de pergunta'],
  [/<label[^>]*for="q"/, 'o campo de pergunta não tem rótulo associado'],
  [/<ol[^>]*id="conversa"/, 'a home construída não tem a lista da conversa'],
  [/<script[^>]*type="module"[^>]*src="[^"]+"/, 'a home construída não carrega o módulo '
    + 'do cliente — o chat não roda'],
  [/<noscript>/, 'a home construída não tem alternativa declarada para quem está sem JavaScript'],
];
for (const [regra, mensagem] of exigencias) {
  if (!regra.test(html)) falhas.push(mensagem);
}

// ------------------------------------------------------- endereço da API

/**
 * O build publicado não pode apontar o chat para a máquina de quem visita.
 *
 * Isto já esteve errado: sem `PUBLIC_PESQUISA_API` no ambiente, o `dist/`
 * saía com `http://localhost:8765`. Publicado, o navegador do visitante
 * procuraria o serviço nele mesmo — e, dentro de uma página https, seria
 * bloqueado como conteúdo misto antes disso. Mesma origem ('') é o padrão;
 * um endereço absoluto só passa se for https.
 */
// atributo sem valor é como o Astro escreve a string vazia — e string vazia é
// exatamente o padrão de mesma origem, então `data-api` sozinho é o caso bom
const api = html.match(/\sdata-api(?:="([^"]*)")?[\s>]/);
if (!api) {
  falhas.push('a home construída não declara data-api — o chat não sabe para onde perguntar');
} else {
  const endereco = desescapa(api[1] ?? '');
  if (/localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(endereco)) {
    falhas.push(`a home construída aponta o chat para '${endereco}' — endereço local `
      + 'num build público manda o visitante consultar a própria máquina');
  } else if (endereco !== '' && !/^https:\/\//.test(endereco)) {
    falhas.push(`a home construída aponta o chat para '${endereco}': fora de https, a `
      + 'requisição é bloqueada como conteúdo misto');
  }
}

// e o mesmo vale para o BUNDLE: o endereço podia ter sido embutido no módulo
for (const src of [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1])) {
  const arquivo = new URL(`../dist${src}`, import.meta.url);
  if (!existsSync(arquivo)) continue;
  const js = readFileSync(arquivo, 'utf8');
  const achado = js.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/);
  if (achado) {
    falhas.push(`o módulo publicado ${src} embute '${achado[0]}' — endereço local `
      + 'não pode viajar num build público');
  }
}

// ------------------------------------------------------------------ estado

// A home não carrega mais o quadro de estado no topo: o aviso de prévia vive
// no rodapé de cada resposta do chat (e nos formatos de compartilhamento),
// onde acompanha o dado que ele qualifica. O que continua valendo aqui é o
// lado negativo — a home não pode afirmar oficialidade sem release.
const estado = estadoDoSite(leManifesto());
if (!estado.oficial && /Acervo Oficial/i.test(html)) {
  falhas.push('a home construída diz "Acervo Oficial" sem release oficial declarada');
}

if (falhas.length) {
  console.error('FALHOU (dist):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (dist): a home construída é o chat, lista os ${candidatos.length} candidatos `
  + `de data/itens/resumo.json (${candidatos.length} cards, cada um com link para o TSE) `
  + `e não afirma oficialidade (estado dos dados: ${estado.rotulo})`);
