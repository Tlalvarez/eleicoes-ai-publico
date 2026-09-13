/**
 * A busca do eleicoes.ai: lexical (BM25) + vetorial (cosseno sobre vetores
 * int8) + fusão (RRF), sobre as propostas e sobre o texto integral dos
 * programas, tudo no navegador. A única chamada de rede é o vetor da
 * consulta (functions/api/vetor.js); se ela falhar, a busca segue só lexical.
 *
 * Este módulo é puro: recebe os dados carregados (documentos.json e os .bin de
 * data/busca/) e devolve resultados. Roda em Node (test/busca.test.mjs mede o
 * recall num gabarito) e no navegador (src/pages/busca.astro), sem WASM e sem
 * dependência — a CSP do site só autoriza script próprio.
 */

export const CONTRATO = 'busca/1';

/** Palavras vazias do português: não contam para a busca lexical. */
export const STOP = new Set(('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre e ou mas que se '
  + 'ao aos à às pelo pela pelos pelas num numa dum duma este esta estes estas esse essa esses essas isso isto aquele aquela aquilo '
  + 'ele ela eles elas eu tu nos vos seu sua seus suas meu minha nosso nossa lhe lhes me te é são foi ser ter tem têm há como mais '
  + 'menos muito muita muitos muitas todo toda todos todas cada qual quais onde quando também já ainda até entre contra desde '
  + 'entao então assim porque porquê pois vai vão ser sera será deve devem pode podem quer quero queria qual o que fazer faz fazem '
  + 'sobre acerca através ante após').split(/\s+/));

/** Sem acento, minúsculas, só letras e dígitos. */
export function normaliza(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Raiz leve do português: plural e alguns sufixos. Não é um stemmer completo — é o bastante para casar formas. */
export function raiz(t) {
  if (t.length <= 3) return t;
  let s = t;
  if (s.endsWith('mente') && s.length > 7) s = s.slice(0, -5);
  if (s.endsWith('coes')) s = s.slice(0, -4) + 'cao';
  else if (s.endsWith('oes') && s.length > 5) s = s.slice(0, -3) + 'ao';
  else if (s.endsWith('aes') && s.length > 5) s = s.slice(0, -3) + 'ao';
  else if (s.endsWith('ais') && s.length > 5) s = s.slice(0, -3) + 'al';
  else if (s.endsWith('eis') && s.length > 5) s = s.slice(0, -3) + 'el';
  else if (s.endsWith('is') && s.length > 5 && !s.endsWith('eis')) s = s.slice(0, -2) + 'il';
  else if (s.endsWith('ns') && s.length > 4) s = s.slice(0, -2) + 'm';
  else if (s.endsWith('s') && !s.endsWith('ss') && s.length > 4) s = s.slice(0, -1);
  return s;
}

/** Termos de um texto: normalizados, sem palavras vazias, com a raiz. */
export function termos(s) {
  const saida = [];
  for (const t of normaliza(s).split(/[^a-z0-9]+/)) {
    if (!t || t.length < 2 || STOP.has(t)) continue;
    saida.push(raiz(t));
  }
  return saida;
}

// --------------------------------------------------------------- BM25

const K1 = 1.2;
const B = 0.75;

/**
 * Um índice BM25 sobre documentos {id, texto, extra?}. `extra` (os sinônimos
 * de uma proposta) entra com peso maior: é o vocabulário que a pessoa usa, não o do programa.
 */
export function criaIndice(docs, { pesoExtra = 1.5 } = {}) {
  const postings = new Map();   // termo -> Map(docIdx -> tf ponderado)
  const tamanhos = new Float32Array(docs.length);
  let soma = 0;
  docs.forEach((d, i) => {
    const contagem = new Map();
    let n = 0;
    for (const t of termos(d.texto)) { contagem.set(t, (contagem.get(t) ?? 0) + 1); n += 1; }
    for (const t of termos(d.extra ?? '')) { contagem.set(t, (contagem.get(t) ?? 0) + pesoExtra); n += 1; }
    tamanhos[i] = n;
    soma += n;
    for (const [t, tf] of contagem) {
      if (!postings.has(t)) postings.set(t, new Map());
      postings.get(t).set(i, tf);
    }
  });
  return { n: docs.length, postings, tamanhos, media: docs.length ? soma / docs.length : 1 };
}

/** Os `k` melhores documentos para a consulta: [{i, pontos, termos: [casados]}]. */
export function buscaLexical(indice, consulta, k = 50) {
  const q = [...new Set(termos(consulta))];
  if (!q.length) return [];
  const pontos = new Map();
  const casados = new Map();
  for (const t of q) {
    const lista = indice.postings.get(t);
    if (!lista) continue;
    const idf = Math.log(1 + (indice.n - lista.size + 0.5) / (lista.size + 0.5));
    for (const [i, tf] of lista) {
      const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * indice.tamanhos[i] / indice.media));
      pontos.set(i, (pontos.get(i) ?? 0) + idf * norm);
      if (!casados.has(i)) casados.set(i, []);
      casados.get(i).push(t);
    }
  }
  // consulta com vários termos: quem casa mais termos vem antes de quem casa um só muito forte
  const saida = [...pontos].map(([i, p]) => ({ i, pontos: p * (1 + 0.5 * (casados.get(i).length - 1) / q.length), termos: casados.get(i) }));
  saida.sort((a, b) => b.pontos - a.pontos);
  return saida.slice(0, k);
}

