/**
 * A rota `/resposta/<compartilhamento_id>` — a única peça dinâmica do site.
 *
 * O site é estático e o deploy é upload direto para o Cloudflare Pages: não há
 * build de servidor onde pendurar uma rota, e não dá para pré-gerar uma página
 * por resposta (elas nascem depois do build, a cada pergunta). Uma Pages
 * Function resolve exatamente isso, e só isso: recebe o identificador, busca o
 * documento no serviço que o guarda e devolve HTML pronto.
 *
 * Servido no servidor porque as três pontas que importam num link
 * compartilhado não executam o bundle da home: quem está sem JavaScript, o
 * robô que monta a prévia do WhatsApp, e quem abre o link no celular de outra
 * pessoa e precisa ver a resposta antes de qualquer rede.
 *
 * **Esta é a única superfície do sistema que faz uma requisição a partir de
 * algo que veio da URL de um desconhecido.** Daí as duas regras que organizam
 * o arquivo inteiro:
 *
 *   1. o identificador é validado ANTES de qualquer rede. Fora da gramática,
 *      não há requisição nenhuma — nem ao serviço, nem a lugar algum;
 *   2. o endereço consultado é MONTADO, nunca recebido: host de configuração,
 *      caminho fixo, identificador validado. Nada do visitante é encaminhado —
 *      nem cabeçalho, nem cookie, nem endereço de origem. O serviço não tem
 *      como saber quem pediu, e quem pede não tem como escolher o destino.
 *
 * O resto são decisões de exposição:
 *
 *   · **404 uniforme.** Identificador inválido, resposta inexistente e
 *     resposta revogada dão exatamente a mesma página. Distinguir os casos
 *     entregaria a quem varre endereços a confirmação de que um identificador
 *     existiu — informação sobre o acervo que esta rota não tem por que dar;
 *   · **502 mudo.** Falha do serviço não descreve o serviço. Status, host e
 *     mensagem de erro são topologia interna;
 *   · **cache de 60 segundos na borda.** A autoridade é o serviço: se uma
 *     resposta for revogada, o endereço tem de parar de abrir rápido. Erro não
 *     é cacheado nunca — um 502 de dez segundos não pode virar dez minutos de
 *     página quebrada;
 *   · **CSP por hash.** A página tem uma folha e um script embutidos, os dois
 *     escritos por nós. `unsafe-inline` liberaria também qualquer coisa que
 *     escapasse do escape; o hash libera exatamente estes dois blocos. Como o
 *     conteúdo é fixo, o hash é estável e sobrevive ao cache — o que um nonce
 *     por resposta não faria.
 *
 * Sem KV e sem D1 de propósito: a autoridade sobre o que existe, o que foi
 * revogado e o que mudou é o banco do serviço. Uma segunda cópia do estado na
 * borda seria uma segunda verdade, com revogação a resolver duas vezes.
 */
import { ESTILO, SCRIPT, paginaErro, paginaResposta } from '../../src/lib/pagina-resposta.mjs';
import {
  API_PADRAO, ehIdPublico, enderecoUpstream, origemDaRequisicao,
} from '../../src/lib/resposta-publica.mjs';

/** Teto do corpo lido do serviço. Uma resposta real fica ordens abaixo disso. */
export const LIMITE_PAYLOAD = 256 * 1024;

/** Tempo máximo esperando o serviço. Acima disso, 502 — não uma página pendurada. */
export const TEMPO_LIMITE_MS = 6000;

/** Teto do cache de borda. É o atraso máximo de uma revogação. */
export const CACHE_SEGUNDOS = 60;

const CABECALHOS_BASE = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // o soft launch vale para esta rota como vale para o site: a página traz
  // `noindex` na marcação, e o cabeçalho cobre quem lê só o cabeçalho
  'X-Robots-Tag': 'noindex, follow',
};

function base64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function sha256(texto) {
  const dado = new TextEncoder().encode(texto);
  return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', dado)));
}

let politicaMemo = null;

/**
 * A CSP da rota, com os hashes dos blocos embutidos.
 *
 * Calculada uma vez por isolate: o conteúdo é constante, então o hash também
 * é. `default-src 'none'` é o ponto de partida — a página não busca imagem, não
 * carrega fonte, não fala com API nenhuma e não pode ser emoldurada.
 */
