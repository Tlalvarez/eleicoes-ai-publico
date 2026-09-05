/**
 * Os cargos da eleição de 2026 e as unidades da federação.
 *
 * O menu do site é POR CARGO: presidente, governador e deputado federal
 * (senador está suspenso, ver abaixo). Presidente é nacional e vive na home; os outros são por UF, e
 * a UF é escolhida numa página própria antes da conversa. Esta lista é a
 * autoridade do menu e das rotas — página nova de cargo entra aqui, não
 * escrita à mão em cada layout.
 */

export const CARGOS = Object.freeze([
  { slug: 'presidente', nome: 'Presidente', porUF: false, href: '/', preposicao: null },
  { slug: 'governador', nome: 'Governador', porUF: true, href: '/governador', preposicao: 'de' },
  // Senador: FORA DO AR desde 05/09/2026 por decisão do Thiago — a coleta
  // (sobretudo os sites das candidaturas) ainda está incompleta, e seção com
  // metade das fontes é promessa quebrada na cara do leitor. Volta quando a
  // coleta estiver resolvida: basta descomentar a linha (menu, rotas e gate
  // seguem esta lista). Enquanto isso /senador e /senador/<uf> dão 404.
  // { slug: 'senador', nome: 'Senador', porUF: true, href: '/senador', preposicao: 'por' },
  { slug: 'deputado-federal', nome: 'Deputado federal', porUF: true, href: '/deputado-federal', preposicao: 'por' },
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

/** `/governador/sp` — a página da conversa de um cargo numa UF. */
export function caminhoUf(cargo, uf) {
  return `${cargo.href}/${uf.sigla.toLowerCase()}`;
}

const CONTRACOES = {
  de: { '': 'de', o: 'do', a: 'da' },
  por: { '': 'por', o: 'pelo', a: 'pela' },
};

/**
 * O rótulo do escopo de uma conversa: "Governador de São Paulo",
 * "Senador pelo Rio de Janeiro", "Deputado federal pela Bahia".
 *
 * Ele vai na frente de cada pergunta enviada ao serviço de evidências, à
 * vista de quem pergunta — o serviço não tem filtro por cargo/UF, então o
 * escopo precisa estar no texto para ser considerado, e precisa estar visível
 * para não ser um acréscimo silencioso ao que a pessoa escreveu.
 */
export function rotuloEscopo(cargo, uf) {
  if (!cargo.porUF) return cargo.nome;
  const ligacao = CONTRACOES[cargo.preposicao][uf.artigo];
  return `${cargo.nome} ${ligacao} ${uf.nome}`;
}
