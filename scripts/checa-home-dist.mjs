#!/usr/bin/env node
/**
 * Checagem de RESULTADO: o HTML construído da home lista EXATAMENTE os
 * candidatos de data/itens/resumo.json — nem a menos, nem a mais — nos cards
 * e nos chips de exemplo, com a mesma formulação para todos.
 *
 * Irmã pós-build de scripts/checa-home-fonte.mjs, que roda antes do build e
 * cobre a origem (o .astro não pode ter a lista escrita à mão).
 *
 * Uso: npm run build && npm run test:home-dist
 */
import { existsSync, readFileSync } from 'node:fs';
import { chipsDaHome } from '../src/lib/home.mjs';

const alvo = new URL('../dist/index.html', import.meta.url);
if (!existsSync(alvo)) {
  console.error('FALHOU (dist): dist/index.html não existe — rode `npm run build` antes.');
  process.exit(1);
}

import { leDados } from '../src/lib/dados.mjs';

// mesmo manifesto que o build usou (ver src/lib/dados.mjs)
const resumo = leDados('itens', 'resumo.json');
const html = readFileSync(alvo, 'utf8');

const candidatos = Object.entries(resumo.candidatos);
const falhas = [];

const links = [...html.matchAll(/href="\/candidato\/([a-z0-9-]+)"/g)].map((m) => m[1]);
const naHome = new Set(links);
for (const [slug, c] of candidatos) {
  if (!naHome.has(slug)) falhas.push(`candidato '${slug}' do resumo.json não aparece na home`);
  if (!html.includes(c.nome)) falhas.push(`nome público de '${slug}' ('${c.nome}') não aparece na home`);
}
for (const slug of naHome) {
  if (!resumo.candidatos[slug]) falhas.push(`home linka '${slug}', que não está no resumo.json`);
}

// chips: um por candidato, no molde único, e nenhum a mais
const desescapa = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const chipsNoHtml = [...html.matchAll(/<a[^>]*class="chip"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map((m) => ({ href: desescapa(m[1]), texto: desescapa(m[2]).trim() }));
const esperados = chipsDaHome(resumo);

for (const c of esperados) {
  const achado = chipsNoHtml.find((x) => x.texto === c.pergunta);
  if (!achado) falhas.push(`candidato '${c.slug}' não tem chip na home (esperado: "${c.pergunta}")`);
  else if (achado.href !== c.href) falhas.push(`chip de '${c.slug}' aponta para ${achado.href}, não para ${c.href}`);
}
const perguntas = new Set(esperados.map((c) => c.pergunta));
for (const x of chipsNoHtml) {
  if (!perguntas.has(x.texto)) falhas.push(`chip "${x.texto}" não sai do resumo.json — formulação escrita à mão`);
}
if (chipsNoHtml.length !== esperados.length) {
  falhas.push(`a home tem ${chipsNoHtml.length} chips para ${esperados.length} candidatos — cobertura assimétrica`);
}

if (falhas.length) {
  console.error('FALHOU (dist):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (dist): a home construída lista os ${candidatos.length} candidatos de data/itens/resumo.json — ${candidatos.length} cards e ${chipsNoHtml.length} chips, mesma formulação`);
