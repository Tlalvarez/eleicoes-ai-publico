/**
 * Permalink de um resultado, dentro da própria URL.
 *
 * O site é estático: não há onde guardar uma conversa. Um "link para este
 * resultado" apoiado em servidor seria promessa que a arquitetura não paga.
 * E um link que carregasse só a PERGUNTA reabriria uma resposta possivelmente
 * diferente — quem compartilha assina um texto, não um sorteio.
 *
 * Então o estado viaja na URL:
 *
 *   · no FRAGMENTO (`#r=`), não na query — fragmento não vai para o servidor,
 *     não entra em log de CDN e não vira chave de cache;
 *   · comprimido (`deflate-raw`) quando o ambiente tem CompressionStream, o
 *     que corta uma resposta longa a menos de um quarto do tamanho;
 *   · com soma de verificação, para carga truncada ou adulterada virar "link
 *     inválido" em vez de meia resposta plausível.
 *
 * URL tem limite prático. Ele é explícito aqui: acima de `LIMITE_URL` o
 * permalink não é oferecido, e a interface continua com copiar texto, copiar
 * Markdown e WhatsApp. Emitir uma URL de dezenas de milhares de caracteres,
 * que quebra ao colar, seria pior do que dizer que não coube.
 *
 * **A carga é entrada hostil.** A soma de verificação detecta truncamento;
 * ela NÃO autentica origem — FNV-1a é público e qualquer pessoa recalcula.
 * Então quem decodifica trata o fragmento como se viesse de um estranho:
 *
 *   · o resultado passa pela MESMA `normalizaResposta` da resposta do serviço,
 *     que é onde `hrefSeguro` descarta `javascript:` e afins. Sem isso, um
 *     permalink fabricado punha um endereço executável direto no `href` de uma
 *     "fonte";
 *   · a declaração de release NÃO viaja. Um fragmento que carregasse
 *     `release_status: "oficial"` faria a página carimbar de Release oficial
 *     um texto escrito pelo atacante. Conteúdo reconstruído da URL é sempre
 *     prévia, e a página diz que ele não é autenticado;
 *   · há teto de bytes antes e depois da descompressão, e teto de citações.
 *     Sem o segundo, uma carga curta e muito repetitiva vira gigabytes ao
 *     descomprimir.
 *
 * Puro, sem DOM e sem `node:` — o mesmo módulo roda nos testes e no navegador.
 */
import { normalizaResposta } from './chat.mjs';

export const VERSAO = '1';
export const PREFIXO_FRAGMENTO = '#r=';

/**
 * Teto do comprimento da URL inteira.
 *
 * Não é o limite do navegador (bem maior), é o limite do que sobrevive a ser
 * colado: campo de mensagem, encurtador, pré-visualização de link.
 */
export const LIMITE_URL = 8000;

/**
 * Teto da carga em bytes, antes de descomprimir.
 *
 * Folgado em relação a `LIMITE_URL` de propósito: `montaPermalink` é quem
 * decide o que o site OFERECE; isto aqui é o que a decodificação ACEITA de um
 * desconhecido. Os dois números têm donos diferentes.
 */
export const LIMITE_CARGA = 32 * 1024;

/** Teto do conteúdo já descomprimido — o freio contra bomba de descompressão. */
export const LIMITE_CONTEUDO = 256 * 1024;

/** Teto de citações numa carga. Resposta real do formato "Candidatos" fica bem abaixo. */
export const LIMITE_CITACOES = 200;

/** Ordem dos campos de uma citação na forma compacta. */
const CAMPOS_CITACAO = ['marcadores', 'candidato', 'nome', 'rotulo', 'tipo',
  'data', 'url', 'ts', 'estatuto', 'estatuto_rotulo'];

const vazio = (v) => v === undefined || v === null || v === '';

/** Resultado → objeto compacto (chaves curtas, citação como tupla). */
export function paraCompacto(resultado = {}) {
  const compacto = {
    p: resultado.pergunta ?? '',
    t: resultado.texto ?? '',
    c: (resultado.citacoes ?? []).map((cit) =>
      CAMPOS_CITACAO.map((campo) => (vazio(cit?.[campo]) ? null : cit[campo]))),
  };
  if (!vazio(resultado.rodape)) compacto.r = resultado.rodape;
  if (!vazio(resultado.id)) compacto.i = resultado.id;
  // `release_id`/`release_status` ficam de fora: ver o cabeçalho. Um carimbo
  // de oficialidade que viaja na URL é um carimbo que qualquer um imprime.
  return compacto;
}

