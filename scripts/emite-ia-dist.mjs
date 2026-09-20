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
import { comparacao, paginas as paginasDoCargo, paginasProntas, ufsProntas, RAIZ_PROJETO } from '../src/lib/comparacao-dados.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const ORIGEM = (process.env.IA_ORIGEM || 'https://eleicoes.ai').replace(/\/$/, '');
const BASE = `${ORIGEM}/ia/dados`;
export const LIMITE_BYTES = 120_000;
const PARTE_BYTES = 60_000;

/**
 * O mesmo conteúdo em HTML simples. Medido em 18/09/2026 no ChatGPT de verdade: o leitor dele
 * chegou como ChatGPT-User, recebeu o cartão e respondeu "Unsupported content-type:
 * text/markdown". HTML é o único formato que todo assistente abre; o .md continua ao lado, para
 * quem o prefere. Os links do HTML apontam para HTML (o endereço público é sem extensão).
 * Conversor mínimo, só do que estes arquivos usam: títulos, listas, tabelas, negrito e links.
 */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const emLinha = (s) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/https?:\/\/[^\s<|)]+[^\s<|).,;:]/g, (u) => `<a href="${u}">${u}</a>`);
/**
 * O gêmeo HTML de um arquivo de dados.
 *
 * `canonico` é o endereço público da própria página. Quando ele vem, a página é INDEXÁVEL; sem ele,
 * ela sai `noindex`. A diferença nasceu em 19/09/2026: o Claude abriu a home, leu no cartão o endereço
 * de São Paulo escrito como link de verdade, e mesmo assim recusou abri-lo — a ferramenta dele só abre
 * endereço que veio da pessoa ou de uma BUSCA. Como todo /ia/dados era noindex, nenhuma busca podia
 * conhecê-los, e o acervo ficava inalcançável para esse assistente. O cartão continua noindex: ele é a
 * home em outro formato, não uma página a mais.
 */