// ------------------------------------------------------------ vetores

/** Os vetores int8 (unitários × 127), um por linha, como Int8Array. */
export function decodificaVetores(buffer, dims) {
  const v = buffer instanceof Int8Array ? buffer : new Int8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  if (v.length % dims !== 0) throw new Error(`vetores: ${v.length} bytes não é múltiplo de ${dims}`);
  return { v, dims, n: v.length / dims };
}

/** Vetor da consulta como Float32Array unitário. */
export function unitario(arr) {
  const f = Float32Array.from(arr);
  let s = 0;
  for (const x of f) s += x * x;
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < f.length; i += 1) f[i] /= n;
  return f;
}

/** Os `k` documentos mais próximos por cosseno: [{i, cos}], só acima do limiar. */
export function buscaVetorial(vetores, q, k = 50, limiar = 0) {
  const { v, dims, n } = vetores;
  if (q.length !== dims) throw new Error(`consulta com ${q.length} dims, índice com ${dims}`);
  const saida = [];
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    const base = i * dims;
    for (let j = 0; j < dims; j += 1) s += v[base + j] * q[j];
    const cos = s / 127;
    if (cos >= limiar) saida.push({ i, cos });
  }
  saida.sort((a, b) => b.cos - a.cos);
  return saida.slice(0, k);
}

// --------------------------------------------------------------- fusão

/**
 * Reciprocal rank fusion de listas de índices (na ordem de cada lista).
 * `pesos` opcional: por lista, uma função (índice, posição) → peso da
 * contribuição (1 = RRF puro).
 */
export function rrf(listas, k = 60, pesos = []) {
  const pontos = new Map();
  listas.forEach((lista, l) => {
    const peso = pesos[l] ?? (() => 1);
    lista.forEach((i, pos) => pontos.set(i, (pontos.get(i) ?? 0) + peso(i, pos) / (k + pos + 1)));
  });
  return [...pontos].sort((a, b) => b[1] - a[1]).map(([i, p]) => ({ i, pontos: p }));
}

// --------------------------------------------------------------- a busca

/**
 * Cosseno abaixo do qual um vizinho vetorial é ruído (jina-v3, 256 dims,
 * consulta × passagem: os acertos do gabarito ficam entre 0,30 e 0,68, o
 * ruído abaixo de 0,25). Não separa "assunto ausente" de "assunto presente" —
 * isso é o `fraco` de cada resultado: sem termo casado e cosseno baixo.
 */
export const LIMIAR_COSSENO = 0.25;
export const COSSENO_FORTE = 0.45;

