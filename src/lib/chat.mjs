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
export const CAMINHO_CONVERSA_AO_VIVO = '/api/conversa/stream';
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

/**
 * O escopo da página no formato do contrato: `{cargo}` ou `{cargo, uf}`.
 * Sem cargo, `null` — e o serviço considera o catálogo inteiro.
 */
export function escopoDoContrato(escopo) {
  const cargo = str(escopo?.cargo).trim();
  if (!cargo) return null;
  const uf = str(escopo?.uf).trim().toUpperCase();
  return uf ? { cargo, uf } : { cargo };
}

/** Corpo de `/api/conversa`: o histórico inteiro, só com papéis do contrato. */
export function corpoConversa(mensagens, respostaId, escopo) {
  const corpo = {
    mensagens: (mensagens ?? [])
      .filter((m) => PAPEIS.has(m?.papel) && str(m?.texto).trim())
      .map((m) => ({ papel: m.papel, texto: m.texto })),
  };
  if (str(respostaId).trim()) corpo.resposta_id = respostaId;
  const e = escopoDoContrato(escopo);
  if (e) corpo.escopo = e;
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
export async function pergunta(mensagens, {
  apiBase, buscar = globalThis.fetch, respostaId, escopo,
} = {}) {
  const base = String(apiBase ?? '').replace(/\/+$/, '');

  let conversa = await postaJson(buscar, base + CAMINHO_CONVERSA,
    corpoConversa(mensagens, respostaId, escopo));

  // Serviço ANTERIOR ao escopo: o contrato dele é fechado e devolve 400
  // `chaves_desconhecidas` para a chave nova. Site e serviço publicam em
  // lugares diferentes, e o site pode sair na frente — nesse intervalo a
  // pergunta segue sem escopo (o comportamento antigo), em vez de quebrar.
  if (escopoDoContrato(escopo) && await recusouOEscopo(conversa)) {
    conversa = await postaJson(buscar, base + CAMINHO_CONVERSA,
      corpoConversa(mensagens, respostaId, null));
  }

  if (conversa.ok) {
    return { ...exigeTexto(normalizaResposta(await leJson(conversa))), viaFallback: false };
  }
  return fallbackOuErro(conversa, mensagens, base, buscar);
}

async function recusouOEscopo(resposta) {
  if (resposta.status !== 400) return false;
  try {
    const corpo = await resposta.json();
    return corpo?.codigo === 'chaves_desconhecidas' && /escopo/.test(String(corpo?.erro));
  } catch {
    return false;
  }
}

/**
 * A mesma pergunta, recebendo a resposta ENQUANTO ela é escrita.
 *
 * Fala com `/api/conversa/stream` (SSE): `aoEtapa(texto)` recebe o progresso
 * em linguagem de leitor, `aoTexto(trecho)` recebe pedaços da resposta. O que
 * chega por `aoTexto` é rascunho — só o `resultado` final é a resposta: o
 * serviço valida cada parte no momento em que ela fica conferível e pode
 * retratar o que já mandou (evento `erro` depois de texto). Quem desenha
 * descarta o rascunho quando esta função lança.
 *
 * Serviço sem a rota (404/405/501) cai em `pergunta()`, que tem o fallback
 * de sempre; 503 e demais status seguem exatamente a regra da rota JSON.
 */
export async function perguntaAoVivo(mensagens, {
  apiBase, buscar = globalThis.fetch, respostaId, escopo, aoEtapa, aoTexto,
} = {}) {
  const base = String(apiBase ?? '').replace(/\/+$/, '');

  const r = await postaJson(buscar, base + CAMINHO_CONVERSA_AO_VIVO,
    corpoConversa(mensagens, respostaId, escopo));

  if (!r.ok) {
    if (precisaFallback(r.status)) {
      return pergunta(mensagens, { apiBase, buscar, respostaId, escopo });
    }
    return fallbackOuErro(r, mensagens, base, buscar);
  }

  const fim = await leEventos(r, { aoEtapa, aoTexto });
  if (fim.tipo === 'resultado') {
    return { ...exigeTexto(normalizaResposta(fim.dados)), viaFallback: false };
  }
  if (fim.tipo === 'erro') {
    const status = Number(fim.dados?.status) || 500;
    throw new ErroConversa('servidor',
      `O serviço de evidências respondeu com erro (${status}). `
      + 'Tente de novo em alguns instantes.');
  }
  throw new ErroConversa('resposta-invalida',
    'O serviço encerrou a resposta sem concluí-la. Tente de novo.');
}

/**
 * Lê o corpo SSE até o evento final (`resultado` ou `erro`).
 *
 * Aceita tanto um `body` em stream (navegador) quanto uma resposta que só
 * tem `text()` (testes e clientes simples). O parser é o mínimo do formato:
 * blocos separados por linha em branco, `event:` e `data:` (JSON).
 */
export async function leEventos(resposta, { aoEtapa, aoTexto } = {}) {
  let fim = null;
  const trata = (tipo, dados) => {
    if (fim) return;
    if (tipo === 'etapa') aoEtapa?.(str(dados?.m));
    else if (tipo === 'texto') aoTexto?.(str(dados?.t));
    else if (tipo === 'resultado' || tipo === 'erro') fim = { tipo, dados };
  };
  const decodifica = (bloco) => {
    let tipo = null;
    const linhas = [];
    for (const linha of bloco.split(/\r?\n/)) {
      if (linha.startsWith('event:')) tipo = linha.slice(6).trim();
      else if (linha.startsWith('data:')) linhas.push(linha.slice(5).trimStart());
    }
    if (!tipo || !linhas.length) return;
    let dados;
    try { dados = JSON.parse(linhas.join('\n')); } catch { return; }
    trata(tipo, dados);
  };

  if (resposta.body && typeof resposta.body.getReader === 'function') {
    const leitor = resposta.body.getReader();
    const decoder = new TextDecoder();
    let pendente = '';
    try {
      while (!fim) {
        const { value, done } = await leitor.read();
        if (done) break;
        pendente += decoder.decode(value, { stream: true });
        let corte;
        while (!fim && (corte = pendente.search(/\r?\n\r?\n/)) >= 0) {
          const bloco = pendente.slice(0, corte);
          pendente = pendente.slice(corte).replace(/^\r?\n\r?\n/, '');
          decodifica(bloco);
        }
      }
      if (!fim && pendente.trim()) decodifica(pendente);
    } finally {
      try { await leitor.cancel(); } catch { /* já encerrado */ }
    }
  } else {
    let texto;
    try {
      texto = await resposta.text();
    } catch (e) {
      throw new ErroConversa('resposta-invalida',
        'O serviço respondeu num formato que não consegui ler.', e);
    }
    for (const bloco of String(texto).split(/\r?\n\r?\n/)) decodifica(bloco);
  }
  return fim ?? { tipo: null, dados: null };
}

/** O que fazer com uma resposta que não é 2xx: o fallback, ou o erro tipado. */
async function fallbackOuErro(conversa, mensagens, base, buscar) {
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

/**
 * Lê uma resposta guardada (`GET /api/respostas/<id>`) na mesma forma que
 * `pergunta()` devolve. `null` se o serviço não a tem (404) ou o id é inválido.
 */
export async function carregaResposta(id, { apiBase, buscar = globalThis.fetch } = {}) {
  if (!ehIdPublico(id)) return null;
  const base = String(apiBase ?? '').replace(/\/+$/, '');
  let r;
  try {
    r = await buscar(`${base}/api/respostas/${id}`, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new ErroConversa('rede', 'Não foi possível falar com o serviço de evidências.', { cause: e });
  }
  if (r.status === 404) return null;
  if (!r.ok) {
    throw new ErroConversa('servidor',
      `O serviço de evidências respondeu com erro (${r.status}). Tente de novo em alguns instantes.`);
  }
  const doc = await leJson(r);
  const resposta = doc && typeof doc.resposta === 'object' ? doc.resposta : {};
  return exigeTexto(normalizaResposta({
    ...resposta, pergunta: doc?.pergunta, compartilhamento_id: doc?.compartilhamento_id ?? id,
  }));
}

function exigeTexto(r) {
  if (!r.texto.trim()) {
    throw new ErroConversa('resposta-vazia',
      'O serviço respondeu sem conteúdo. Tente reformular a pergunta.');
  }
  return r;
}
