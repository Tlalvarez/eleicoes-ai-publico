/**
 * O contrato do chat com o serviço de evidências.
 *
 * Contrato:
 *   POST {base}/api/conversa
 *     {mensagens: [{papel: 'user'|'assistant', texto}], resposta_id?}
 *   → {id, texto (Markdown), citacoes: [{marcadores, candidato, nome, rotulo,
 *      tipo, data, url, ts, estatuto, estatuto_rotulo}], rodape, release_id,
 *      release_status}
 *
 * Duas decisões que valem explicação:
 *
 * **Fallback.** `/api/conversa` pode ainda não existir no serviço ou estar
 * fechada por falta de release. Quando a rota responde 404/405/501, ou 503 com
 * o código explícito `sem_release`, e é o PRIMEIRO turno, a pergunta vai para
 * `/api/pesquisa`, que responde uma consulta avulsa — mesmo formato de saída,
 * sem memória. Num turno seguinte isso NÃO acontece: mandar "e sobre saúde?"
 * como pergunta isolada devolveria uma resposta sobre nada, com aparência de
 * continuidade. Aí a resposta é uma indisponibilidade explícita, dita ao
 * usuário. Degradação silenciosa num produto de evidência é pior que erro.
 *
 * **Normalização num lugar só.** A resposta alimenta um renderizador, um
 * permalink e quatro formatos de compartilhamento. Se cada um tratar campo
 * faltando por conta própria, `undefined` aparece na tela em algum deles.
 * Aqui a forma é fixada uma vez: texto é string, citações são lista, marcador
 * é número, endereço perigoso é descartado.
 *
 * Puro e sem DOM: `buscar` é injetado, então os testes rodam sem rede.
 */
import { hrefSeguro } from './markdown.mjs';
import { ehIdPublico } from './resposta-publica.mjs';

export const CAMINHO_CONVERSA = '/api/conversa';
export const CAMINHO_PESQUISA = '/api/pesquisa';

export const MSG_SEM_FOLLOWUP =
  'Este serviço ainda não mantém conversa com histórico: dá para fazer uma '
  + 'nova pergunta completa, mas não continuar esta. Reescreva sua dúvida '
  + 'incluindo o assunto e envie como nova pergunta.';

/** Erro do chat, com código legível pela interface. */
export class ErroConversa extends Error {
  constructor(codigo, mensagem, causa) {
    super(mensagem);
    this.name = 'ErroConversa';
    this.codigo = codigo;
    if (causa) this.cause = causa;
  }
}

const PAPEIS = new Set(['user', 'assistant']);
const str = (v) => (typeof v === 'string' ? v : '');

/** Corpo de `/api/conversa`: o histórico inteiro, só com papéis do contrato. */
export function corpoConversa(mensagens, respostaId) {
  const corpo = {
    mensagens: (mensagens ?? [])
      .filter((m) => PAPEIS.has(m?.papel) && str(m?.texto).trim())
      .map((m) => ({ papel: m.papel, texto: m.texto })),
  };
  if (str(respostaId).trim()) corpo.resposta_id = respostaId;
  return corpo;
}

/** Corpo do fallback `/api/pesquisa`: só a última pergunta. */
export function corpoPesquisa(mensagens) {
  const ultima = [...(mensagens ?? [])].reverse().find((m) => m?.papel === 'user');
  return { pergunta: str(ultima?.texto) };
}

/** É o primeiro turno? (nenhuma resposta anterior no histórico) */
export function ehPrimeiroTurno(mensagens) {
  return !(mensagens ?? []).some((m) => m?.papel === 'assistant');
}

/**
 * Este status significa "a rota não existe"?
 *
 * 500 e 502 NÃO entram: um serviço com defeito não é um serviço sem a rota, e
 * cair no fallback aí esconderia a falha real atrás de uma resposta pior.
 */
export function precisaFallback(status) {
  return status === 404 || status === 405 || status === 501;
}

async function respostaPermiteFallback(resposta) {
  if (precisaFallback(resposta.status)) return true;
  if (resposta.status !== 503) return false;
  try {
    return (await resposta.json())?.codigo === 'sem_release';
  } catch {
    return false;
  }
}

