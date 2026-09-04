/**
 * A página oficial de cada candidatura no TSE (DivulgaCandContas).
 *
 * As seções internas de candidato e de acervo estão escondidas por ora; o
 * retrato na home leva ao registro OFICIAL da candidatura. O endereço é
 * montado do identificador declarado em src/data/candidaturas-tse.json — e
 * candidato sem identificador é ERRO de build, não card sem link: um card que
 * leva a lugar nenhum enquanto os outros levam ao TSE é cobertura assimétrica.
 */
import candidaturas from '../data/candidaturas-tse.json' with { type: 'json' };

export const BASE_DIVULGA = 'https://divulgacandcontas.tse.jus.br/divulga/#/candidato';

export function urlCandidaturaTse(slug, dados = candidaturas) {
  const c = dados.candidatos[slug];
  if (!c || !/^\d+$/.test(String(c.id_candidatura))) {
    throw new Error(`Candidatura sem identificador no TSE: ${slug} (src/data/candidaturas-tse.json)`);
  }
  const { ano, id_eleicao, abrangencia } = dados.eleicao;
  return `${BASE_DIVULGA}/${ano}/${id_eleicao}/${abrangencia}/${c.id_candidatura}`;
}

/** {slug: url} de todas as candidaturas declaradas. */
export function urlsPorSlug(dados = candidaturas) {
  return Object.fromEntries(Object.keys(dados.candidatos).map((slug) => [slug, urlCandidaturaTse(slug, dados)]));
}
