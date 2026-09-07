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
import { injetaPrevia, tituloDaResposta } from '../../src/lib/previa-resposta.mjs';
import { cargoPorSlug, ufPorSigla, caminhoUf } from '../../src/lib/cargos.mjs';

// Onde a resposta guardada mora. O app usa o mesmo endereço (PUBLIC_PESQUISA_API
// no build); a Function lê a variável do ambiente da Pages se existir.
const API_PADRAO = 'https://api.eleicoes.ai';
const ESPERA_API_MS = 1500;

/**
 * A resposta guardada, para a prévia: `{ ok: true, resposta }`, `{ ok: false,
 * status: 404 }` quando o serviço diz que não existe (inexistente, revogado),
 * ou `null` quando o serviço não respondeu a tempo — aí a página sai sem
 * prévia, nunca sem página.
 */
async function respostaGuardada({ buscar, api, id }) {
  if (typeof buscar !== 'function') return null;
  try {
    const r = await buscar(`${api}/api/respostas/${id}`, {
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(ESPERA_API_MS) : undefined,
      headers: { Accept: 'application/json' },
    });
    if (r.status === 404) return { ok: false, status: 404 };
    if (!r.ok) return null;
    const corpo = await r.json();
    return corpo?.resposta ? { ok: true, resposta: corpo.resposta } : null;
  } catch {
    return null;
  }
}

const CABECALHOS_ERRO = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Robots-Tag': 'noindex, follow',
  'Cache-Control': 'no-store',
};

/**
 * A rota da conversa a que esta resposta pertence — `/` quando não dá para
 * saber.
 *
 * A autoridade é `src/lib/cargos.mjs`, a mesma do menu e das rotas do site:
 * cargo fora do ar (deputado federal, hoje) não tem página construída, então
 * `cargoPorSlug` devolve `null` e a home é servida — nunca um endereço que o
 * `dist` não tem.
 */
function paginaDoEscopo(guardada) {
  const escopo = guardada?.ok ? guardada.resposta?.escopo : null;
  const cargo = cargoPorSlug(escopo?.cargo ?? '');
  if (!cargo) return '/';
  if (!cargo.porUF) return cargo.href;
  const uf = ufPorSigla(escopo?.uf ?? '');
  return uf ? caminhoUf(cargo, uf) : '/';
}

const naoEncontrada = () => new Response(paginaErro(404), { status: 404, headers: CABECALHOS_ERRO });
const indisponivel = () => new Response(paginaErro(502), { status: 502, headers: CABECALHOS_ERRO });

/** O pedido inteiro, sem depender do runtime — testável com um ASSETS falso. */
export async function trata({ url, id, assets, buscar = globalThis.fetch, api = API_PADRAO } = {}) {
  if (!ehIdPublico(id)) return naoEncontrada();
  if (!assets || typeof assets.fetch !== 'function') return indisponivel();

  // a resposta guardada serve à prévia (título e metas para o WhatsApp), diz
  // 404 quando o serviço diz — um link revogado não deve sair como 200 para um
  // robô — e diz DE QUE CONVERSA a resposta é, que é o que escolhe a página
  const g = await respostaGuardada({ buscar, api, id });
  if (g && g.ok === false && g.status === 404) return naoEncontrada();

  let resposta;
  try {
    // A página servida é a DO ESCOPO da resposta: `/governador/sp` para uma
    // conversa sobre governador de São Paulo, a home para presidente.
    //
    // Até 06/09/2026 era sempre a home, e isso vazava para o leitor: o link
    // de uma resposta sobre São Paulo abria sob o título "Pergunte à IA sobre
    // os candidatos a presidente", com a grade dos 13 presidenciáveis embaixo,
    // e a pergunta seguinte era buscada entre eles. A página do escopo já traz
    // o rótulo certo, os cards certos e o mapa de causas daquele cargo/UF.
    //
    // Serviço fora do ar ou escopo que o site não conhece caem na home, que é
    // o comportamento de antes: sem página é pior que página genérica.
    // A URL é montada aqui (raiz do próprio deployment), nunca recebida de fora.
    resposta = await assets.fetch(new URL(paginaDoEscopo(g), url));
  } catch {
    return indisponivel();
  }
  if (!resposta || !resposta.ok) return indisponivel();

  let corpo = resposta.body;
  if (g && g.ok) {
    corpo = injetaPrevia(await resposta.text(), {
      titulo: tituloDaResposta(g.resposta),
      url: new URL(`/resposta/${id}`, url).toString(),
    });
  }

  const cabecalhos = new Headers(resposta.headers);
  cabecalhos.set('X-Robots-Tag', 'noindex, follow');
  cabecalhos.set('X-Content-Type-Options', 'nosniff');
  // a resposta guardada é imutável, mas o APP muda a cada deploy — sem cache
  // longo, um link antigo sempre abre o app corrente
  cabecalhos.set('Cache-Control', 'public, max-age=0, s-maxage=60');
  return new Response(corpo, { status: 200, headers: cabecalhos });
}

export async function onRequestGet(contexto) {
  return trata({
    url: contexto?.request?.url,
    id: contexto?.params?.id,
    assets: contexto?.assets ?? contexto?.env?.ASSETS,
    buscar: contexto?.buscar ?? globalThis.fetch,
    api: contexto?.env?.PUBLIC_PESQUISA_API || API_PADRAO,
  });
}
