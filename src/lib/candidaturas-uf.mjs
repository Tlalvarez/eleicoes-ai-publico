/**
 * Candidaturas por UF (governador, senador, deputado federal) — a lista pública
 * do DivulgaCandContas (TSE), congelada em src/data/candidaturas-2026-uf.json.
 *
 * O que sai daqui vai para os cards das páginas por cargo/UF e para a conversa
 * por candidato. Regras iguais às da home: cobertura simétrica (todo candidato
 * do snapshot ganha card e página), ordem alfabética (nunca por volume),
 * nenhum nome escrito à mão.
 */
import dados from '../data/candidaturas-2026-uf.json' with { type: 'json' };

import { BASE_DIVULGA } from './tse.mjs';

export const ELEICAO = dados.eleicao;
export const COLETADO_EM = dados.coletado_em;

/** Palavras que ficam minúsculas dentro de um nome ("Maria da Penha"). */
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'della', 'von', 'van', 'y']);

/** "MARIA DA PENHA" → "Maria da Penha". Nome de urna vem em caixa alta do TSE. */
export function nomeLegivel(nomeUrna) {
  return String(nomeUrna ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p)) ? p
      : p.split('-').map((q) => q.charAt(0).toUpperCase() + q.slice(1)).join('-'))
    .join(' ');
}

function slugify(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** A foto oficial do registro, servida pelo TSE (161×225). */
export function urlFotoTse(c) {
  return `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${ELEICAO.id_eleicao}/${c.id}/${c.uf}`;
}

/** A página da candidatura na interface do DivulgaCandContas (mesmo formato da home). */
export function urlTseUf(c) {
  return `${BASE_DIVULGA}/BR/${c.uf}/${ELEICAO.id_eleicao}/${c.id}/${ELEICAO.ano}/${c.uf}`;
}

function enriquece(c) {
  return { ...c, nome: nomeLegivel(c.nome_urna), slug: `${slugify(c.nome_urna)}-${c.id}`,
    foto: urlFotoTse(c), tse: urlTseUf(c) };
}

/**
 * UMA CANDIDATURA POR PESSOA, POR CARGO E UF.
 *
 * A lista do DivulgaCandContas traz, para algumas pessoas, dois registros do
 * mesmo cargo na mesma UF — o partido protocolou o pedido duas vezes, ou a
 * pessoa trocou de partido/número e o registro antigo ficou na lista com
 * situação de renúncia ou indeferimento. No snapshot de 04/09/2026 eram 18
 * pessoas (Guto Schiavetto, senador por SP, entre elas). Dois cards da mesma
 * pessoa é erro de leitura para quem visita: não há dois candidatos.
 *
 * A pessoa é identificada pelo NOME COMPLETO registrado (o nome de urna varia
 * entre os dois registros em alguns casos: "DR. JOAO NETO" / "DR JOÃO NETO";
 * acento e espaço duplicado no nome completo também são ignorados).
 * Fica o registro que está mais vivo no TSE — deferido antes de aguardando,
 * aguardando antes de indeferido, indeferido antes de renúncia — e, em empate,
 * o registro MAIS RECENTE (id sequencial maior): é o pedido que substituiu o
 * anterior. Pessoas diferentes com o mesmo número no mesmo partido (uma
 * renunciou, outra assumiu a vaga) são duas candidaturas e ficam as duas.
 */
const PRIORIDADE_SITUACAO = [
  'Deferido',
  'Deferido com recurso',
  'Aguardando julgamento',
  'Pendente de julgamento',
  'Indeferido em prazo recursal ou com recurso',
  'Indeferido',
  'Pedido não conhecido',
  'Renúncia',
];

function chavePessoa(c) {
  const nome = String(c.nome_completo || c.nome_urna || '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  return `${c.cargo}|${c.uf}|${nome}`;
}

/** Quanto menor, mais vivo o registro. Situação desconhecida vai para o fim. */
function postoSituacao(c) {
  const i = PRIORIDADE_SITUACAO.indexOf(String(c.situacao ?? '').trim());
  return i === -1 ? PRIORIDADE_SITUACAO.length : i;
}

/** O registro que representa a pessoa, entre dois do mesmo cargo/UF. */
function melhorRegistro(a, b) {
  const dif = postoSituacao(a) - postoSituacao(b);
  if (dif !== 0) return dif < 0 ? a : b;
  // ids são sequenciais no TSE: o maior é o pedido mais recente
  return BigInt(b.id) > BigInt(a.id) ? b : a;
}

export function deduplicaPorPessoa(lista) {
  const porPessoa = new Map();
  for (const c of lista) {
    const k = chavePessoa(c);
    const atual = porPessoa.get(k);
    porPessoa.set(k, atual ? melhorRegistro(atual, c) : c);
  }
  return [...porPessoa.values()];
}

const TODAS = deduplicaPorPessoa(dados.candidaturas).map(enriquece)
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id));

/** Todas as candidaturas de um cargo numa UF, em ordem alfabética. */
export function candidaturas(cargoSlug, sigla) {
  const uf = String(sigla).toUpperCase();
  return TODAS.filter((c) => c.cargo === cargoSlug && c.uf === uf);
}

export function todasCandidaturas() {
  return TODAS;
}

export function totais() {
  const por = {};
  for (const c of TODAS) por[c.cargo] = (por[c.cargo] ?? 0) + 1;
  return { total: TODAS.length, por_cargo: por };
}
