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
const ASSISTENTES = /ChatGPT|OAI-SearchBot|GPTBot|Claude-User|Claude-SearchBot|ClaudeBot|anthropic|Perplexity|Gemini|Google-Extended|GoogleOther|meta-externalagent|MistralAI|DuckAssistBot|cohere-ai|YouBot|Applebot-Extended|Amazonbot|bytespider/i;

export function querTexto(request) {
  const ua = request.headers.get('User-Agent') ?? '';
  const accept = request.headers.get('Accept') ?? '';
  const pedeMarkdown = /text\/(markdown|plain)/i.test(accept) && !/text\/html/i.test(accept);
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
  return new Response(cartao.body, {
    status: 200,
    headers: {
      'Content-Type': querMarkdown ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      Vary: 'Accept, User-Agent',
      'X-Robots-Tag': 'noindex',
    },
  });
}
