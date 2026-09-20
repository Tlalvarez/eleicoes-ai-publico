/**
 * A home para quem não é navegador (PROTÓTIPO, 18/09/2026).
 *
 * Quando a pessoa digita "eleicoes.ai" no ChatGPT ou no Claude, o assistente abre a home —
 * 160 KB de matriz, feita para olhos — e demora para entender o que tem ali. Aqui ele recebe
 * o cartão de visita do site em ~3 KB de texto (o mesmo /llms.txt, que é público): o que é o
 * eleicoes.ai, que a pessoa pode perguntar o que quiser, e o endereço exato de cada arquivo.
 * A primeira resposta sai de UMA leitura curta.
 *
 * Não é conteúdo diferente para robô: é o mesmo acervo, no formato que cada leitor lê. O
 * cartão é um arquivo público (/llms.txt), está linkado na página /ia, e quem pede
 * `Accept: text/markdown` recebe o mesmo. Navegador nenhum passa por este ramo.
 *
 * Só a rota "/" invoca esta Function; o resto do site continua estático.
 */
// Dois robôs diferentes, e a diferença decidiu se o site existe para o assistente (19/09/2026).
//
// LEITOR AO VIVO: abre a página porque uma PESSOA pediu, agora, na conversa. Recebe o cartão.
// RASTREADOR DE BUSCA: monta o índice que o assistente consulta depois. Tem de receber a home de
// verdade, indexável, igual à de qualquer buscador.
//
// Até aqui os dois estavam na mesma lista e recebiam o cartão com `noindex`. O efeito, medido numa
// conversa real: o Claude abriu eleicoes.ai, leu o cartão, e quando a pessoa pediu o Rio de Janeiro
// respondeu que não conseguia abrir a página porque "o site não aparece nos buscadores (ele pede
// para não ser indexado)" — e pediu que ela colasse o endereço. Era verdade: o rastreador de busca
// dele recebia de nós uma página dizendo noindex, então o domínio nunca entrava no índice, e o
// leitor ao vivo (que só abre endereço vindo da pessoa ou da busca) recusava os links internos.
const LEITOR_AO_VIVO = /ChatGPT-User|Claude-User|Perplexity-User|DuckAssistBot|Gemini-User/i;
const RASTREADOR = /OAI-SearchBot|GPTBot|Claude-SearchBot|ClaudeBot|anthropic|PerplexityBot|Google-Extended|GoogleOther|meta-externalagent|MistralAI|cohere-ai|YouBot|Applebot-Extended|Amazonbot|bytespider/i;
const ASSISTENTES = LEITOR_AO_VIVO;

export function querTexto(request) {
  const ua = request.headers.get('User-Agent') ?? '';
  const accept = request.headers.get('Accept') ?? '';
  const pedeMarkdown = /text\/(markdown|plain)/i.test(accept) && !/text\/html/i.test(accept);
  if (RASTREADOR.test(ua) && !LEITOR_AO_VIVO.test(ua)) return false;   // índice de busca: a home de verdade
  return pedeMarkdown || ASSISTENTES.test(ua);
}

export async function onRequestGet(context) {
  const { request, env, next } = context;
  if (!querTexto(request)) return next();
  // HTML, não markdown: em 18/09 o leitor do ChatGPT recusou o cartão com
  // "Unsupported content-type: text/markdown". Só quem PEDE markdown recebe markdown.
  const accept = request.headers.get('Accept') ?? '';
  const querMarkdown = /text\/(markdown|plain)/i.test(accept) && !/text\/html/i.test(accept);
  const cartao = await env.ASSETS.fetch(new URL(querMarkdown ? '/llms.txt' : '/ia/cartao', request.url));
  if (!cartao.ok) return next();
  // o arquivo /ia/cartao é `noindex` (é representação alternativa, e não entra no sitemap). Servido AQUI,
  // porém, ele é a home — e uma home que diz noindex é lida pelo assistente como "não me procure". Tira-se
  // a meta e põe-se o canônico da home.
  const corpo = querMarkdown ? cartao.body
    : new HTMLRewriter().on('meta[name="robots"]', { element: (e) => e.remove() }).transform(cartao).body;
  return new Response(corpo, {
    status: 200,
    headers: {
      'Content-Type': querMarkdown ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      Vary: 'Accept, User-Agent',
      // sem `noindex`: o cartão é a mesma home em outro formato, e dizer noindex aqui foi lido pelo
      // assistente como "este site não quer ser encontrado". O canônico já aponta para a home.
      Link: '<https://eleicoes.ai/>; rel="canonical"',
    },
  });
}
