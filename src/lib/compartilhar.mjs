/**
 * O que sai do site quando alguém compartilha um resultado.
 *
 * Texto compartilhado circula SEM a página em volta: sem o aviso de rotulagem
 * de IA, sem o estado de publicação dos dados, sem a nota de neutralidade. Um
 * botão "copiar" que copiasse apenas a resposta transformaria o site num
 * gerador de vereditos anônimos para grupo de WhatsApp — exatamente o que ele
 * existe para não ser.
 *
 * Então toda saída carrega, sempre: a pergunta que gerou aquele texto, o
 * estado de release dos dados, a marca de resposta gerada por IA e o link,
 * quando ele existe. É verboso de propósito: o custo de repetir o contexto é
 * menor que o de um print sem procedência circulando em ano eleitoral.
 *
 * São quatro saídas para quatro usos: resumo curto (WhatsApp e Web Share),
 * texto sem marcação, Markdown com as fontes, e o endereço wa.me pronto.
 *
 * Puro e sem DOM.
 */
import { analisaMarkdown, paraTextoSimples } from './markdown.mjs';

/** Tamanho da CONCLUSÃO no resumo curto — o resto do resumo é contexto fixo. */
export const LIMITE_RESUMO = 550;

const ASSINATURA =
  'eleicoes.ai — resposta de IA com fontes citadas; não indica em quem votar.';

const texto = (v) => (typeof v === 'string' ? v : '');
const linhas = (...partes) => partes.filter((p) => texto(p).trim() !== '').join('\n');
const blocos = (...partes) => partes.filter((p) => texto(p).trim() !== '').join('\n\n');

/** '2026-08-13' → '13/08/2026'. Data ausente é dita, não escondida. */
export function dataBr(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return 'sem data';
  return iso.slice(0, 10).split('-').reverse().join('/');
}

/** Corta em fronteira de palavra e marca o corte. */
export function apara(t, limite) {
  const s = texto(t).trim();
  if (s.length <= limite) return s;
  const cortado = s.slice(0, limite);
  const espaco = cortado.lastIndexOf(' ');
  return `${(espaco > limite * 0.5 ? cortado.slice(0, espaco) : cortado).trimEnd()}…`;
}

/**
 * A conclusão: o primeiro parágrafo da resposta.
 *
 * O formato "Candidatos" põe a conclusão antes de tudo, então o primeiro
 * parágrafo é o que resume. Título não conta — "## Conclusão" é rótulo, não
 * conteúdo.
 */
export function conclusao(md) {
  const nos = analisaMarkdown(md);
  const primeiro = nos.find((n) => n.t === 'p');
  return paraTextoSimples(primeiro ? [primeiro] : nos);
}

/** A ressalva que vai no texto compartilhado: a frase de leitor quando o
 *  serviço a manda; a etiqueta interna só na falta dela. */
function ressalvaDaFonte(c) {
  return c?.ressalva || c?.estatuto_rotulo || '';
}

/** Uma linha por fonte, em texto simples. */
function fontesSimples(citacoes) {
  return (citacoes ?? []).map((c) => {
    const marcas = (c?.marcadores ?? []).map((n) => `[S${n}]`).join('') || '[S?]';
    const cabeca = [c?.nome, c?.rotulo, dataBr(c?.data)].filter(Boolean).join(' — ');
    return linhas(
      `${marcas} ${cabeca}${c?.ts ? `, ${c.ts}` : ''}`
        + (ressalvaDaFonte(c) ? ` · ${ressalvaDaFonte(c)}` : ''),
      c?.url ? `    ${c.url}` : '');
  }).join('\n');
}

/** Uma linha por fonte, em Markdown, com o endereço como link. */
function fontesMarkdown(citacoes) {
  return (citacoes ?? []).map((c) => {
    const marcas = (c?.marcadores ?? []).map((n) => `[S${n}]`).join('') || '[S?]';
    const cabeca = [c?.nome, c?.rotulo, dataBr(c?.data)].filter(Boolean).join(' — ');
    const link = c?.url ? ` — [abrir a fonte](${c.url})` : ' — sem endereço registrado';
    return `- ${marcas} ${cabeca}${c?.ts ? `, ${c.ts}` : ''}`
      + (ressalvaDaFonte(c) ? ` · ${ressalvaDaFonte(c)}` : '') + link;
  }).join('\n');
}

/**
 * Resumo curto: pergunta, conclusão, contexto e link.
 *
 * É o que vai para o WhatsApp e para o Web Share do celular, onde uma parede
 * de texto simplesmente não é lida.
 */
export function resumoLegivel({ pergunta, texto: corpo, url, estado } = {}) {
  return blocos(
    texto(pergunta),
    apara(conclusao(corpo), LIMITE_RESUMO),
    linhas(ASSINATURA, texto(estado), texto(url)),
  ).trimEnd();
}

/**
 * O payload do `navigator.share`.
 *
 * A URL vai no campo próprio e NÃO se repete no texto: os aplicativos montam
 * a pré-visualização a partir do campo `url`, e um endereço duplicado no
 * corpo vira um segundo link torto na mensagem.
 */
export function payloadWebShare({ pergunta, texto: corpo, url, estado } = {}) {
  const payload = {
    title: texto(pergunta) || 'Resultado no eleicoes.ai',
    text: resumoLegivel({ pergunta, texto: corpo, estado }),
  };
  if (texto(url)) payload.url = url;
  return payload;
}

/** Resposta inteira, sem marcação, com as fontes e o contexto. */
export function textoCompleto({ pergunta, texto: corpo, citacoes, rodape, url, estado } = {}) {
  const fontes = fontesSimples(citacoes);
  return blocos(
    texto(pergunta),
    paraTextoSimples(analisaMarkdown(corpo)),
    fontes && `Fontes\n${fontes}`,
    linhas(texto(rodape), texto(estado), ASSINATURA, texto(url)),
  ).trimEnd();
}

/**
 * Resposta como Markdown, para colar em documento ou publicação.
 *
 * O corpo é preservado LITERALMENTE — reescrever a resposta ao exportar
 * criaria uma segunda versão do mesmo resultado, e o permalink deixaria de
 * corresponder ao que a pessoa colou.
 */
export function markdownCompleto({ pergunta, texto: corpo, citacoes, rodape, url, estado } = {}) {
  const fontes = fontesMarkdown(citacoes);
  return blocos(
    texto(pergunta) && `# ${texto(pergunta)}`,
    texto(corpo),
    fontes && `## Fontes\n\n${fontes}`,
    '---',
    linhas(
      texto(rodape) && `_${texto(rodape)}_`,
      texto(estado) && `**${texto(estado)}**`,
      `_${ASSINATURA}_`,
      texto(url) && `[Este resultado no eleicoes.ai](${url})`),
  ).trimEnd();
}

/** O endereço wa.me com a mensagem embutida, ou `null` se não há mensagem. */
export function linkWhatsApp(mensagem) {
  const m = texto(mensagem).trim();
  return m ? `https://wa.me/?text=${encodeURIComponent(m)}` : null;
}