/**
 * Objeto compacto → resultado, tratado como entrada hostil.
 *
 * A saída é a de `normalizaResposta` — a mesma forma, pelo mesmo caminho, que
 * a resposta vinda do serviço. Isso não é economia de código: é a garantia de
 * que não existe uma segunda porta de entrada com regras próprias. `pergunta`
 * é o único campo a mais, e é texto (vai para `textContent`).
 *
 * Devolve `null` quando a carga estoura os tetos — não um resultado podado,
 * que esconderia do leitor que faltou pedaço.
 */
export function deCompacto(compacto) {
  if (!compacto || typeof compacto !== 'object' || Array.isArray(compacto)) return null;
  if (Array.isArray(compacto.c) && compacto.c.length > LIMITE_CITACOES) return null;

  const citacoes = (Array.isArray(compacto.c) ? compacto.c : []).map((tupla) => {
    const cit = {};
    CAMPOS_CITACAO.forEach((campo, i) => {
      const v = Array.isArray(tupla) ? tupla[i] : undefined;
      if (!vazio(v)) cit[campo] = v;
    });
    return cit;
  });

  const resultado = normalizaResposta({
    id: compacto.i,
    texto: compacto.t,
    citacoes,
    rodape: compacto.r,
    // release NÃO vem do fragmento, aconteça o que acontecer com a carga
    release_id: null,
    release_status: null,
  });
  return { pergunta: typeof compacto.p === 'string' ? compacto.p : '', ...resultado };
}

// ---------------------------------------------------------------------------
// bytes
// ---------------------------------------------------------------------------

/** FNV-1a de 32 bits: detecta truncamento e adulteração, não é assinatura. */
function soma(bytes) {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function paraBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto) {
  const bin = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function transforma(bytes, tipo, modo) {
  const Fluxo = globalThis[modo];
  if (typeof Fluxo !== 'function') return null;
  const fluxo = new Fluxo(tipo);
  const escritor = fluxo.writable.getWriter();
  escritor.write(bytes);
  escritor.close();
  return new Uint8Array(await new Response(fluxo.readable).arrayBuffer());
}

// ---------------------------------------------------------------------------
// codec
// ---------------------------------------------------------------------------

/** Resultado → carga compacta, segura de colar em URL. */
export async function codifica(resultado) {
  const cru = new TextEncoder().encode(JSON.stringify(paraCompacto(resultado)));
  let codec = 'j';
  let corpo = cru;
  const comprimido = await transforma(cru, 'deflate-raw', 'CompressionStream')
    .catch(() => null);
  if (comprimido && comprimido.length < cru.length) {
    codec = 'z';
    corpo = comprimido;
  }
  const marca = soma(corpo);
  const bytes = new Uint8Array(4 + corpo.length);
  bytes[0] = (marca >>> 24) & 0xff;
  bytes[1] = (marca >>> 16) & 0xff;
  bytes[2] = (marca >>> 8) & 0xff;
  bytes[3] = marca & 0xff;
  bytes.set(corpo, 4);
  return VERSAO + codec + paraBase64Url(bytes);
}

/** Carga → resultado, ou `null`. Nunca lança: link quebrado é caso normal. */
export async function decodifica(carga) {
  if (typeof carga !== 'string' || carga.length < 8) return null;
  if (carga[0] !== VERSAO) return null;
  const codec = carga[1];
  if (codec !== 'z' && codec !== 'j') return null;
  if (!/^[A-Za-z0-9_-]+$/.test(carga.slice(2))) return null;
  if (carga.length > LIMITE_CARGA) return null;
  try {
    const bytes = deBase64Url(carga.slice(2));
    if (bytes.length < 5) return null;
    const marca = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    const corpo = bytes.subarray(4);
    if (soma(corpo) !== marca) return null;
    const cru = codec === 'z'
      ? await transforma(corpo, 'deflate-raw', 'DecompressionStream')
      : corpo;
    if (!cru || cru.length > LIMITE_CONTEUDO) return null;
    return deCompacto(JSON.parse(new TextDecoder().decode(cru)));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

/**
 * O permalink do resultado.
 *
 * Devolve sempre `{url, cabe, tamanho}`: quando não cabe, `url` é null e o
 * tamanho medido fica disponível para a interface explicar por quê.
 */
export async function montaPermalink(base, resultado, { limite = LIMITE_URL } = {}) {
  const carga = await codifica(resultado);
  const url = `${String(base).split('#')[0]}${PREFIXO_FRAGMENTO}${carga}`;
  const cabe = url.length <= limite;
  return { url: cabe ? url : null, cabe, tamanho: url.length };
}

/** `location.hash` → resultado, ou `null` se não for um permalink. */
export async function estadoDoFragmento(hash) {
  if (typeof hash !== 'string') return null;
  const bruto = hash.startsWith('#') ? hash : `#${hash}`;
  if (!bruto.startsWith(PREFIXO_FRAGMENTO)) return null;
  return decodifica(bruto.slice(PREFIXO_FRAGMENTO.length));
}
