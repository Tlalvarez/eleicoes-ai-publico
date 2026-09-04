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
  // o formato é o que a própria interface do TSE (v2.8.22) gera ao abrir um
  // candidato: região / UF / eleição / candidatura / ano / UF. Para presidente,
  // região e UF são "BR". O formato antigo (ano/eleição/UF/candidatura) abre a
  // tela "Erro ao carregar a página".
  const { ano, id_eleicao, abrangencia } = dados.eleicao;
  return `${BASE_DIVULGA}/${abrangencia}/${abrangencia}/${id_eleicao}/${c.id_candidatura}/${ano}/${abrangencia}`;
}

/** {slug: url} de todas as candidaturas declaradas. */
export function urlsPorSlug(dados = candidaturas) {
  return Object.fromEntries(Object.keys(dados.candidatos).map((slug) => [slug, urlCandidaturaTse(slug, dados)]));
}

/** A foto oficial do registro da candidatura, servida pelo TSE (161×225) —
 * a mesma origem das fotos das páginas por cargo/UF. */
export function urlFotoCandidaturaTse(slug, dados = candidaturas) {
  const c = dados.candidatos[slug];
  if (!c || !/^\d+$/.test(String(c.id_candidatura))) {
    throw new Error(`Candidatura sem identificador no TSE: ${slug} (src/data/candidaturas-tse.json)`);
  }
  const { id_eleicao, abrangencia } = dados.eleicao;
  return `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${id_eleicao}/${c.id_candidatura}/${abrangencia}`;
}
