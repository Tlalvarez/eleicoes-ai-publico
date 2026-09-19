#!/usr/bin/env node
/**
 * Emite `dist/ia/dados/` — os dados do site em texto que um assistente (ChatGPT, Claude…)
 * consegue abrir e ler inteiro. A página `/ia` é a porta: a pessoa cola o link na conversa
 * dela, o assistente abre, entende o que é o eleicoes.ai e passa a responder perguntas
 * consultando estes arquivos — o chat que o site não tem, no assistente que a pessoa já usa.
 *
 * O que sai, por escopo (presidente, governador/<uf>):
 *   <escopo>.md                        o mapa: candidatos (com o PDF no TSE), temas, arquivos
 *   <escopo>/tema-<tema>.md            a comparação do tema: cada proposta, quem propõe, quem
 *                                      propõe o contrário, e a página do programa que sustenta
 *   <escopo>/programa-<slug>.md        o programa de um candidato: o que há em cada tema
 *   <escopo>/programa-<slug>-<tema>.md o TEXTO do programa classificado naquele tema, bloco a
 *                                      bloco, na ordem do documento, com a página do PDF
 *
 * Três regras que vêm de como os assistentes leem:
 *   · arquivo pequeno: a ferramenta de leitura deles CORTA página longa, e um corte silencioso
 *     vira "o candidato não fala disso" — o erro que o site não pode cometer. Por isso o texto
 *     do programa é fatiado por tema, todo arquivo abre dizendo quantos itens tem e fecha com
 *     uma linha FIM que repete a conta;
 *   · endereço absoluto: assistente não resolve link relativo com confiança;
 *   · nada aqui é novo: tudo sai de data/comparacao e data/busca, os mesmos dados da matriz.
 *
 * `IA_ORIGEM` troca a origem dos links (a prévia de um ramo aponta para si mesma).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparacao, paginas as paginasDoCargo, paginasProntas, ufsProntas } from '../src/lib/comparacao-dados.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const ORIGEM = (process.env.IA_ORIGEM || 'https://eleicoes.ai').replace(/\/$/, '');
const BASE = `${ORIGEM}/ia/dados`;
export const LIMITE_BYTES = 120_000;
const PARTE_BYTES = 60_000;

const escreve = (rel, texto) => {
  const arq = join(DIST, 'ia', 'dados', rel);
  mkdirSync(dirname(arq), { recursive: true });
  writeFileSync(arq, texto);
  return Buffer.byteLength(texto);
};
const UM = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const REGRAS = `> Fonte: eleicoes.ai — programas de governo registrados no TSE (eleições 2026). Use SÓ o que está nestes arquivos para falar dos programas; cite o candidato e a página do programa; se um assunto não aparece, diga "o programa não trata disso" apenas depois de ler o arquivo até a linha FIM; não recomende voto.`;

function escopo(cargo, uf) {
  const rel = uf ? `${cargo}/${uf}` : cargo;
  const arqBusca = join(RAIZ, 'data', 'busca', rel, 'documentos.json');
  if (!existsSync(arqBusca)) return null;
  const busca = JSON.parse(readFileSync(arqBusca, 'utf8'));
  const prontas = paginasProntas(cargo, uf);
  const defs = paginasDoCargo(undefined, cargo).filter((p) => prontas.includes(p.id));
  const temaDaPagina = new Map(defs.flatMap((p) => p.temas.map((t) => [t, p.id])));
  const rotulo = uf ? `Governador — ${uf.toUpperCase()}` : 'Presidente';
  const paginaDoSite = (id) => (id === prontas[0] ? (uf ? `${ORIGEM}/${rel}` : `${ORIGEM}/`) : `${ORIGEM}/${rel}/${id}`);
  let bytes = 0;
  let arquivos = 0;
  let maior = ['', 0];
  const grava = (nome, texto) => { const b = escreve(nome, texto); bytes += b; arquivos += 1; if (b > maior[1]) maior = [nome, b]; };

  let candidatos = null;
  const resumoTemas = [];
  // ------------------------------------------------------------ a comparação, tema a tema
  for (const def of defs) {
    const d = comparacao(cargo, uf, def.id);
    if (!d?.propostas?.length) continue;
    candidatos ??= d.candidatos;
    const assuntos = [...new Set(d.propostas.map((p) => p.subtema))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const L = [`# ${def.nome} — o que cada programa propõe (${rotulo}, 2026)`, '', REGRAS, '',
      `Este arquivo tem ${UM(d.propostas.length, 'proposta', 'propostas')} em ${UM(assuntos.length, 'assunto', 'assuntos')}. Candidatos comparados: ${d.candidatos.map((c) => c.nome).join(', ')}.`,
      `"Propõe" = o programa do candidato traz a proposta. "Propõe o contrário" = o programa traz proposta oposta. Candidato que não aparece numa proposta NÃO tratou dela no programa — isso é silêncio, não discordância.`,
      `Ver na tela: ${paginaDoSite(def.id)}`, ''];
    for (const a of assuntos) {
      L.push(`## ${a}`, '');
      for (const p of d.propostas.filter((x) => x.subtema === a)) {
        L.push(`- **${p.proposta}** [${def.id}/${p.id}]`);
        for (const c of d.candidatos) {
          const pos = p.posicoes[c.slug];
          if (!pos || (pos.posicao !== 'concorda' && pos.posicao !== 'discorda')) continue;
          const pags = [...new Set((pos.blocos ?? []).map((b) => d.blocos?.[c.slug]?.[b]?.pagina).filter(Boolean))].sort((x, y) => x - y);
          const metas = (pos.metas ?? []).map((m) => `${m.rotulo}: ${m.valor}`).join('; ');
          L.push(`  - ${pos.posicao === 'concorda' ? 'Propõe' : 'Propõe o contrário'}: ${c.nome}${pags.length ? ` (programa, p. ${pags.join(', ')})` : ''}${pos.nota ? ` — ${pos.nota}` : ''}${metas ? ` — meta no programa: ${metas}` : ''}`);
        }
      }
      L.push('');
    }
    L.push(`FIM — ${UM(d.propostas.length, 'proposta', 'propostas')} neste arquivo. O texto de cada programa, tema a tema, está no índice do candidato: ${d.candidatos.map((c) => `${BASE}/${rel}/programa-${c.slug}.md`).join(' · ')}`, '');
    grava(`${rel}/tema-${def.id}.md`, L.join('\n'));
    resumoTemas.push({ id: def.id, nome: def.nome, n: d.propostas.length, porCandidato: Object.fromEntries(d.candidatos.map((c) => [c.slug, d.propostas.filter((p) => p.posicoes[c.slug]?.posicao === 'concorda').length])) });
  }
  if (!candidatos) return null;

  // ------------------------------------------------------------ o texto dos programas, por tema
  const tse = Object.fromEntries((busca.candidatos ?? []).map((c) => [c.slug, c.tse]));
  for (const c of candidatos) {
    const blocos = busca.blocos.filter((b) => b.slug === c.slug).sort((a, b) => Number(a.n) - Number(b.n));
    const grupos = new Map();
    for (const b of blocos) {
      const pag = temaDaPagina.get(b.tema) ?? 'outros';
      if (!grupos.has(pag)) grupos.set(pag, []);
      grupos.get(pag).push(b);
    }
    const indice = [`# Programa de governo de ${c.nome} (${c.partido}${c.numero ? `, nº ${c.numero}` : ''}) — ${rotulo}, 2026`, '', REGRAS, '',
      `Documento original, como registrado no TSE (PDF): ${tse[c.slug] ?? c.tse ?? 'ver a página do candidato no TSE'}`,
      `O texto abaixo é o do programa, fatiado em ${UM(blocos.length, 'bloco', 'blocos')} na ordem do documento e classificado por tema. Capa, sumário, cabeçalhos e rodapés ficaram de fora. A classificação por tema é do eleicoes.ai; o texto é do candidato.`, '',
      '| tema | blocos | páginas do PDF | propostas na comparação | texto |', '|---|---|---|---|---|'];
    for (const def of [...defs, { id: 'outros', nome: 'Apresentação e o que não entrou em tema' }]) {
      const g = grupos.get(def.id) ?? [];
      if (!g.length) { if (def.id !== 'outros') indice.push(`| ${def.nome} | 0 — o programa não tem texto classificado neste tema | — | 0 | — |`); continue; }
      const pags = g.map((b) => Number(b.pdf_pagina)).filter(Boolean);
      const nProp = resumoTemas.find((t) => t.id === def.id)?.porCandidato[c.slug] ?? 0;
      // um programa pode despejar centenas de páginas num tema só: o arquivo se divide em
      // partes de até PARTE_BYTES, sempre em fronteira de bloco, e cada parte diz qual é
      const partes = [[]];
      let peso = 0;
      for (const b of g) {
        const w = Buffer.byteLength(String(b.texto)) + 40;
        if (peso + w > PARTE_BYTES && partes.at(-1).length) { partes.push([]); peso = 0; }
        partes.at(-1).push(b);
        peso += w;
      }
      const nomeDaParte = (i) => `${rel}/programa-${c.slug}-${def.id}${partes.length > 1 ? `-${i + 1}` : ''}.md`;
      indice.push(`| ${def.nome} | ${g.length} | ${Math.min(...pags)}–${Math.max(...pags)} | ${nProp} | ${partes.map((_, i) => `${BASE}/${nomeDaParte(i)}`).join(' · ')} |`);
      partes.forEach((parte, i) => {
        const deQuantas = partes.length > 1 ? ` — parte ${i + 1} de ${partes.length}` : '';
        const T = [`# ${c.nome} — texto do programa sobre ${def.nome}${deQuantas} (${rotulo}, 2026)`, '', REGRAS, '',
          `Este arquivo tem ${UM(parte.length, 'bloco', 'blocos')}${partes.length > 1 ? ` dos ${g.length} que o programa tem neste tema` : ''} do programa de ${c.nome}, na ordem do documento. [p. N] é a página do PDF registrado no TSE (${tse[c.slug] ?? ''}).${def.id === 'outros' ? '' : ` "→" marca o bloco que sustenta proposta da comparação (${BASE}/${rel}/tema-${def.id}.md).`}`,
          ...(partes.length > 1 ? [`Todas as partes: ${partes.map((_, j) => `${BASE}/${nomeDaParte(j)}`).join(' · ')}`] : []), ''];
        let pagina = null;
        for (const b of parte) {
          if (b.pdf_pagina !== pagina) { pagina = b.pdf_pagina; T.push(`### [p. ${pagina}]`); }
          const cita = (b.propostas ?? []).length ? ` → ${b.propostas.join(', ')}` : '';
          T.push(`(${b.tema}) ${String(b.texto).replace(/\s+/g, ' ').trim()}${cita}`, '');
        }
        T.push(`FIM — ${UM(parte.length, 'bloco', 'blocos')} neste arquivo${deQuantas}.`, '');
        grava(nomeDaParte(i), T.join('\n'));
      });
    }
    indice.push('', `FIM — ${UM(blocos.length, 'bloco', 'blocos')} no programa, em ${UM([...grupos.keys()].length, 'arquivo', 'arquivos')}.`, '');
    grava(`${rel}/programa-${c.slug}.md`, indice.join('\n'));
  }

  // ------------------------------------------------------------ o mapa do escopo
  const M = [`# eleicoes.ai — ${rotulo}, eleições 2026: mapa dos dados`, '', REGRAS, '',
    `## Candidatos comparados (${candidatos.length}, em ordem alfabética)`, '',
    '| candidato | partido | nº | programa no TSE (PDF) | programa em texto |', '|---|---|---|---|---|',
    ...candidatos.map((c) => `| ${c.nome} | ${c.partido} | ${c.numero ?? ''} | ${tse[c.slug] ?? ''} | ${BASE}/${rel}/programa-${c.slug}.md |`), '',
    `## Temas (${resumoTemas.length})`, '',
    `| tema | propostas | ${candidatos.map((c) => c.nome).join(' | ')} | comparação |`, `|---|---|${candidatos.map(() => '---').join('|')}|---|`,
    ...resumoTemas.map((t) => `| ${t.nome} | ${t.n} | ${candidatos.map((c) => t.porCandidato[c.slug]).join(' | ')} | ${BASE}/${rel}/tema-${t.id}.md |`), '',
    'Os números por candidato são quantas propostas do tema o programa dele traz. Zero é silêncio do programa naquele tema.', '',
    `FIM — ${UM(candidatos.length, 'candidato', 'candidatos')}, ${UM(resumoTemas.length, 'tema', 'temas')}.`, ''];
  grava(`${rel}.md`, M.join('\n'));
  return { rel, rotulo, candidatos: candidatos.length, temas: resumoTemas.length, arquivos, bytes, maior };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const feitos = [escopo('presidente', null), ...ufsProntas('governador').map((uf) => escopo('governador', uf))].filter(Boolean);
  const total = feitos.reduce((s, f) => s + f.arquivos, 0);
  const maior = feitos.map((f) => f.maior).sort((a, b) => b[1] - a[1])[0];
  writeFileSync(join(DIST, 'ia', 'dados', 'escopos.json'), JSON.stringify(feitos.map(({ rel, rotulo, candidatos, temas }) => ({ rel, rotulo, candidatos, temas }))));
  console.log(`OK (ia): ${feitos.length} escopo(s), ${total} arquivo(s), ${(feitos.reduce((s, f) => s + f.bytes, 0) / 1e6).toFixed(1)} MB; maior: ${maior[0]} (${(maior[1] / 1024).toFixed(0)} KB)`);
  if (maior[1] > LIMITE_BYTES) { console.error(`FALHOU (ia): ${maior[0]} passa de ${LIMITE_BYTES} bytes — o assistente cortaria a leitura`); process.exit(1); }
}
