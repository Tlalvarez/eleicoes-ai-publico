/**
 * A identidade pública de uma resposta: `/resposta/<compartilhamento_id>`.
 *
 * O permalink `#r=` (src/lib/permalink.mjs) resolvia o problema de um site sem
 * servidor: o resultado inteiro viajava dentro do endereço. O preço está
 * documentado lá e é alto — o conteúdo NÃO é autenticado, a URL fica enorme, e
 * acima de um teto simplesmente não existe link.
 *
 * Agora o serviço guarda a resposta e devolve um identificador para ela. O
 * link volta a ser o que um link deve ser: curto, estável e resolvido por quem
 * produziu o conteúdo. Os fragmentos antigos continuam ABRINDO — link que já
 * circula não pode morrer —, mas não se emite nenhum novo.
 *
 * Este módulo é a gramática desse identificador e os endereços derivados dele.
 * Ele é pequeno de propósito: roda no navegador (a barra de compartilhamento
 * da home) e no runtime do Cloudflare Pages (a função que serve a rota), e não
 * pode depender de DOM, de `node:` nem de configuração.
 *
 * **O identificador é entrada hostil nas duas pontas.** Ele chega da URL de
 * quem visita e chega do JSON do serviço; nos dois casos termina dentro de um
 * caminho — de rota e de requisição. Gramática frouxa aqui é travessia de
 * caminho ali adiante. Por isso a validação é literal: exatamente 22
 * caracteres do alfabeto URL-safe, e nada mais. Nada de `decodeURIComponent`,
 * nada de normalizar, nada de aparar: o que não é exatamente isso é recusado.
 */

/** Comprimento do identificador público. Fixo — não é "até 22". */
export const TAMANHO_ID = 22;

/** Alfabeto URL-safe (base64url), sem `=`, sem `.` e sem `%`. */
export const RE_ID_PUBLICO = /^[A-Za-z0-9_-]{22}$/;

/** A rota pública. Uma só, e sem variação de barra final. */
export const PREFIXO_ROTA = '/resposta/';

/** O domínio canônico do site publicado. */
export const ORIGEM_CANONICA = 'https://eleicoes.ai';

/** Hosts que SÃO o site publicado — nestes, o canônico manda. */
const HOSTS_CANONICOS = new Set(['eleicoes.ai', 'www.eleicoes.ai']);

/** Endereço padrão do serviço de evidências. */
export const API_PADRAO = 'https://api.eleicoes.ai';

/** É um identificador público bem formado? */
export function ehIdPublico(valor) {
  return typeof valor === 'string' && RE_ID_PUBLICO.test(valor);
}

/** `/resposta/<id>`, ou `null` se o identificador não for válido. */
export function caminhoResposta(id) {
  return ehIdPublico(id) ? `${PREFIXO_ROTA}${id}` : null;
}

/** Só origens http(s) viram link. */
function origemLimpa(origem) {
  if (typeof origem !== 'string' || !origem.trim()) return null;
  let url;
  try {
    url = new URL(origem);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return `${url.protocol}//${url.host}`;
}

/** A URL pública absoluta da resposta, ou `null`. */
export function urlPublica(origem, id) {
  const base = origemLimpa(origem);
  const caminho = caminhoResposta(id);
  return base && caminho ? base + caminho : null;
}

/**
 * O endereço que o site oferece para compartilhar um resultado.
 *
 * Devolve `null` quando a resposta não tem identificador público — e isso é
 * uma resposta legítima, não uma falha. Inventar um endereço para conteúdo que
 * o serviço não guardou produziria um link que abre 404 na cara de quem o
 * recebeu; cair de volta no fragmento produziria um link não autenticado com
 * cara de link do site. A interface diz que não há link e segue oferecendo o
 * texto.
 */
export function urlDeCompartilhamento(origem, resultado) {
  return urlPublica(origem, resultado?.compartilhamento_id);
}

/**
 * A origem a usar em canonical, og:url e no link compartilhável.
 *
 * Vem da URL JÁ INTERPRETADA pelo runtime — nunca de `Host` ou
 * `X-Forwarded-Host`, que quem faz a requisição escolhe. No domínio canônico
 * (com ou sem `www`, http ou https) o resultado é `https://eleicoes.ai`; numa
 * preview do Pages ou em desenvolvimento, é a própria origem, senão os links
 * da página apontariam para produção a partir de uma preview.
 */
export function origemDaRequisicao(url) {
  const limpa = origemLimpa(url);
  if (!limpa) return ORIGEM_CANONICA;
  const { hostname } = new URL(limpa);
  return HOSTS_CANONICOS.has(hostname.toLowerCase()) ? ORIGEM_CANONICA : limpa;
}

/**
 * O endereço da consulta ao serviço: host de configuração + caminho fixo + id.
 *
 * MONTADO, nunca recebido. O único trecho variável é o identificador, que já
 * passou pela gramática — é o que garante que esta rota não possa ser usada
 * para alcançar um endereço escolhido por quem visita.
 */
export function enderecoUpstream(base, id) {
  const raiz = origemLimpa(base);
  const caminho = ehIdPublico(id) ? `/api/respostas/${id}` : null;
  if (!raiz || !caminho) return null;
  return raiz + caminho;
}
