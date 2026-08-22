#!/usr/bin/env node
/**
 * Checagem de ORIGEM: a lista de candidatos da home E os chips de exemplo têm
 * de sair de data/itens/resumo.json, não do .astro.
 *
 * A home trazia os cinco candidatos escritos à mão, enquanto /candidato,
 * /candidato/[slug] e /acervo já liam o resumo gerado pelo harness. Com 13
 * candidatos isso vira a pior falha possível do site: quem entrasse pela home
 * veria cinco e concluiria que o resto não é acompanhado — cobertura simétrica
 * quebrada na primeira página.
 *
 * Os chips (as perguntas de exemplo sob a busca) eram escritos à mão e citavam
 * 5 candidatos, cada um com um tema próprio. Mesmo com os cards já derivados,
 * isso mantinha a assimetria em cima da página: quem não estivesse na lista
 * parecia não ser acompanhado, e o tema colado ao nome sugeria associação que
 * o dado não sustenta.
 *
 * Roda ANTES do build, só sobre o código-fonte. A checagem do HTML construído
 * é a irmã pós-build, scripts/checa-home-dist.mjs.
 *
 * Uso: npm run test:home-fonte
 */
import { readFileSync } from 'node:fs';

import { leDados } from '../src/lib/dados.mjs';
import { citacoesDeCandidato } from '../src/lib/home.mjs';

// o resumo sai do manifesto da geração ativa, como o site — nunca de um
// caminho fixo (ver src/lib/dados.mjs)
const resumo = leDados('itens', 'resumo.json');
const fonte = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');

const candidatos = Object.entries(resumo.candidatos);
const falhas = [];
const bloco = fonte.split('---')[1] ?? fonte;   // frontmatter do .astro

// 1. a página tem de puxar o resumo gerado, e pelo MANIFESTO da geração:
// caminho fixo prenderia a home a uma geração enquanto o resto do site anda
if (!/\bleDados\(\s*['"]itens['"]\s*,\s*['"]resumo\.json['"]\s*\)/.test(bloco)) {
  falhas.push('index.astro não lê data/itens/resumo.json por leDados() — a lista '
    + 'não tem de onde vir, ou vem de um caminho fixo fora do manifesto');
}
if (/^\s*import\s+\w+\s+from\s+['"][^'"]*data\/itens\//m.test(bloco)) {
  falhas.push('index.astro importa data/itens por caminho fixo — fora do manifesto da geração');
}

// 2. os chips têm de vir do mesmo resumo, pelo molde único de src/lib/home.mjs
if (!/^\s*import\s*\{[^}]*\bchipsDaHome\b[^}]*\}\s*from\s*['"][^'"]*lib\/home\.mjs['"]/m.test(bloco)) {
  falhas.push('index.astro não importa chipsDaHome de src/lib/home.mjs — os chips não têm de onde vir');
}
if (/\bconst\s+chips\s*=\s*\[/.test(bloco)) {
  falhas.push('index.astro traz uma lista de chips escrita à mão — os chips não vêm do resumo.json');
}

// 3. nenhum slug/nome de candidato escrito à mão na página
for (const [slug, c] of candidatos) {
  if (bloco.includes(`'${slug}'`) || bloco.includes(`"${slug}"`)) {
    falhas.push(`index.astro traz o slug '${slug}' como literal — a lista não vem do resumo.json`);
  }
  if (bloco.includes(`'${c.nome}'`) || bloco.includes(`"${c.nome}"`)) {
    falhas.push(`index.astro traz o nome '${c.nome}' como literal — a lista não vem do resumo.json`);
  }
}

// nome solto em qualquer texto da página, frontmatter ou marcação (era assim
// que chips e placeholder citavam 'o que o Lula propõe…' sem casar com a
// checagem de literal acima). A regra vive em src/lib/home.mjs e é testada
// lá: vários sobrenomes brasileiros são substantivos comuns, e procurar sem
// caixa acusava "todos os dias" como citação de 'Hertz Dias'.
for (const { nome, trecho } of citacoesDeCandidato(
  fonte, candidatos.map(([, c]) => c.nome))) {
  falhas.push(`index.astro cita '${trecho}' ('${nome}') no texto da página — cobertura assimétrica`);
}

if (falhas.length) {
  console.error('FALHOU (origem):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (origem): index.astro deriva cards e chips dos ${candidatos.length} candidatos de data/itens/resumo.json`);
