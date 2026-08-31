/**
 * `/resposta/<id>` — a página da conversa.
 *
 * A rota serve o APP do chat (o `index.html` publicado): o script da home lê o
 * id do caminho, carrega a resposta guardada em `GET /api/respostas/<id>` e a
 * conversa continua ali. A função não fala com o serviço de evidências — quem
 * busca a resposta é o navegador, com o mesmo contrato da home.
 *
 * O identificador continua sendo entrada hostil: é validado ANTES de qualquer
 * coisa, e um id fora da gramática recebe o 404 uniforme (mesma página para
 * inválido, inexistente e revogado — a distinção é informação sobre o acervo
 * que a rota não tem por que entregar). A página SSR anterior desta rota vive
 * em `src/lib/pagina-resposta.mjs` e segue usada para as páginas de erro.
 */
import { paginaErro } from '../../src/lib/pagina-resposta.mjs';
import { ehIdPublico } from '../../src/lib/resposta-publica.mjs';

const CABECALHOS_ERRO = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Robots-Tag': 'noindex, follow',
  'Cache-Control': 'no-store',
};

const naoEncontrada = () => new Response(paginaErro(404), { status: 404, headers: CABECALHOS_ERRO });
const indisponivel = () => new Response(paginaErro(502), { status: 502, headers: CABECALHOS_ERRO });

/** O pedido inteiro, sem depender do runtime — testável com um ASSETS falso. */
export async function trata({ url, id, assets } = {}) {
  if (!ehIdPublico(id)) return naoEncontrada();
  if (!assets || typeof assets.fetch !== 'function') return indisponivel();

  let resposta;
  try {
    // o app é o MESMO artefato da home; a URL pedida ao armazém de estáticos é
    // montada aqui (raiz do próprio deployment), nunca recebida de fora
    resposta = await assets.fetch(new URL('/', url));
  } catch {
    return indisponivel();
  }
  if (!resposta || !resposta.ok) return indisponivel();

  const cabecalhos = new Headers(resposta.headers);
  cabecalhos.set('X-Robots-Tag', 'noindex, follow');
  cabecalhos.set('X-Content-Type-Options', 'nosniff');
  // a resposta guardada é imutável, mas o APP muda a cada deploy — sem cache
  // longo, um link antigo sempre abre o app corrente
  cabecalhos.set('Cache-Control', 'public, max-age=0, s-maxage=60');
  return new Response(resposta.body, { status: 200, headers: cabecalhos });
}

export async function onRequestGet(contexto) {
  return trata({
    url: contexto?.request?.url,
    id: contexto?.params?.id,
    assets: contexto?.assets ?? contexto?.env?.ASSETS,
  });
}
