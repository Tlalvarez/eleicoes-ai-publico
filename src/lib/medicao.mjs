/**
 * A medição do site: UMA porta, um vocabulário fechado, nenhum texto livre.
 *
 * O eleicoes.ai mede audiência em modo sem cookies e promete, em
 * /privacidade, que "os eventos são anônimos" e que "o texto da pergunta é
 * mascarado nas medições". Uma promessa dessas não se cumpre por disciplina de
 * quem escreve a próxima linha: um `posthog.capture('x', { pergunta })` escrito
 * com pressa a quebra em silêncio, e o vazamento só aparece meses depois, num
 * painel, com o texto de alguém dentro.
 *
 * Por isso a medição inteira passa por `medir()`, e `medir()` é FECHADO:
 *
 *   1. o evento tem de estar em `EVENTOS` — nome que não está declarado não
 *      é enviado (e não vira dimensão nova no painel por acidente);
 *   2. a propriedade tem de estar na lista DAQUELE evento — chave fora da
 *      lista é descartada, não enviada "por via das dúvidas";
 *   3. o valor tem de ser número finito, booleano ou um texto CURTO e SEM
 *      ESPAÇO (`RE_VALOR`). É a invariante que se pode conferir num olhar:
 *      **prosa tem espaço; logo prosa não passa**. Pergunta, resposta, nome de
 *      pessoa e trecho de fonte são prosa.
 *
 * O que sobra é estrutura: cargo, UF, número de fontes, código de erro,
 * milissegundos. Conteúdo — o que se perguntou e o que se respondeu — vive no
 * registro do serviço de evidências, sem ligação com a sessão de navegação.
 * Os dois lados são medidos; eles é que não se cruzam.
 *
 * `scripts/checa-medicao.mjs` guarda a porta no build: `posthog.capture` fora
 * daqui reprova o gate.
 */

import { CARGOS } from './cargos.mjs';

/** Tamanho máximo de um valor de texto. Slug, sigla, código, id de release. */
export const LIMITE_TEXTO = 64;

/**
 * A gramática de um valor de texto: letras, números e os separadores que
 * aparecem em slug (`romeu-zema`), código (`sem-followup`), release
 * (`rel_2026-09-06_01`) e caminho (`/governador/sp`). Sem espaço, sem
 * acento, sem pontuação de frase.
 */
export const RE_VALOR = /^[A-Za-z0-9_:/.-]{1,64}$/;

/** As chaves de contexto, permitidas em todo evento (ver `defineContexto`). */
export const CONTEXTO = Object.freeze(['cargo', 'uf', 'pagina']);

/**
 * O vocabulário. Evento → propriedades aceitas.
 *
 * Nome de evento em português, como o resto do código: quem lê o painel é
 * quem lê este arquivo. Evento novo entra aqui ANTES de ter chamador.
 */
export const EVENTOS = Object.freeze({
  // --- o funil da conversa -------------------------------------------------
  /** a pessoa mandou uma pergunta (`origem`: form | url | nova) */
  pergunta_enviada: ['turno', 'origem', 'tamanho'],
  /** o primeiro pedaço de texto chegou — o tempo até a tela deixar de esperar */
  resposta_primeiro_texto: ['turno', 'ms'],
  /** a resposta chegou inteira e validada */
  resposta_recebida: ['turno', 'ms', 'fontes', 'candidatos', 'com_material',
    'sem_material', 'sem_fontes', 'release_id', 'via_fallback'],
  /** o serviço não respondeu (`codigo` vem de ErroConversa) */
  resposta_falhou: ['turno', 'ms', 'codigo'],
  /** a pessoa desistiu antes de a resposta chegar */
  pergunta_cancelada: ['turno', 'ms'],

  // --- a verificação: a promessa do produto é o link da fonte --------------
  /** abriu a lista "Ver as N fontes desta resposta" */
  fontes_abertas: ['turno', 'fontes'],
  /** clicou no link de UMA fonte — o evento que diz se a evidência é usada */
  fonte_aberta: ['turno', 'posicao', 'tipo', 'estatuto', 'candidato'],

  // --- circulação ----------------------------------------------------------
  resposta_compartilhada: ['turno', 'canal'],
  resposta_copiada: ['turno', 'formato'],
  problema_reportado: ['turno'],
  /** alguém abriu um /resposta/<id> que recebeu de outra pessoa */
  resposta_recebida_por_link: ['achou'],

  // --- memória do navegador ------------------------------------------------
  conversa_restaurada: ['turnos'],
  conversa_reiniciada: ['turnos'],
  turno_apagado: [],

  // --- navegação do acervo -------------------------------------------------
  candidato_aberto: ['posicao', 'slug', 'elegivel'],
  tse_aberto: ['slug'],
});

const SLUGS_DE_CARGO = new Set(CARGOS.map((c) => c.slug));
/** Deputado federal saiu do menu em 06/09; endereço antigo ainda chega. */
const CARGOS_CONHECIDOS = new Set([...SLUGS_DE_CARGO, 'deputado-federal']);

