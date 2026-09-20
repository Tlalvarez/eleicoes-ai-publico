/**
 * A busca no NAVEGADOR, compartilhada pela caixa de busca (home, hub, página
 * de tema) e pela página de tema filtrada (`?q=`).
 *
 * O resultado de uma busca não é uma lista à parte: é a própria matriz do
 * tema, só com os cartões que falam do assunto (decisão do Thiago em 13/09).
 * A caixa decide para que página ir (a do melhor resultado) e a página filtra.
 *
 * Este módulo é só orquestração: índice em cache por escopo, vetor da consulta
 * pela Function, agrupamento por página. A busca em si é src/lib/busca.mjs.
 */
import { busca, carregaBusca, vetorDaConsulta } from './busca.mjs';
import { entendePergunta, vocabularioDasPropostas } from './pergunta.mjs';

const indices = new Map();

/** O índice de um escopo (`presidente`, `governador/sp`), carregado uma vez por página. */
export function indiceDoEscopo(escopo) {
  if (!indices.has(escopo)) {
    indices.set(escopo, carregaBusca(`/busca/${escopo}`).catch((e) => { indices.delete(escopo); throw e; }));
  }
  return indices.get(escopo);
}

/**
 * PROTÓTIPO B: a pergunta, entendida com os vocabulários DO ESCOPO (candidatos e páginas de
 * documentos.json). Devolve também `primeira`, a página que abre o escopo: o endereço dela
 * redireciona para a home (ou para a página da UF), e o `?c=` não pode se perder no caminho.
 */
export async function entendeNoEscopo(escopo, q) {
  const idx = await indiceDoEscopo(escopo);
  if (!idx.vocabularioDasPropostas) idx.vocabularioDasPropostas = vocabularioDasPropostas(idx.dados.propostas);
  const e = entendePergunta(q, { candidatos: idx.dados.candidatos ?? [], paginas: idx.dados.paginas ?? [], vocabulario: idx.vocabularioDasPropostas });
  return { ...e, primeira: idx.dados.paginas?.[0]?.id ?? null };
}

/** O endereço de uma página do escopo, com a seleção de candidatos. A primeira página É a home (ou a da UF). */
export function enderecoDaPagina(escopo, pagina, primeira, selecao = '') {
  const base = pagina === primeira ? (escopo === 'presidente' ? '/' : `/${escopo}`) : `/${escopo}/${pagina}`;
  return selecao ? `${base}?c=${selecao}` : base;
}

/**
 * Busca `q` no escopo e agrupa por página (tema): devolve as propostas que
 * falam do assunto (cobertura total dos termos, ou vizinho vetorial forte —
 * "escala 6x1" não pode trazer tudo o que tem "escala"), a contagem por página na ordem do melhor
 * resultado, e o modo usado.
 */
export async function buscaPorPagina(escopo, q) {
  const idx = await indiceDoEscopo(escopo);
  const vq = await vetorDaConsulta(q, { dims: idx.vetores.dims });
  const r = busca(idx, q, vq, { maxPropostas: 200, maxTrechos: 0 });
  // só o que fala do assunto: todos os termos da consulta (ou vizinho vetorial forte)
  const propostas = r.propostas.filter((p) => p.relevante);
  const porPagina = [];
  const vistas = new Map();
  for (const p of propostas) {
    if (!vistas.has(p.pagina)) { vistas.set(p.pagina, { pagina: p.pagina, n: 0, ids: [] }); porPagina.push(vistas.get(p.pagina)); }
    const g = vistas.get(p.pagina);
    g.n += 1;
    g.ids.push(p.pid);
  }
  const nomes = Object.fromEntries((idx.dados.paginas ?? []).map((p) => [p.id, p.nome]));
  for (const g of porPagina) g.nome = nomes[g.pagina] ?? g.pagina;
  // `resgatado`: nenhuma palavra da consulta casou e o vetor decidiu. A página precisa
  // dizer isso ao leitor — resultado aproximado apresentado como certo seria pior que o
  // "nenhuma proposta fala disso" que ele substitui.
  // `ordem`: os ids na ordem do melhor resultado — a matriz filtrada abre pelo assunto que
  // melhor responde, não pelo primeiro em ordem alfabética
  return { modo: r.modo, propostas, porPagina, semDireto: r.sem_direto, resgatado: r.resgatado,
    ordem: propostas.map((p) => ({ pagina: p.pagina, pid: p.pid })) };
}

/** O endereço da matriz filtrada: a página do melhor resultado (a matriz cruza todos os temas de lá), com `q` (e a seleção de candidatos, se houver). */
export function destinoDaBusca(escopo, q, porPagina, selecao = '', pergunta = '', primeira = null) {
  if (!porPagina.length) return null;
  const partes = [`q=${encodeURIComponent(q)}`];
  // o que a pessoa escreveu viaja junto: a caixa continua mostrando a pergunta dela
  if (pergunta && pergunta !== q) partes.push(`de=${encodeURIComponent(pergunta)}`);
  if (selecao) partes.push(`c=${selecao}`);
  // a primeira página do escopo É a home (ou a página da UF): ir direto poupa o redirecionamento
  return `${enderecoDaPagina(escopo, porPagina[0].pagina, primeira)}?${partes.join('&')}`;
}