/**
 * Prepara o estado da busca a partir de documentos.json e dos dois .bin.
 * Os documentos viram uma lista única (propostas, depois blocos), com o
 * índice lexical sobre ela e os vetores concatenados na mesma ordem.
 */
export function preparaBusca(dados, vetPropostas, vetBlocos, dims) {
  if (dados.contrato !== CONTRATO) throw new Error(`documentos.json: contrato '${dados.contrato}', esperado '${CONTRATO}'`);
  const docs = [
    ...dados.propostas.map((p) => ({ tipo: 'proposta', id: p.id, texto: `${p.subtema}. ${p.texto}`, extra: (p.sinonimos ?? []).join(' '), ref: p })),
    ...dados.blocos.map((b) => ({ tipo: 'bloco', id: b.id, texto: b.texto, ref: b })),
  ];
  const vp = decodificaVetores(vetPropostas, dims);
  const vb = decodificaVetores(vetBlocos, dims);
  if (vp.n !== dados.propostas.length || vb.n !== dados.blocos.length) {
    throw new Error(`vetores: ${vp.n}/${vb.n} linhas para ${dados.propostas.length}/${dados.blocos.length} documentos`);
  }
  const v = new Int8Array(vp.v.length + vb.v.length);
  v.set(vp.v, 0);
  v.set(vb.v, vp.v.length);
  const porId = new Map(docs.map((d, i) => [d.id, i]));
  return { dados, docs, indice: criaIndice(docs), vetores: { v, dims, n: docs.length }, porId };
}

/**
 * A busca em si. `vetorConsulta` é o Float32Array unitário da consulta ou
 * null (aí é só lexical). Devolve os documentos ranqueados (antes do
 * agrupamento), com o modo usado.
 */
export function ranqueia(estado, consulta, vetorConsulta, { k = 50 } = {}) {
  const lex = buscaLexical(estado.indice, consulta, k);
  const lexOrdem = lex.map((h) => h.i);
  let modo = 'lexical';
  let vec = [];
  if (vetorConsulta) {
    vec = buscaVetorial(estado.vetores, vetorConsulta, k, LIMIAR_COSSENO);
    modo = 'hibrido';
  }
  const lexPor = new Map(lex.map((h) => [h.i, h]));
  // um documento que casa só um termo de uma consulta longa pesa menos na fusão do que
  // o vizinho vetorial: "ensino em casa" não pode ser vencido por qualquer "ensino"
  const nTermos = new Set(termos(consulta)).size || 1;
  const pesoLex = (i) => Math.sqrt((lexPor.get(i)?.termos.length ?? 0) / nTermos);
  const fundidos = rrf([lexOrdem, vec.map((h) => h.i)], 60, [pesoLex]);
  const vecPor = new Map(vec.map((h) => [h.i, h]));
  return {
    modo,
    itens: fundidos.map(({ i, pontos }) => ({
      i, pontos, doc: estado.docs[i],
      lexical: lexPor.get(i)?.pontos ?? 0, termos: lexPor.get(i)?.termos ?? [], cos: vecPor.get(i)?.cos ?? 0,
    })),
  };
}

/**
 * Agrupa por proposta: um bloco encontrado leva à proposta que o cita (e vira
 * o trecho dela); bloco que nenhuma proposta cita fica como "trecho do programa".
 * Devolve { modo, propostas: [...], trechos: [...] }.
 */