export function paraHtml(md, tituloPadrao = 'eleicoes.ai', canonico = null) {
  const linhas = md.replace(/(\/ia\/dados\/[A-Za-z0-9_\/.-]+?)\.md\b/g, '$1').split('\n');
  const titulo = (linhas.find((l) => l.startsWith('# ')) ?? `# ${tituloPadrao}`).slice(2);
  const out = [];
  let lista = false; let tabela = false; let h1 = false;
  const fecha = () => { if (lista) { out.push('</ul>'); lista = false; } if (tabela) { out.push('</table>'); tabela = false; } };
  for (const l of linhas) {
    if (/^\|[-| ]+\|$/.test(l)) continue;
    if (l.startsWith('|')) {
      if (!tabela) { fecha(); out.push('<table>'); tabela = true; }
      out.push(`<tr>${l.slice(1, -1).split('|').map((c) => `<td>${emLinha(c.trim())}</td>`).join('')}</tr>`);
      continue;
    }
    const item = /^(\s*)(?:-|\d+\.) (.*)$/.exec(l);
    if (item) {
      if (!lista) { fecha(); out.push('<ul>'); lista = true; }
      out.push(`<li${item[1] ? ' class="sub"' : ''}>${emLinha(item[2])}</li>`);
      continue;
    }
    fecha();
    if (!l.trim()) continue;
    const h = /^(#{1,3}) (.*)$/.exec(l);
    if (h) { const n = h[1].length === 1 && !h1 ? 1 : Math.max(2, h[1].length); if (n === 1) h1 = true; out.push(`<h${n}>${emLinha(h[2])}</h${n}>`); continue; }
    out.push(`<p>${emLinha(l.replace(/^> /, ''))}</p>`);
  }
  fecha();
  if (!h1) out.unshift(`<h1>${esc(titulo)}</h1>`);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${canonico ? `<link rel="canonical" href="${canonico}">` : '<meta name="robots" content="noindex, follow">'}<title>${esc(titulo)} · eleicoes.ai</title></head><body><a class="skip-link" href="#conteudo">Pular para o conteúdo</a><main id="conteudo">\n${out.join('\n')}\n</main></body></html>\n`;
}

const escreve = (rel, texto) => {
  const arq = join(DIST, 'ia', 'dados', rel);
  mkdirSync(dirname(arq), { recursive: true });
  writeFileSync(arq, texto);
  // o endereço público é sem `.md` (ver Base.astro e o emissor do sitemap)
  const canonico = `https://eleicoes.ai/ia/dados/${rel.replace(/\.md$/, '')}`;
  writeFileSync(arq.replace(/\.md$/, '.html'), paraHtml(texto, 'eleicoes.ai', canonico));
  return Buffer.byteLength(texto);
};
const UM = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const REGRAS = `> Fonte: eleicoes.ai — programas de governo registrados no TSE (eleições 2026). Use SÓ o que está nestes arquivos para falar dos programas; cite o candidato e a página do programa; não recomende voto. Estados possíveis de um candidato numa proposta: PROPÕE (há trecho), PROPÕE O CONTRÁRIO (há trecho que rejeita a mesma medida), NÃO LOCALIZADO (não achamos trecho no programa dele NESTE tema — não é "é contra", e não é prova de que o programa não trata do assunto: o trecho pode estar classificado em outro tema; procure no índice de assuntos e no texto do programa antes de afirmar ausência, e prefira dizer "não localizei").`;

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
  const indiceAssuntos = [];    // assunto -> arquivo que o contém, com as palavras que as pessoas usam
  const sinonimos = new Map((busca.propostas ?? []).map((p) => [`${p.pagina}/${p.pid}`, p.sinonimos ?? []]));
  const panorama = [];          // por tema: cobertura, divergências explícitas, o que mais gente propõe
  let geradoEm = null;
  const tse = Object.fromEntries((busca.candidatos ?? []).map((c) => [c.slug, c.tse]));
  // ------------------------------------------------------------ a comparação, tema a tema
  for (const def of defs) {
    const d = comparacao(cargo, uf, def.id);
    if (!d?.propostas?.length) continue;
    candidatos ??= d.candidatos;
    // `gerado_em` é de quando a matriz NASCEU; `exportado_em`, de quando ela foi publicada como está. A
    // terceira auditoria do ChatGPT (19/09/2026) leu "dados gerados em 14 de setembro" num panorama que
    // tinha mudado no mesmo dia. Vale a mais recente das duas, que é a que descreve o que se está lendo.
    for (const q of [d.origem?.gerado_em, d.origem?.exportado_em]) if (q && (!geradoEm || q > geradoEm)) geradoEm = q;
    const assuntos = [...new Set(d.propostas.map((p) => p.subtema))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const cabecalho = (parte, total, n) => [`# ${def.nome} — o que cada programa propõe${total > 1 ? ` — parte ${parte} de ${total}` : ''} (${rotulo}, 2026)`, '', REGRAS, '',
      `Este arquivo tem ${UM(n, 'proposta', 'propostas')}${total > 1 ? ` das ${d.propostas.length} do tema` : ''}, por assunto, em ordem alfabética. Candidatos comparados: ${d.candidatos.map((c) => c.nome).join(', ')}.`,
      `"Propõe" = há trecho do programa que sustenta a proposta. "Propõe o contrário" = há trecho que rejeita a mesma medida. Candidato que não aparece numa proposta = NÃO LOCALIZADO: não achamos trecho no programa dele; não é discordância. As frases das propostas são RESUMOS do eleicoes.ai; o texto do candidato é o trecho (bNNN), que está no arquivo de texto do programa dele neste tema.`,
      `Ver na tela: ${paginaDoSite(def.id)}`,
      `Programa de cada candidato no TSE (PDF): ${d.candidatos.map((c) => `${c.nome} ${tse[c.slug] ?? ''}`).join(' · ')}`, ''];
    // um tema pode passar do que um assistente lê sem cortar (AM, economia: 121 KB): divide-se em
    // partes de até PARTE_BYTES, sempre em fronteira de assunto
    const secoes = assuntos.map((a) => {
      const S = [`## ${a}`, ''];
      const doAssunto = d.propostas.filter((x) => x.subtema === a);
      for (const p of doAssunto) {
        S.push(`- **${p.proposta}** [${def.id}/${p.id}]`);
        for (const c of d.candidatos) {
          const pos = p.posicoes[c.slug];
          if (!pos || (pos.posicao !== 'concorda' && pos.posicao !== 'discorda')) continue;
          const pags = [...new Set((pos.blocos ?? []).map((b) => d.blocos?.[c.slug]?.[b]?.pagina).filter(Boolean))].sort((x, y) => x - y);
          const metas = (pos.metas ?? []).map((m) => `${m.rotulo}: ${m.valor}`).join('; ');
          const trechos = (pos.blocos ?? []).length ? `; trecho ${pos.blocos.map((b) => `b${b}`).join(', ')}` : '';
          S.push(`  - ${pos.posicao === 'concorda' ? 'Propõe' : 'Propõe o contrário'}: ${c.nome}${pags.length ? ` (programa, p. ${pags.join(', ')}${trechos})` : ''}${pos.nota ? ` — ${pos.nota}` : ''}${metas ? ` — meta no programa: ${metas}` : ''}`);
        }
      }
      S.push('');
      return { texto: S.join('\n'), n: doAssunto.length, assunto: a };
    });
    const partesTema = [[]];
    let pesoTema = 0;
    for (const s of secoes) {
      const w = Buffer.byteLength(s.texto);
      if (pesoTema + w > PARTE_BYTES && partesTema.at(-1).length) { partesTema.push([]); pesoTema = 0; }
      partesTema.at(-1).push(s);
      pesoTema += w;
    }
    const nomeTema = (i) => `${rel}/tema-${def.id}${partesTema.length > 1 ? `-${i + 1}` : ''}.md`;
    const rodape = `O texto de cada programa, tema a tema, está no índice do candidato: ${d.candidatos.map((c) => `${BASE}/${rel}/programa-${c.slug}.md`).join(' · ')}`;
    partesTema.forEach((parte, i) => {
      for (const s of parte) {
        const termos = [...new Set(d.propostas.filter((p) => p.subtema === s.assunto).flatMap((p) => sinonimos.get(`${def.id}/${p.id}`) ?? []))].slice(0, 10);
        indiceAssuntos.push({ tema: def.nome, assunto: s.assunto, n: s.n, url: `${BASE}/${nomeTema(i)}`, termos });
      }
      const n = parte.reduce((s, x) => s + x.n, 0);
      grava(nomeTema(i), [...cabecalho(i + 1, partesTema.length, n),
        ...(partesTema.length > 1 ? [`Todas as partes: ${partesTema.map((_, j) => `${BASE}/${nomeTema(j)}`).join(' · ')}`, ''] : []),
        ...parte.map((x) => x.texto), `FIM — ${UM(n, 'proposta', 'propostas')} neste arquivo. ${rodape}`, ''].join('\n'));
    });
    if (partesTema.length > 1) {
      grava(`${rel}/tema-${def.id}.md`, [`# ${def.nome} — o que cada programa propõe (${rotulo}, 2026)`, '', REGRAS, '',
        `Este tema tem ${d.propostas.length} propostas e está em ${partesTema.length} partes. Leia todas antes de concluir que algo não foi localizado:`,
        ...partesTema.map((_, i) => `- parte ${i + 1}: ${BASE}/${nomeTema(i)}`), '',
        `FIM — 0 propostas neste arquivo: ele só aponta para as ${partesTema.length} partes.`, ''].join('\n'));
    }
    const nQuem = (p) => d.candidatos.filter((c) => p.posicoes[c.slug]?.posicao === 'concorda').length;
    panorama.push({
      def,
      contrarias: d.propostas.filter((p) => d.candidatos.some((c) => p.posicoes[c.slug]?.posicao === 'discorda')),
      comuns: d.propostas.filter((p) => nQuem(p) >= 2).sort((a, b) => nQuem(b) - nQuem(a) || Number(a.id.slice(1)) - Number(b.id.slice(1))).slice(0, 5),
      exclusivas: Object.fromEntries(d.candidatos.map((c) => [c.slug, d.propostas.filter((p) => nQuem(p) === 1 && p.posicoes[c.slug]?.posicao === 'concorda').length])),
      posicoes: (p) => d.candidatos.filter((c) => ['concorda', 'discorda'].includes(p.posicoes[c.slug]?.posicao))
        .map((c) => `${p.posicoes[c.slug].posicao === 'concorda' ? 'propõe' : 'PROPÕE O CONTRÁRIO'}: ${c.nome}${p.posicoes[c.slug].nota ? ` (${p.posicoes[c.slug].nota})` : ''}`).join('; '),
    });
    resumoTemas.push({ id: def.id, nome: def.nome, n: d.propostas.length, porCandidato: Object.fromEntries(d.candidatos.map((c) => [c.slug, d.propostas.filter((p) => p.posicoes[c.slug]?.posicao === 'concorda').length])) });
  }
  if (!candidatos) return null;

  // ------------------------------------------------------------ o texto dos programas, por tema
  const cobertura = {};        // slug -> página -> quantos blocos de texto o programa tem ali
  for (const c of candidatos) {
    const blocos = busca.blocos.filter((b) => b.slug === c.slug).sort((a, b) => Number(a.n) - Number(b.n));
    const grupos = new Map();
    cobertura[c.slug] = {};
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
      cobertura[c.slug][def.id] = g.length;
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
      if (partes.length > 1) {
        grava(`${rel}/programa-${c.slug}-${def.id}.md`, [`# ${c.nome} — texto do programa sobre ${def.nome} (${rotulo}, 2026)`, '', REGRAS, '',
          `Este texto é longo e está em ${partes.length} partes. Leia todas antes de concluir que o programa não trata de um assunto:`,
          ...partes.map((_, i) => `- parte ${i + 1}: ${BASE}/${nomeDaParte(i)}`), '',
          `FIM — 0 blocos neste arquivo: ele só aponta para as ${partes.length} partes.`, ''].join('\n'));
      }
      partes.forEach((parte, i) => {
        const deQuantas = partes.length > 1 ? ` — parte ${i + 1} de ${partes.length}` : '';
        const T = [`# ${c.nome} — texto do programa sobre ${def.nome}${deQuantas} (${rotulo}, 2026)`, '', REGRAS, '',
          `Este arquivo tem ${UM(parte.length, 'bloco', 'blocos')}${partes.length > 1 ? ` dos ${g.length} que o programa tem neste tema` : ''} do programa de ${c.nome}, na ordem do documento. [p. N] é a página do PDF registrado no TSE (${tse[c.slug] ?? ''}).${def.id === 'outros' ? '' : ` "→" marca o bloco que sustenta proposta da comparação (${BASE}/${rel}/tema-${def.id}.md).`}`,
          ...(partes.length > 1 ? [`Todas as partes: ${partes.map((_, j) => `${BASE}/${nomeDaParte(j)}`).join(' · ')}`] : []), ''];
        let pagina = null;
        for (const b of parte) {
          if (b.pdf_pagina !== pagina) { pagina = b.pdf_pagina; T.push(`### [p. ${pagina}]`); }
          const cita = (b.propostas ?? []).length ? ` → ${b.propostas.join(', ')}` : '';
          T.push(`[b${b.n}] (${b.tema}) ${String(b.texto).replace(/\s+/g, ' ').trim()}${cita}`, '');
        }
        T.push(`FIM — ${UM(parte.length, 'bloco', 'blocos')} neste arquivo${deQuantas}.`, '');
        grava(nomeDaParte(i), T.join('\n'));
      });
    }
    indice.push('', `FIM — ${UM(blocos.length, 'bloco', 'blocos')} no programa, em ${UM([...grupos.keys()].length, 'arquivo', 'arquivos')}.`, '');
    grava(`${rel}/programa-${c.slug}.md`, indice.join('\n'));
  }

  // ------------------------------------------------------------ o panorama da disputa
  // O ChatGPT levou 4m40s para responder "como os candidatos do RJ são diferentes?" abrindo tema
  // por tema (18/09), e pediu UMA consulta com candidatos, posições, evidências e limites. É este
  // arquivo. Nada aqui é juízo: a seleção é por regra (toda posição contrária; as cinco propostas
  // com mais candidatos, desempate pelo menor id), igual para todos.
  const criterio = (() => { try { const c = JSON.parse(readFileSync(join(RAIZ_PROJETO, 'data', 'comparacao', 'criterio.json'), 'utf8')); return uf ? c[cargo]?.[uf] : c[cargo]; } catch { return null; } })();
  const P = [`# Panorama da disputa — ${rotulo}, 2026: onde os programas se encontram e onde se opõem`, '', REGRAS, '',
    `Dados atualizados em ${geradoEm ?? 'data não registrada'}. Candidatos comparados (${candidatos.length}): ${candidatos.map((c) => `${c.nome} (${c.partido})`).join(', ')}.`,
    ...(criterio ? [`Critério de inclusão: até ${criterio.corte ?? 6} candidatos com pelo menos ${criterio.minimo_pct ?? 1}% na pesquisa ${criterio.instituto ?? ''}${criterio.registro ? `, registro ${criterio.registro} no TSE` : ''}${criterio.campo_inicio ? `, campo de ${criterio.campo_inicio} a ${criterio.campo_fim}` : ''}; fica fora quem teve o registro indeferido ou não registrou programa.`,
      ...((criterio.fora ?? []).length ? [`Fora da comparação: ${criterio.fora.map((x) => `${x.nome} — ${x.motivo}`).join('; ')}.`] : [])] : []),
    '', 'Limites: este panorama mostra TODAS as posições contrárias explícitas e só as cinco propostas com mais candidatos por tema; a lista inteira está no arquivo de cada tema. "0 propostas" ou "0 blocos" descreve o que foi extraído e classificado NESTE tema, não o programa inteiro: o mesmo assunto pode estar em outro tema. A associação de um candidato a uma proposta também pode FALTAR (o trecho existe e não foi ligado): ausência aqui é "não localizado", nunca "o programa não trata".', ''];
  for (const x of panorama) {
    P.push(`## ${x.def.nome} — ${BASE}/${rel}/tema-${x.def.id}.md`, '',
      `Cobertura (propostas / blocos de texto do programa no tema): ${candidatos.map((c) => `${c.nome} ${resumoTemas.find((r) => r.id === x.def.id)?.porCandidato[c.slug] ?? 0}/${cobertura[c.slug]?.[x.def.id] ?? 0}`).join(' · ')}`,
      `Propostas que só um candidato faz: ${candidatos.map((c) => `${c.nome} ${x.exclusivas[c.slug]}`).join(' · ')}`, '');
    P.push(x.contrarias.length ? 'Posições contrárias explícitas:' : 'Posições contrárias explícitas: nenhuma registrada neste tema.');
    for (const p of x.contrarias) P.push(`- ${p.proposta} [${x.def.id}/${p.id}] — ${x.posicoes(p)}`);
    P.push('', 'Propostas com mais candidatos:');
    for (const p of x.comuns) P.push(`- ${p.proposta} [${x.def.id}/${p.id}] — ${x.posicoes(p)}`);
    P.push('');
  }
  P.push(`FIM — panorama de ${UM(panorama.length, 'tema', 'temas')}.`, '');
  grava(`${rel}/panorama.md`, P.join('\n'));

  // ------------------------------------------------------------ o índice de assuntos
  // A busca sem busca. O leitor de um assistente só abre endereço que já viu escrito: ele não
  // monta `?q=`. Então o que seria uma consulta vira um índice que ele lê e segue — cada assunto,
  // com as palavras que as pessoas usam para ele (os sinônimos que a busca do site já confere),
  // aponta para o arquivo exato onde está.
  const I = [`# Índice de assuntos — ${rotulo}, 2026: onde está cada coisa`, '', REGRAS, '',
    `Este índice tem ${UM(indiceAssuntos.length, 'assunto', 'assuntos')}. Procure a palavra da pergunta (ou uma parecida) e abra o arquivo indicado. Se a palavra não estiver aqui, o assunto pode estar dentro de outro: abra o tema mais provável antes de dizer "não localizado".`, ''];
  let temaAtual = null;
  for (const x of indiceAssuntos) {
    if (x.tema !== temaAtual) { temaAtual = x.tema; I.push(`## ${x.tema}`, ''); }
    I.push(`- **${x.assunto}** (${UM(x.n, 'proposta', 'propostas')})${x.termos.length ? ` — também: ${x.termos.join(', ')}` : ''} — ${x.url}`);
  }
  I.push('', `FIM — ${UM(indiceAssuntos.length, 'assunto', 'assuntos')} neste índice.`, '');
  grava(`${rel}/assuntos.md`, I.join('\n'));

  // ------------------------------------------------------------ o mapa do escopo
  const M = [`# eleicoes.ai — ${rotulo}, eleições 2026: mapa dos dados`, '', REGRAS, '',
    `Pergunta geral sobre a disputa ("como os candidatos são diferentes?")? Comece pelo PANORAMA, que cabe numa leitura: ${BASE}/${rel}/panorama.md`,
    `Pergunta sobre um assunto específico ("o que dizem sobre a escala 6x1?")? Ache o assunto no ÍNDICE e abra o arquivo que ele indica: ${BASE}/${rel}/assuntos.md`,
    `Os mesmos dados em JSON, para quem lê JSON: ${ORIGEM}/comparacao/${rel}/<tema>.json`, '',
    `## Candidatos comparados (${candidatos.length}, em ordem alfabética)`, '',
    '| candidato | partido | nº | programa no TSE (PDF) | programa em texto |', '|---|---|---|---|---|',
    ...candidatos.map((c) => `| ${c.nome} | ${c.partido} | ${c.numero ?? ''} | ${tse[c.slug] ?? ''} | ${BASE}/${rel}/programa-${c.slug}.md |`), '',
    `## Temas (${resumoTemas.length})`, '',
    `| tema | propostas | ${candidatos.map((c) => c.nome).join(' | ')} | comparação |`, `|---|---|${candidatos.map(() => '---').join('|')}|---|`,
    ...resumoTemas.map((t) => `| ${t.nome} | ${t.n} | ${candidatos.map((c) => t.porCandidato[c.slug]).join(' | ')} | ${BASE}/${rel}/tema-${t.id}.md |`), '',
    // 18/09: a segunda auditoria do ChatGPT pegou a frase que estava aqui ("zero é silêncio do programa"):
    // Renan Santos tem zero em Trabalho e previdência, e o programa dele propõe desindexar benefícios
    // previdenciários do salário mínimo — o trecho (b135, p. 10) está classificado em Economia.
    'Os números por candidato são quantas propostas FORAM EXTRAÍDAS do programa dele NESTE tema. Zero NÃO quer dizer que o programa não trata do assunto: o trecho pode estar classificado em outro tema (previdência aparece em Economia, por exemplo). Antes de afirmar ausência, procure o assunto no índice de assuntos e no texto do programa.', '',
    `FIM — ${UM(candidatos.length, 'candidato', 'candidatos')}, ${UM(resumoTemas.length, 'tema', 'temas')}.`, ''];
  grava(`${rel}.md`, M.join('\n'));
  return { rel, rotulo, candidatos: candidatos.length, temas: resumoTemas.length, temas_lista: resumoTemas.map(({ id, nome }) => ({ id, nome })), arquivos, bytes, maior };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const feitos = [escopo('presidente', null), ...ufsProntas('governador').map((uf) => escopo('governador', uf))].filter(Boolean);
  const total = feitos.reduce((s, f) => s + f.arquivos, 0);
  const maior = feitos.map((f) => f.maior).sort((a, b) => b[1] - a[1])[0];
  // ---------------------------------------------------------- o cartão de visita (/llms.txt)
  // O que o assistente lê primeiro — e, se a pessoa só digitou o endereço, a única coisa que
  // ele precisa ler para responder. Curto de propósito: a primeira resposta tem de ser rápida.
  const pres = feitos.find((f) => f.rel === 'presidente');
  const ufs = feitos.filter((f) => f.rel.startsWith('governador/'));
  // as sugestões saem dos DADOS (os três primeiros temas de presidente e os exemplos de assunto
  // que a busca já confere) e nunca citam candidato — quem escolhe nomes é a pessoa
  const arqEx = join(RAIZ, 'data', 'busca', 'presidente', 'exemplos.json');
  const assuntos = existsSync(arqEx) ? JSON.parse(readFileSync(arqEx, 'utf8')).exemplos.slice(0, 2) : [];
  const temas3 = (pres?.temas_lista ?? []).slice(0, 3).map((x) => x.nome.toLowerCase());
  const sugestoes = [
    ...(temas3[0] ? [`O que cada candidato a Presidente propõe para ${temas3[0]}?`] : []),
    ...(temas3[1] ? [`Onde os programas mais se parecem e onde se opõem em ${temas3[1]}?`] : []),
    ...(temas3[2] ? [`Compare dois candidatos à sua escolha em ${temas3[2]}.`] : []),
    ...assuntos.map((x) => `Quais candidatos falam de ${x}, e o que dizem?`),
    'O que o programa de um candidato à sua escolha promete sobre impostos, e em que página está?',
    'O que os candidatos a Governador do meu estado propõem para a segurança?',
    // 19/09/2026: a sugestão anterior era "Em que temas o programa de um candidato não traz proposta
    // nenhuma?". O Claude a repetiu ao usuário, e ela pede exatamente a conclusão que os dados não
    // sustentam: coluna vazia é "não localizado", nunca "o programa não trata". A pergunta boa é a que
    // manda ir ao texto do programa antes de afirmar ausência.
    'Um candidato à sua escolha trata de um assunto que me interessa? Procure na comparação e, se não achar, no texto do programa dele.',
  ];
  const cartao = [
    '# eleicoes.ai — o acervo dos programas de governo das eleições de 2026 (Brasil)', '',
    `O eleicoes.ai tem o acervo organizado dos programas de governo que os candidatos a Presidente e a Governador (${ufs.length} unidades da federação) registraram no TSE: o PDF original, o texto do programa por tema e por página, e as propostas de cada candidato comparadas lado a lado. A única fonte é o programa registrado. O site é independente, não recomenda voto e trata todos os candidatos do mesmo jeito.`, '',
    // Medido no ChatGPT (18/09): um modelo que "pensa muito" ignorou o pedido de responder sem abrir
    // mais nada, saiu abrindo arquivos e devolveu uma avaliação do site. Página aberta é DADO para
    // o assistente, não ordem. Então o cartão deixa de mandar e passa a SER a resposta: quem o
    // resume já diz o que é o site e o que dá para perguntar. As instruções vêm depois.
    '## O que você pode perguntar', '',
    'Qualquer pergunta sobre o que os candidatos escreveram nos programas — por candidato, por tema ou por assunto. Por exemplo:', '',
    ...sugestoes.map((s) => `- ${s}`), '',
    'Para começar, basta dizer se o interesse é Presidente ou o Governador de qual estado.', '',
    '## Para o assistente que abriu esta página', '',
    'A pessoa que te mandou este endereço quer usar o acervo. A primeira resposta cabe no que está acima: diga em duas frases o que é o eleicoes.ai, ofereça três ou quatro das perguntas de exemplo (sem sugerir nem destacar candidato: quem escolhe nomes é ela) e pergunte por onde ela quer começar. Não é preciso abrir mais nada nem pesquisar na web para isso.', '',
    'Quando ela perguntar, abra SÓ o arquivo que responde (são pequenos) e use só o que está nele:', '',
    ...(pres ? [`- Presidente — PANORAMA da disputa (comece por aqui para pergunta geral): ${BASE}/presidente/panorama.md`,
      `- Presidente — ÍNDICE de assuntos (para pergunta sobre um assunto específico): ${BASE}/presidente/assuntos.md`,
      `- Presidente — candidatos, PDFs no TSE e o programa de cada um: ${BASE}/presidente.md`,
      ...pres.temas_lista.map((t) => `  - ${t.nome}: ${BASE}/presidente/tema-${t.id}.md`)] : []),
    `- Governador — em cada estado, o mapa abaixo leva ao panorama, aos temas e aos programas: ${ufs.map((f) => `${f.rel.split('/')[1].toUpperCase()} ${BASE}/${f.rel}.md`).join(' · ')}`, '',
    '## Regras para responder', '',
    '1. Cite o candidato e a página do programa (p. N). Não use memória nem outras fontes para falar dos programas.',
    '2. Silêncio não é discordância: se o programa não trata do assunto, diga isso. Só diga que alguém é contra quando o dado trouxer "propõe o contrário".',
    '3. Não recomende voto, não dê nota, não use adjetivo de qualidade sobre programa, e não escreva "todos" ou "consenso" sem contar candidato por candidato.',
    '4. Não adivinhe endereço: use os que estão escritos aqui e nos mapas. Cada arquivo termina com uma linha FIM; sem ela, a leitura foi cortada.',
    `5. Como os dados foram feitos e as regras completas: ${ORIGEM}/ia`, '',
    'FIM — cartão de visita do eleicoes.ai.', ''].join('\n');
  writeFileSync(join(DIST, 'llms.txt'), cartao);
  // o cartão em HTML é o que a rota / entrega ao assistente (functions/index.js)
  mkdirSync(join(DIST, 'ia'), { recursive: true });
  writeFileSync(join(DIST, 'ia', 'cartao.html'), paraHtml(cartao));
  console.log(`OK (ia): /llms.txt com ${Buffer.byteLength(cartao)} bytes`);
  writeFileSync(join(DIST, 'ia', 'dados', 'escopos.json'), JSON.stringify(feitos.map(({ rel, rotulo, candidatos, temas }) => ({ rel, rotulo, candidatos, temas }))));
  console.log(`OK (ia): ${feitos.length} escopo(s), ${total} arquivo(s), ${(feitos.reduce((s, f) => s + f.bytes, 0) / 1e6).toFixed(1)} MB; maior: ${maior[0]} (${(maior[1] / 1024).toFixed(0)} KB)`);
  if (maior[1] > LIMITE_BYTES) { console.error(`FALHOU (ia): ${maior[0]} passa de ${LIMITE_BYTES} bytes — o assistente cortaria a leitura`); process.exit(1); }
}
