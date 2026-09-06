/**
 * A prévia de uma resposta compartilhada: o <title> e as metas Open Graph que
 * o WhatsApp, o X e o Slack leem quando alguém cola /resposta/<id>.
 *
 * O título NÃO é a pergunta de quem perguntou (texto de terceiro viraria
 * manchete) nem texto do modelo (seria um segundo canal para o que o portão
 * de saída da resposta evita). É o mais neutro que ainda diz alguma coisa:
 * sobre QUEM é a resposta, tirado dos nomes das fontes citadas — que são os
 * nomes de registro dos candidatos, não texto livre.
 */

const SUFIXO = ' · eleicoes.ai';
export const DESCRICAO_PREVIA = 'Gerada por inteligência artificial a partir do que os candidatos '
  + 'registraram e publicaram, com o link de cada fonte. Sem revisão humana. '
  + 'O eleicoes.ai não recomenda voto.';

function escapa(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Os nomes citados, sem repetição, na ordem em que aparecem. */
export function nomesCitados(resposta) {
  const vistos = new Set();
  for (const c of resposta?.citacoes ?? []) {
    const nome = String(c?.nome ?? '').replace(/\s+/g, ' ').trim();
    if (nome && nome.length <= 80) vistos.add(nome);
  }
  return [...vistos];
}

/** "Resposta sobre X", "… X e Y", "… X, Y e Z", "… 5 candidatos", ou o genérico. */
export function tituloDaResposta(resposta) {
  const nomes = nomesCitados(resposta);
  if (nomes.length === 0) return 'Uma resposta do eleicoes.ai';
  if (nomes.length > 3) return `Resposta sobre ${nomes.length} candidatos`;
  const lista = nomes.length === 1 ? nomes[0]
    : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
  return `Resposta sobre ${lista}`;
}

/**
 * Troca o <title> do app e injeta as metas da prévia antes de </head>.
 * O HTML é o nosso próprio build (confiável); os valores entram escapados.
 * Sem </head> ou sem <title>, devolve o HTML como veio — prévia é bônus,
 * nunca condição para servir a página.
 */
export function injetaPrevia(html, { titulo, descricao = DESCRICAO_PREVIA, url } = {}) {
  const texto = String(html ?? '');
  if (!titulo || !/<title>[^<]*<\/title>/i.test(texto) || !/<\/head>/i.test(texto)) return texto;
  const t = escapa(titulo);
  const metas = [
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${escapa(descricao)}">`,
    url ? `<meta property="og:url" content="${escapa(url)}">` : '',
    '<meta property="og:type" content="article">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="description" content="${escapa(descricao)}">`,
  ].filter(Boolean).join('');
  // as metas equivalentes do layout saem antes (title, description, og:url,
  // og:type, twitter:card): duas og:title numa página = prévia imprevisível.
  // og:image, og:site_name e og:locale do layout FICAM — a resposta herda a
  // imagem da marca.
  const remove = /<meta (?:property="og:(?:title|description|url|type)"|name="(?:description|twitter:card)")[^>]*>\s*/gi;
  // Substituições por FUNÇÃO, não por string: com string, `$&`, `$'` e afins
  // dentro do valor são padrões de substituição — um nome com `$'` (escapado
  // vira `$&#39;`, que contém `$&`) inseria o próprio <title> antigo dentro do
  // novo e o </head> dentro do og:title. Não executa nada, mas quebra a página.
  return texto
    .replace(/<title>[^<]*<\/title>/i, () => `<title>${t}${escapa(SUFIXO)}</title>`)
    .replace(remove, '')
    .replace(/<\/head>/i, () => `${metas}</head>`);
}