export function busca(estado, consulta, vetorConsulta, { maxPropostas = 20, maxTrechos = 10 } = {}) {
  const { modo, itens } = ranqueia(estado, consulta, vetorConsulta);
  const propostas = new Map();
  const trechos = [];
  for (const it of itens) {
    if (it.doc.tipo === 'proposta') {
      const p = it.doc.ref;
      if (!propostas.has(p.id)) propostas.set(p.id, { ...p, pontos: it.pontos, cos: it.cos, termos: it.termos, trechos: [] });
      else propostas.get(p.id).pontos = Math.max(propostas.get(p.id).pontos, it.pontos);
      continue;
    }
    const b = it.doc.ref;
    if (b.propostas?.length) {
      for (const pid of b.propostas) {
        if (!propostas.has(pid)) {
          const p = estado.docs[estado.porId.get(pid)]?.ref;
          if (!p) continue;
          propostas.set(pid, { ...p, pontos: it.pontos * 0.9, cos: it.cos, termos: it.termos, trechos: [] });
        } else {
          // o melhor bloco decide; somar blocos inflaria propostas com muitos trechos genéricos
          const q = propostas.get(pid);
          q.pontos = Math.max(q.pontos, it.pontos * 0.9);
        }
        propostas.get(pid).trechos.push({ id: b.id, slug: b.slug, pdf_pagina: b.pdf_pagina, texto: b.texto, termos: it.termos, cos: it.cos });
      }
    } else if (trechos.length < maxTrechos) {
      trechos.push({ ...b, pontos: it.pontos, termos: it.termos, cos: it.cos });
    }
  }
  const lista = [...propostas.values()].sort((a, b) => b.pontos - a.pontos).slice(0, maxPropostas);
  // resultado fraco: nenhum termo da consulta no TEXTO da proposta ou dos trechos (sinônimo
  // gerado pelo modelo não conta como menção direta) e vizinho vetorial distante — a página
  // diz que nenhuma proposta fala disso diretamente e mostra as mais próximas
  const q = new Set(termos(consulta));
  const noTexto = (texto) => termos(texto).some((t) => q.has(t));
  for (const p of lista) {
    p.direto = noTexto(`${p.subtema} ${p.texto}`) || p.trechos.some((t) => t.termos.length);
    p.fraco = !p.direto && p.cos < COSSENO_FORTE;
    // cobertura: que fração dos termos da consulta aparece na proposta (texto,
    // subtema, sinônimos ou trechos). "escala 6x1" com só "escala" é 0,5 — e
    // isso não é falar do assunto. `relevante` é o que a matriz filtrada
    // mostra: todos os termos (ou quase, numa consulta longa), ou vizinho
    // vetorial forte (a busca por sentido pode achar sem repetir as palavras)
    const presentes = new Set(termos([p.subtema, p.texto, ...(p.sinonimos ?? []), ...p.trechos.map((t) => t.texto)].join(' ')));
    p.cobertura = q.size ? [...q].filter((t) => presentes.has(t)).length / q.size : 0;
    const quase = q.size >= 4 && p.cobertura >= 0.75;
    p.relevante = p.cobertura === 1 || quase || p.cos >= COSSENO_FORTE;
  }
  for (const t of trechos) t.fraco = !t.termos.length && t.cos < COSSENO_FORTE;
  return { modo, propostas: lista, trechos, total: propostas.size, sem_direto: lista.length === 0 || lista.every((p) => p.fraco) };
}

/**
 * Carrega os arquivos de um escopo (presidente, ou governador/<uf>) e prepara
 * o estado. `fetchFn` é o fetch do navegador (ou um leitor de arquivos nos testes).
 */
export async function carregaBusca(base, fetchFn = globalThis.fetch) {
  const [indice, dados, vp, vb] = await Promise.all([
    fetchFn(`${base}/indice.json`).then((r) => r.json()),
    fetchFn(`${base}/documentos.json`).then((r) => r.json()),
    fetchFn(`${base}/vetores-propostas.bin`).then((r) => r.arrayBuffer()),
    fetchFn(`${base}/vetores-blocos.bin`).then((r) => r.arrayBuffer()),
  ]);
  if (indice.contrato !== CONTRATO) throw new Error(`indice.json: contrato '${indice.contrato}'`);
  return preparaBusca(dados, vp, vb, indice.dimensoes);
}

/** O vetor da consulta pela função do site; null se ela falhar (a busca degrada para lexical). */
export async function vetorDaConsulta(q, { fetchFn = globalThis.fetch, url = '/api/vetor', dims } = {}) {
  try {
    const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) });
    if (!r.ok) return null;
    const d = await r.json();
    if (!Array.isArray(d?.vetor) || (dims && d.vetor.length !== dims)) return null;
    return unitario(d.vetor);
  } catch {
    return null;
  }
}