let contexto = {};

/**
 * Fixa o contexto desta página. Vai junto de todo evento.
 * Chaves fora de `CONTEXTO`, ou valores fora da gramática, são descartados.
 */
export function defineContexto(valores) {
  contexto = {};
  for (const chave of CONTEXTO) {
    const valor = valorAceito(valores?.[chave]);
    if (valor !== undefined) contexto[chave] = valor;
  }
  return { ...contexto };
}

/**
 * Fixa o contexto SÓ SE ainda não houver um.
 *
 * O layout e o chat definem contexto cada um por sua conta, e a ordem em que
 * o Astro empacota os dois scripts não é contrato. O do chat é o bom (em
 * `/resposta/<id>` o endereço não diz o cargo, e o chat diz), então o do
 * layout cede: assim o resultado é o mesmo nas duas ordens possíveis.
 */
export function defineContextoPadrao(valores) {
  if (Object.keys(contexto).length) return { ...contexto };
  return defineContexto(valores);
}

/** O contexto em vigor (usado pelos testes e pelo gate). */
export function contextoAtual() {
  return { ...contexto };
}

/** Esquece o contexto — só os testes usam. */
export function limpaContexto() {
  contexto = {};
}

/** O valor, se a gramática o aceita; `undefined` se não. */
export function valorAceito(valor) {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;
  if (typeof valor === 'string') {
    const s = valor.trim();
    // string vazia é ausência de dimensão (UF na home), não dimensão vazia
    if (!s) return undefined;
    return s.length <= LIMITE_TEXTO && RE_VALOR.test(s) ? s : undefined;
  }
  return undefined;
}

/**
 * O que seria enviado: `null` se o evento não está declarado, senão as
 * propriedades já filtradas (contexto incluído).
 *
 * Separado de `medir` de propósito: é isto que os testes exercitam, sem
 * navegador e sem rede.
 */
export function saneia(evento, props = {}) {
  const aceitas = EVENTOS[evento];
  if (!aceitas) return null;
  const saida = { ...contexto };
  for (const [chave, bruto] of Object.entries(props ?? {})) {
    if (!aceitas.includes(chave)) continue;
    const valor = valorAceito(bruto);
    if (valor !== undefined) saida[chave] = valor;
  }
  return saida;
}

/**
 * Manda o evento, se houver medição carregada.
 *
 * Nunca lança: medição que derruba a conversa é pior que medição que falta.
 * Fora de eleicoes.ai o PostHog nem é inicializado (ver Base.astro), então em
 * `astro dev`, nos gates e nas prévias `*.pages.dev` isto é um no-op.
 */
export function medir(evento, props = {}) {
  const limpas = saneia(evento, props);
  if (!limpas) return false;
  try {
    const ph = globalThis.posthog;
    if (!ph || typeof ph.capture !== 'function') return false;
    ph.capture(evento, limpas);
    return true;
  } catch {
    return false;
  }
}

/**
 * O contexto que se deduz do endereço, para as páginas sem chat.
 *
 * `cargo` e `uf` só saem daqui se forem reconhecidos: caminho inventado
 * (`/xpto/yz`) não vira dimensão nova no painel. `pagina` é o TIPO de página,
 * nunca o endereço completo — `/resposta/<id>` viraria identificador.
 */
export function contextoDoCaminho(caminho) {
  const limpo = String(caminho ?? '/').replace(/index\.html$/, '').replace(/\.html$/, '');
  const partes = limpo.split('/').filter(Boolean);
  if (!partes.length) return { cargo: 'presidente', uf: '', pagina: 'home' };
  const [primeira, segunda, terceira] = partes;
  if (primeira === 'resposta') return { cargo: '', uf: '', pagina: 'resposta' };
  if (CARGOS_CONHECIDOS.has(primeira)) {
    // presidente é nacional: `/presidente/<slug>` é candidato, nunca UF
    const porUF = primeira !== 'presidente';
    const uf = porUF && /^[a-z]{2}$/i.test(segunda ?? '') ? segunda.toLowerCase() : '';
    let pagina = 'cargo';
    if (terceira) pagina = 'candidato';          // /governador/sp/<slug>
    else if (uf) pagina = 'uf';                  // /governador/sp
    else if (segunda) pagina = 'candidato';      // /presidente/<slug>
    return { cargo: primeira, uf, pagina };
  }
  return { cargo: '', uf: '', pagina: valorAceito(primeira) ? primeira : 'outra' };
}

/**
 * A faixa de tamanho da pergunta, em vez do tamanho exato.
 *
 * O número de caracteres de uma pergunta é uma impressão digital fraca mas
 * real: com poucos eventos por sessão, `147` casa com uma pergunta específica
 * no registro do serviço. Três faixas respondem o que se quer saber ("as
 * pessoas escrevem frases ou palavras soltas?") sem servir de chave.
 */
export function faixaDeTamanho(texto) {
  const n = String(texto ?? '').trim().length;
  if (n <= 40) return 'curta';
  if (n <= 140) return 'media';
  return 'longa';
}