async function politica() {
  if (politicaMemo) return politicaMemo;
  const [script, estilo] = await Promise.all([sha256(SCRIPT), sha256(ESTILO)]);
  politicaMemo = [
    "default-src 'none'",
    `script-src 'sha256-${script}'`,
    `style-src 'sha256-${estilo}'`,
    "img-src 'self' data:",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return politicaMemo;
}

async function pagina(html, { status = 200, cache }) {
  return new Response(html, {
    status,
    headers: {
      ...CABECALHOS_BASE,
      'Content-Security-Policy': await politica(),
      'Cache-Control': cache,
    },
  });
}

const naoEncontrada = () => pagina(paginaErro(404), { status: 404, cache: 'no-store' });
const indisponivel = () => pagina(paginaErro(502), { status: 502, cache: 'no-store' });

/**
 * Lê o corpo com teto de bytes, sem nunca bufferizar o que passa do teto.
 *
 * `await resposta.text()` leria um corpo de qualquer tamanho antes de qualquer
 * verificação — um serviço comprometido, ou só quebrado, derrubaria a função
 * por memória. Aqui o corte acontece durante a leitura.
 */
async function leCorpoLimitado(resposta, limite) {
  const corpo = resposta.body;
  if (!corpo || typeof corpo.getReader !== 'function') {
    const texto = await resposta.text();
    return texto.length > limite ? null : texto;
  }
  const leitor = corpo.getReader();
  const partes = [];
  let total = 0;
  while (true) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  const juntos = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    juntos.set(parte, posicao);
    posicao += parte.byteLength;
  }
  return new TextDecoder().decode(juntos);
}

/**
 * O documento canônico do serviço, ou `null` se não for um.
 *
 * A conferência do identificador não é zelo: um documento cujo
 * `compartilhamento_id` não seja o que foi pedido significa que a rota
 * devolveria, sob um endereço, o conteúdo de outro. Isso é serviço quebrado,
 * não resposta ausente.
 */
function documentoValido(bruto, id) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;
  if (bruto.schema_version !== 1) return null;
  if (bruto.compartilhamento_id !== id) return null;
  if (typeof bruto.pergunta !== 'string' || !bruto.pergunta.trim()) return null;
  if (typeof bruto.criado_em !== 'string' || !bruto.criado_em.trim()) return null;
  const { resposta } = bruto;
  if (!resposta || typeof resposta !== 'object' || Array.isArray(resposta)) return null;
  if (typeof resposta.texto !== 'string' || !resposta.texto.trim()) return null;
  const donos = new Map();
  const citacoes = Array.isArray(resposta.citacoes) ? resposta.citacoes : [];
  for (let i = 0; i < citacoes.length; i += 1) {
    const marcadores = Array.isArray(citacoes[i]?.marcadores) ? citacoes[i].marcadores : [];
    for (const brutoMarcador of marcadores) {
      const marcador = Number(brutoMarcador);
      if (!Number.isInteger(marcador) || marcador < 1 || marcador > 999) continue;
      if (donos.has(marcador) && donos.get(marcador) !== i) return null;
      donos.set(marcador, i);
    }
  }
  return bruto;
}

/**
 * O pedido inteiro, sem depender do runtime.
 *
 * `buscar` e `tempoLimite` são parâmetros para que o comportamento — inclusive
 * o do serviço lento e o do payload gigante — seja testável sem rede e sem
 * navegador.
 */
export async function trata({
  url, id, env = {}, buscar = globalThis.fetch,
  tempoLimite = TEMPO_LIMITE_MS, limitePayload = LIMITE_PAYLOAD,
} = {}) {
  // 1. gramática ANTES de qualquer rede
  if (!ehIdPublico(id)) return naoEncontrada();

  const endereco = enderecoUpstream(env.PESQUISA_API || API_PADRAO, id);
  if (!endereco) return indisponivel();

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoLimite);
  let cru;
  let resposta;
  try {
    resposta = await buscar(endereco, {
      method: 'GET',
      // nada do visitante viaja: sem cookie, sem autorização, sem user-agent
      // repassado, sem endereço de origem. Só o que a rota precisa pedir.
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      credentials: 'omit',
      signal: controle.signal,
    });
    if (resposta.status === 404) return naoEncontrada();
    if (!resposta.ok) return indisponivel();
    cru = await leCorpoLimitado(resposta, limitePayload);
  } catch {
    // rede caiu, tempo estourou, redirecionamento recusado: para quem lê, é
    // tudo a mesma indisponibilidade
    return indisponivel();
  } finally {
    clearTimeout(relogio);
  }

  if (cru === null) return indisponivel();

  let dados;
  try {
    dados = documentoValido(JSON.parse(cru), id);
  } catch {
    return indisponivel();
  }
  if (!dados) return indisponivel();

  const html = paginaResposta(dados, { origem: origemDaRequisicao(url), id });
  return pagina(html, { cache: `public, max-age=0, s-maxage=${CACHE_SEGUNDOS}` });
}

/**
 * A ponte com o runtime do Pages.
 *
 * A origem sai de `request.url` — a URL JÁ INTERPRETADA pelo runtime —, nunca
 * de `Host` ou `X-Forwarded-Host`, que quem faz a requisição escolhe. Um
 * canonical apontando para um host injetado seria o site assinando o endereço
 * de outra pessoa.
 *
 * `contexto.buscar` só existe nos testes; em produção o `fetch` é o do runtime.
 */
export async function onRequestGet(contexto) {
  return trata({
    url: contexto?.request?.url,
    id: contexto?.params?.id,
    env: contexto?.env ?? {},
    buscar: contexto?.buscar ?? globalThis.fetch,
  });
}