/** Fixa a forma da resposta. Campo estranho não chega à interface. */
export function normalizaResposta(bruto) {
  const r = bruto && typeof bruto === 'object' ? bruto : {};
  const citacoes = (Array.isArray(r.citacoes) ? r.citacoes : [])
    .map((c) => {
      const fonte = c && typeof c === 'object' ? c : {};
      const marcadores = [...new Set((Array.isArray(fonte.marcadores) ? fonte.marcadores : [])
        .map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
      return {
        marcadores,
        candidato: str(fonte.candidato) || null,
        nome: str(fonte.nome) || null,
        rotulo: str(fonte.rotulo) || null,
        tipo: str(fonte.tipo) || null,
        data: str(fonte.data) || null,
        // endereço é o campo mais exposto da citação: ele vira href
        url: hrefSeguro(fonte.url),
        ts: str(fonte.ts) || null,
        estatuto: Number.isInteger(fonte.estatuto) ? fonte.estatuto : null,
        estatuto_rotulo: str(fonte.estatuto_rotulo) || null,
      };
    })
    // sem marcador a citação não tem como ser referida pelo texto: ela viraria
    // uma entrada órfã na lista de fontes
    .filter((c) => c.marcadores.length > 0);

  return {
    id: str(r.id) || null,
    // o identificador PÚBLICO da resposta guardada, que vira `/resposta/<id>`.
    // Ele acaba dentro de um caminho, então a gramática é conferida aqui, na
    // fronteira: um id fora do formato não vira link torto adiante, vira `null`
    // e a interface diz que não há link.
    compartilhamento_id: ehIdPublico(r.compartilhamento_id) ? r.compartilhamento_id : null,
    // a pergunta não volta de /api/conversa, mas volta de /api/respostas/<id>,
    // e todo formato de compartilhamento abre por ela. Fixar a forma aqui evita
    // que cada consumidor invente o seu jeito de não ter o campo.
    pergunta: str(r.pergunta),
    texto: str(r.texto),
    citacoes,
    rodape: str(r.rodape),
    release_id: str(r.release_id) || null,
    release_status: str(r.release_status) || null,
  };
}

async function postaJson(buscar, url, corpo) {
  let resposta;
  try {
    resposta = await buscar(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  } catch (e) {
    throw new ErroConversa('rede',
      'Não consegui falar com o serviço de evidências. Verifique sua conexão '
      + 'e tente de novo.', e);
  }
  return resposta;
}

async function leJson(resposta) {
  try {
    return await resposta.json();
  } catch (e) {
    throw new ErroConversa('resposta-invalida',
      'O serviço respondeu num formato que não consegui ler.', e);
  }
}

/**
 * Faz a pergunta e devolve a resposta normalizada.
 *
 * `viaFallback` diz à interface que aquela resposta veio da rota sem
 * histórico — é o que permite avisar, ali mesmo, que o próximo turno não
 * continua a conversa.
 */
export async function pergunta(mensagens, { apiBase, buscar = globalThis.fetch, respostaId } = {}) {
  const base = String(apiBase ?? '').replace(/\/+$/, '');

  const conversa = await postaJson(buscar, base + CAMINHO_CONVERSA,
    corpoConversa(mensagens, respostaId));

  if (conversa.ok) {
    return { ...exigeTexto(normalizaResposta(await leJson(conversa))), viaFallback: false };
  }

  if (!(await respostaPermiteFallback(conversa))) {
    throw new ErroConversa('servidor',
      `O serviço de evidências respondeu com erro (${conversa.status}). `
      + 'Tente de novo em alguns instantes.');
  }

  if (!ehPrimeiroTurno(mensagens)) {
    throw new ErroConversa('sem-followup', MSG_SEM_FOLLOWUP);
  }

  const pesquisa = await postaJson(buscar, base + CAMINHO_PESQUISA, corpoPesquisa(mensagens));
  if (!pesquisa.ok) {
    throw new ErroConversa(precisaFallback(pesquisa.status) ? 'sem-servico' : 'servidor',
      precisaFallback(pesquisa.status)
        ? 'O serviço de evidências não está publicado neste ambiente.'
        : `O serviço de evidências respondeu com erro (${pesquisa.status}).`);
  }
  return { ...exigeTexto(normalizaResposta(await leJson(pesquisa))), viaFallback: true };
}

function exigeTexto(r) {
  if (!r.texto.trim()) {
    throw new ErroConversa('resposta-vazia',
      'O serviço respondeu sem conteúdo. Tente reformular a pergunta.');
  }
  return r;
}
