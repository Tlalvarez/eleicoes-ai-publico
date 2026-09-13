/**
 * Os cargos da eleição de 2026 e as unidades da federação.
 *
 * O menu do site é POR CARGO: presidente e governador — os cargos do Executivo,
 * os únicos com programa de governo registrado no TSE, que é o que o site
 * compara (v3, 13/09/2026). Presidente é nacional (/presidente); governador é
 * por UF, e a UF é escolhida numa página própria antes dos temas. Esta lista é
 * a autoridade do menu e das rotas — página nova de cargo entra aqui, não
 * escrita à mão em cada layout.
 */

export const CARGOS = Object.freeze([
  { slug: 'presidente', nome: 'Presidente', porUF: false, href: '/presidente', preposicao: null },
  { slug: 'governador', nome: 'Governador', porUF: true, href: '/governador', preposicao: 'de' },
  // Senador: FORA desde 13/09/2026, com o fim do chat. Candidatura ao Senado
  // não registra programa de governo no TSE, e o site passou a comparar só
  // programas. O endereço antigo redireciona (public/_redirects).
  // Deputado federal: FORA DO AR desde 06/09/2026, por decisão do Thiago. Não
  // é lacuna de coleta como foi no dia 5: são 7.772 candidaturas, das quais
  // 821 com material (11%), porque ~6.700 não declararam site ao TSE e a única
  // lane que alcança o cargo hoje é a de sites. Um cargo desse tamanho pede
  // outra forma de processar, não mais uma rodada da mesma. Volta descomentando
  // esta linha (menu, rotas e gate seguem a lista) e apagando a página
  // src/pages/deputado-federal.astro e a linha do public/_redirects.
]);

export const CARGOS_POR_UF = Object.freeze(CARGOS.filter((c) => c.porUF));

/**
 * As 27 unidades da federação. `artigo` é o que a língua pede antes do nome
 * ('' para "de São Paulo", 'o' para "do Pará", 'a' para "da Bahia"); ele existe
 * para o rótulo da conversa sair em português, não em sigla.
 */
export const UFS = Object.freeze([
  { sigla: 'AC', nome: 'Acre', artigo: 'o' },
  { sigla: 'AL', nome: 'Alagoas', artigo: '' },
  { sigla: 'AP', nome: 'Amapá', artigo: 'o' },
  { sigla: 'AM', nome: 'Amazonas', artigo: 'o' },
  { sigla: 'BA', nome: 'Bahia', artigo: 'a' },
  { sigla: 'CE', nome: 'Ceará', artigo: 'o' },
  { sigla: 'DF', nome: 'Distrito Federal', artigo: 'o' },
  { sigla: 'ES', nome: 'Espírito Santo', artigo: 'o' },
  { sigla: 'GO', nome: 'Goiás', artigo: '' },
  { sigla: 'MA', nome: 'Maranhão', artigo: 'o' },
  { sigla: 'MT', nome: 'Mato Grosso', artigo: '' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul', artigo: '' },
  { sigla: 'MG', nome: 'Minas Gerais', artigo: '' },
  { sigla: 'PA', nome: 'Pará', artigo: 'o' },
  { sigla: 'PB', nome: 'Paraíba', artigo: 'a' },
  { sigla: 'PR', nome: 'Paraná', artigo: 'o' },
  { sigla: 'PE', nome: 'Pernambuco', artigo: '' },
  { sigla: 'PI', nome: 'Piauí', artigo: 'o' },
  { sigla: 'RJ', nome: 'Rio de Janeiro', artigo: 'o' },
  { sigla: 'RN', nome: 'Rio Grande do Norte', artigo: 'o' },
  { sigla: 'RS', nome: 'Rio Grande do Sul', artigo: 'o' },
  { sigla: 'RO', nome: 'Rondônia', artigo: '' },
  { sigla: 'RR', nome: 'Roraima', artigo: '' },
  { sigla: 'SC', nome: 'Santa Catarina', artigo: '' },
  { sigla: 'SP', nome: 'São Paulo', artigo: '' },
  { sigla: 'SE', nome: 'Sergipe', artigo: '' },
  { sigla: 'TO', nome: 'Tocantins', artigo: 'o' },
]);

export function cargoPorSlug(slug) {
  return CARGOS.find((c) => c.slug === slug) ?? null;
}

export function ufPorSigla(sigla) {
  const alvo = String(sigla ?? '').toUpperCase();
  return UFS.find((u) => u.sigla === alvo) ?? null;
}

/** `/governador/sp` — a página de um cargo numa UF (os temas comparados). */
export function caminhoUf(cargo, uf) {
  return `${cargo.href}/${uf.sigla.toLowerCase()}`;
}

const CONTRACOES = {
  de: { '': 'de', o: 'do', a: 'da' },
  por: { '': 'por', o: 'pelo', a: 'pela' },
};

/**
 * O rótulo do escopo: "Governador de São Paulo", "Governador do Pará",
 * "Governador da Bahia". É o título da página da UF e o que vai na trilha
 * das páginas de tema.
 */
export function rotuloEscopo(cargo, uf) {
  if (!cargo.porUF) return cargo.nome;
  const ligacao = CONTRACOES[cargo.preposicao][uf.artigo];
  return `${cargo.nome} ${ligacao} ${uf.nome}`;
}
