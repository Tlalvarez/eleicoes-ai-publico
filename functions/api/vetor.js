/**
 * `POST /api/vetor` — o vetor da consulta da busca.
 *
 * O site é estático; a única coisa que a busca não consegue fazer no
 * navegador é transformar o texto da consulta num vetor do MESMO modelo dos
 * documentos (jina-embeddings-v3, 256 dims, exportados por
 * v3/enriquece_busca.py). Esta Function faz só isso: recebe `{ q }`, chama a
 * Jina pelo NativePort com a chave guardada como segredo do projeto Pages
 * (`NATIVEPORT_API_KEY`) e devolve `{ vetor, dims, modelo }`.
 *
 * O que ela NÃO faz: não guarda a consulta (nenhum log, nenhum console.log
 * com o texto), não identifica quem pergunta, não devolve nada além do
 * vetor. Mesma origem do site — sem CORS e sem origem nova na CSP.
 *
 * Limites: consulta de até 300 caracteres; 30 pedidos por minuto por IP
 * (contagem em memória do isolate: barata e suficiente contra laço acidental;
 * o limite de borda da Cloudflare cobre abuso de verdade). Se a Jina falhar,
 * responde 502 e o navegador segue só com a busca lexical.
 */
export const MODELO = 'jina-embeddings-v3';
export const DIMENSOES = 256;
export const TASK = 'retrieval.query';
export const MAX_CHARS = 300;
export const LIMITE_POR_MINUTO = 30;
const URL_JINA = 'https://api.nativeport.ai/jina/embeddings';

const CABECALHOS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const janelas = new Map();   // ip -> [timestamps] do último minuto

/** Verdadeiro se este IP ainda cabe na janela; registra o pedido. */
export function dentroDoLimite(ip, agora = Date.now(), mapa = janelas) {
  const inicio = agora - 60_000;
  const lista = (mapa.get(ip) ?? []).filter((t) => t > inicio);
  if (lista.length >= LIMITE_POR_MINUTO) { mapa.set(ip, lista); return false; }
  lista.push(agora);
  mapa.set(ip, lista);
  if (mapa.size > 5000) mapa.clear();   // memória do isolate não é banco
  return true;
}

const resposta = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: CABECALHOS });

/** A consulta limpa, ou null se não serve. */
export function consultaValida(q) {
  if (typeof q !== 'string') return null;
  const limpa = q.replace(/\s+/g, ' ').trim();
  if (!limpa || limpa.length > MAX_CHARS) return null;
  return limpa;
}

export async function onRequestPost({ request, env }) {
  if (!env?.NATIVEPORT_API_KEY) return resposta(503, { erro: 'busca vetorial indisponível' });
  const ip = request.headers.get('CF-Connecting-IP') ?? 'desconhecido';
  if (!dentroDoLimite(ip)) return resposta(429, { erro: 'muitas consultas; tente em um minuto' });
  let corpo;
  try { corpo = await request.json(); } catch { return resposta(400, { erro: 'corpo inválido' }); }
  const q = consultaValida(corpo?.q);
  if (!q) return resposta(400, { erro: `consulta vazia ou acima de ${MAX_CHARS} caracteres` });
  let r;
  try {
    r = await fetch(URL_JINA, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.NATIVEPORT_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'eleicoes-ai-site/1 (+https://eleicoes.ai)' },
      body: JSON.stringify({ model: MODELO, task: TASK, dimensions: DIMENSOES, input: [q] }),
    });
  } catch {
    return resposta(502, { erro: 'o serviço de vetores não respondeu' });
  }
  if (!r.ok) return resposta(502, { erro: `o serviço de vetores respondeu ${r.status}` });
  const d = await r.json();
  const vetor = d?.data?.[0]?.embedding;
  if (!Array.isArray(vetor) || vetor.length !== DIMENSOES) return resposta(502, { erro: 'vetor inválido' });
  return resposta(200, { vetor, dims: DIMENSOES, modelo: MODELO });
}

export async function onRequest({ request }) {
  if (request.method === 'POST') return undefined;   // cai em onRequestPost
  return resposta(405, { erro: 'use POST com { "q": "..." }' });
}
