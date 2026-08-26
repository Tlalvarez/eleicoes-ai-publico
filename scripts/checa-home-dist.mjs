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
 *   · o estado dos dados aparece, e a página não os chama de oficiais.
 *
 * Uso: npm run build && npm run test:home-dist
 */
import { existsSync, readFileSync } from 'node:fs';

import { leDados } from '../src/lib/dados.mjs';
import { chipsDaHome } from '../src/lib/home.mjs';
import { estadoDoSite } from '../src/lib/release.mjs';
import { leManifesto } from '../src/lib/dados.mjs';

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

const links = [...html.matchAll(/href="\/candidato\/([a-z0-9-]+)"/g)].map((m) => m[1]);
const naHome = new Set(links);
for (const [slug, c] of candidatos) {
  if (!naHome.has(slug)) falhas.push(`candidato '${slug}' do resumo.json não aparece na home`);
  if (!html.includes(c.nome)) falhas.push(`nome público de '${slug}' ('${c.nome}') não aparece na home`);
}
for (const slug of naHome) {
  if (!resumo.candidatos[slug]) falhas.push(`home linka '${slug}', que não está no resumo.json`);
}

// sugestões: uma por candidato, no molde único, e nenhuma a mais
const sugestoesNoHtml = [...html.matchAll(
  /<a[^>]*class="sugestao"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map((m) => ({ href: desescapa(m[1]), texto: desescapa(m[2]).trim() }));
const esperadas = chipsDaHome(resumo);

for (const c of esperadas) {
  const achado = sugestoesNoHtml.find((x) => x.texto === c.pergunta);
  if (!achado) falhas.push(`candidato '${c.slug}' não tem sugestão na home (esperado: "${c.pergunta}")`);
  else if (achado.href !== c.href) {
    falhas.push(`sugestão de '${c.slug}' aponta para ${achado.href}, não para ${c.href}`);
  }
}
const perguntas = new Set(esperadas.map((c) => c.pergunta));
for (const x of sugestoesNoHtml) {
  if (!perguntas.has(x.texto)) {
    falhas.push(`sugestão "${x.texto}" não sai do resumo.json — formulação escrita à mão`);
  }
}
if (sugestoesNoHtml.length !== esperadas.length) {
  falhas.push(`a home tem ${sugestoesNoHtml.length} sugestões para ${esperadas.length} `
    + 'candidatos — cobertura assimétrica');
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

const estado = estadoDoSite(leManifesto());
if (!html.includes(estado.rotulo)) {
  falhas.push(`a home construída não mostra o estado de release ("${estado.rotulo}")`);
}
if (!estado.oficial && /Acervo Oficial/i.test(html)) {
  falhas.push('a home construída diz "Acervo Oficial" sem release oficial declarada');
}

if (falhas.length) {
  console.error('FALHOU (dist):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (dist): a home construída é o chat, lista os ${candidatos.length} candidatos `
  + `de data/itens/resumo.json (${candidatos.length} cards, ${sugestoesNoHtml.length} sugestões) `
  + `e declara o estado dos dados: ${estado.rotulo}`);
