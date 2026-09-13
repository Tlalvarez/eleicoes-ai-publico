/**
 * A medição do site: UMA porta, um vocabulário fechado, nenhum texto livre.
 *
 * O eleicoes.ai mede audiência em modo sem cookies e promete, em
 * /privacidade, que "os eventos são anônimos" e que só vão números, siglas e
 * códigos. Uma promessa dessas não se cumpre por disciplina de quem escreve a
 * próxima linha: um `posthog.capture('x', { texto })` escrito com pressa a
 * quebra em silêncio, e o vazamento só aparece meses depois, num painel.
 *
 * Por isso a medição inteira passa por `medir()`, e `medir()` é FECHADO:
 *
 *   1. o evento tem de estar em `EVENTOS` — nome que não está declarado não
 *      é enviado (e não vira dimensão nova no painel por acidente);
 *   2. a propriedade tem de estar na lista DAQUELE evento — chave fora da
 *      lista é descartada, não enviada "por via das dúvidas";
 *   3. o valor tem de ser número finito, booleano ou um texto CURTO e SEM
 *      ESPAÇO (`RE_VALOR`). É a invariante que se pode conferir num olhar:
 *      **prosa tem espaço; logo prosa não passa**. Texto de proposta, nome de
 *      pessoa e trecho de programa são prosa.
 *
 * O que sobra é estrutura: cargo, UF, id de tema, contagens, booleanos.
 *
 * `scripts/checa-medicao.mjs` guarda a porta no build: `posthog.capture` fora
 * daqui reprova o gate.
 */

import { CARGOS } from './cargos.mjs';

/** Tamanho máximo de um valor de texto. Slug, sigla, código, id de release. */
export const LIMITE_TEXTO = 64;

/**
 * A gramática de um valor de texto: letras, números e os separadores que
 * aparecem em slug (`romeu-zema`), id de tema (`seguranca-justica`) e
 * caminho (`/governador/sp`). Sem espaço, sem
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
  // --- a navegação da comparação --------------------------------------------
  /** abriu a página de um tema (`origem`: home | hub | faixa) */
  tema_aberto: ['tema', 'origem'],
  /** abriu a página de uma UF a partir da grade de estados (`destino`: a sigla) */
  uf_aberta: ['destino'],
  /** tocou numa proposta e viu os trechos dos programas */
  proposta_aberta: ['tema', 'candidatos', 'com_contra'],
  /** tirou ou pôs um candidato na comparação (`candidatos`: quantos ficaram) */
  comparacao_filtrada: ['tema', 'candidatos'],
  /** abriu o programa ou a candidatura no TSE */
  tse_aberto: ['slug'],
  /**
   * fez uma busca: O TEXTO da consulta (a única exceção de texto livre, ver
   * TEXTO_LIVRE — decisão do Thiago em 13/09: as buscas são gravadas para
   * entender o que as pessoas procuram), quantos resultados, em quantos temas,
   * em que modo (lexical | hibrido), se houve resultado direto e o tema aberto
   */
  busca_feita: ['consulta', 'resultados', 'temas', 'modo', 'direto', 'destino'],
});

/**
 * A exceção ao "prosa não passa": chaves que carregam texto livre, por
 * evento. Hoje só a consulta da busca. Tamanho máximo, espaços colapsados,
 * sem quebra de linha. Declarar aqui é o que a privacidade descreve — chave
 * nova entra nesta lista E na página de privacidade no mesmo commit.
 */
export const TEXTO_LIVRE = Object.freeze({ busca_feita: ['consulta'] });
export const LIMITE_TEXTO_LIVRE = 300;

export function textoLivreAceito(valor) {
  if (typeof valor !== 'string') return undefined;
  const s = valor.replace(/\s+/g, ' ').trim().slice(0, LIMITE_TEXTO_LIVRE);
  return s || undefined;
}

const SLUGS_DE_CARGO = new Set(CARGOS.map((c) => c.slug));
/** Deputado federal e senador saíram do menu; endereço antigo ainda chega. */
const CARGOS_CONHECIDOS = new Set([...SLUGS_DE_CARGO, 'deputado-federal', 'senador']);

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
 * O layout define o contexto pelo endereço; uma página que saiba mais que o
 * endereço pode definir o seu antes, e o do layout cede — o resultado é o
 * mesmo em qualquer ordem de empacotamento dos scripts.
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
  const livres = TEXTO_LIVRE[evento] ?? [];
  for (const [chave, bruto] of Object.entries(props ?? {})) {
    if (!aceitas.includes(chave)) continue;
    const valor = livres.includes(chave) ? textoLivreAceito(bruto) : valorAceito(bruto);
    if (valor !== undefined) saida[chave] = valor;
  }
  return saida;
}

/**
 * Manda o evento, se houver medição carregada.
 *
 * Nunca lança: medição que derruba a página é pior que medição que falta.
 * Fora de eleicoes.ai o PostHog nem é inicializado (ver Base.astro), então em
 * `astro dev`, nos gates e nas prévias `*.pages.dev` isto é um no-op.
 */
export function medir(evento, props = {}, { beacon = false } = {}) {
  const limpas = saneia(evento, props);
  if (!limpas) return false;
  try {
    const ph = globalThis.posthog;
    if (!ph || typeof ph.capture !== 'function') return false;
    // `beacon`: o evento é emitido logo antes de uma navegação; sendBeacon
    // sobrevive à troca de página, o fetch normal pode ser cancelado
    if (beacon) ph.capture(evento, limpas, { transport: 'sendBeacon' });
    else ph.capture(evento, limpas);
    return true;
  } catch {
    return false;
  }
}

/**
 * O contexto que se deduz do endereço.
 *
 * `cargo` e `uf` só saem daqui se forem reconhecidos: caminho inventado
 * (`/xpto/yz`) não vira dimensão nova no painel. `pagina` é o TIPO de página
 * (home, cargo, uf, tema, outra), nunca o endereço completo.
 */
export function contextoDoCaminho(caminho) {
  const limpo = String(caminho ?? '/').replace(/index\.html$/, '').replace(/\.html$/, '');
  const partes = limpo.split('/').filter(Boolean);
  if (!partes.length) return { cargo: '', uf: '', pagina: 'home' };
  if (partes[0] === 'busca') return { cargo: '', uf: '', pagina: 'busca' };
  const [primeira, segunda, terceira] = partes;
  if (CARGOS_CONHECIDOS.has(primeira)) {
    // presidente é nacional: `/presidente/<tema>` é tema, nunca UF
    const porUF = primeira !== 'presidente';
    const uf = porUF && /^[a-z]{2}$/i.test(segunda ?? '') ? segunda.toLowerCase() : '';
    let pagina = 'cargo';
    if (terceira) pagina = 'tema';               // /governador/sp/<tema>
    else if (uf) pagina = 'uf';                  // /governador/sp
    else if (segunda) pagina = 'tema';           // /presidente/<tema>
    return { cargo: primeira, uf, pagina };
  }
  return { cargo: '', uf: '', pagina: valorAceito(primeira) ? primeira : 'outra' };
}
