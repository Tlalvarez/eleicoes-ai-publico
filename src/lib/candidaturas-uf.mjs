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

const TODAS = dados.candidaturas.map(enriquece)
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
