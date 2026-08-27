/**
 * A MESMA árvore de nós de src/lib/markdown.mjs, serializada como HTML.
 *
 * Na home este problema não existe: `criaElementos` materializa a resposta com
 * `createElement`/`createTextNode`, e não há ponto em que um caractere do texto
 * possa virar estrutura. A página pública de uma resposta é servida por uma
 * função no Cloudflare Pages, onde não há DOM para materializar — há um
 * documento a escrever. O conteúdo continua vindo de terceiro, então a defesa
 * muda de forma sem afrouxar.
 *
 * A forma é esta: o parser continua sendo o único a decidir o que é ESTRUTURA
 * (ele produz nós, nunca marcação), e aqui cada nó vira uma tag que este
 * arquivo escolheu, com o texto sempre escapado e o endereço sempre filtrado.
 * Nenhuma string vinda do serviço chega ao documento sem passar por
 * `escapaTexto` ou `escapaAtributo`; nenhum `href` sai sem passar por
 * `hrefPublico`. Não há caminho alternativo — é por isso que o módulo é
 * pequeno e não aceita opção nenhuma de "confiar neste pedaço".
 *
 * `hrefPublico` é mais restrito que o `hrefSeguro` do parser: aqui só passam
 * `http`/`https` e caminhos do próprio site. `mailto:` numa página que existe
 * para ser compartilhada em massa não tem uso, e cada esquema a menos é uma
 * superfície a menos.
 *
 * Puro, sem DOM e sem `node:` — roda no teste e no runtime do Pages.
 */

const texto = (v) => (typeof v === 'string' ? v : '');

/**
 * Escapa o que separa TEXTO de ESTRUTURA.
 *
 * As aspas entram na conta mesmo em texto visível, onde tecnicamente não
 * precisariam: o atributo é escrito entre aspas duplas, e uma aspa é o
 * caractere que fecha o atributo e abre um `onerror=` ao lado. Ter UMA regra
 * de escape, e não duas com fronteira a acertar, é o que torna a invariante
 * conferível numa frase: nenhum caractere de estrutura vindo do serviço
 * sobrevive em lugar nenhum do documento.
 */
export function escapaTexto(valor) {
  return texto(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * O mesmo escape, com o nome do destino.
 *
 * Existe para o ponto de chamada dizer onde o valor vai parar. Se um dia as
 * duas pontas divergirem, é aqui que a diferença aparece — e não espalhada por
 * quem monta o documento.
 */
export const escapaAtributo = escapaTexto;

/** Espaços e caracteres de controle que o navegador ignora ao ler o esquema. */
const RUIDO_DE_ESQUEMA = /[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g;

/** Controles que não podem sobrar dentro de um atributo de metadado. */
const CONTROLES = /[\u0000-\u0020\u007f-\u009f\u2028\u2029\ufeff]+/g;

/**
 * O endereço, se ele puder virar `href` nesta página — senão `null`.
 *
 * O esquema é lido de uma cópia SEM espaços nem controles: `java\tscript:` e
 * `javascript\n:` são lidos como `javascript:` pelos navegadores, e uma
 * checagem ingênua de prefixo não os pega.
 */
export function hrefPublico(bruto) {
  if (typeof bruto !== 'string') return null;
  const url = bruto.trim();
  if (!url) return null;
  // WHATWG normaliza `http:\\host` para `http://host`; rejeitar antes de
  // qualquer ramo evita que parsers diferentes discordem do destino real.
  if (url.includes('\\')) return null;
  const semRuido = url.replace(RUIDO_DE_ESQUEMA, '');
  const dois = semRuido.indexOf(':');
  const caminho = semRuido.search(/[/?#]/);
  if (dois > 0 && (caminho === -1 || dois < caminho)) {
    if (!/^https?$/i.test(semRuido.slice(0, dois))) return null;
    try {
      const absoluta = new URL(url);
      if (absoluta.protocol !== 'http:' && absoluta.protocol !== 'https:') return null;
      // `https://eleicoes.ai@evil.example` é host evil.example com userinfo
      // enganoso; a página pública não tem uso legítimo para credenciais em URL.
      if (absoluta.username || absoluta.password) return null;
      return url;
    } catch {
      return null;
    }
  }
  // relativo: só o que é inequivocamente do próprio site. `//host` é uma URL
  // externa dependente do protocolo e `\\host` sofre interpretações diferentes
  // entre parsers; nenhum dos dois pode se disfarçar de caminho interno.
  if (url.startsWith('//')) return null;
  return /^[/#?]/.test(url) ? url : null;
}

/**
 * Texto para dentro de um atributo `content` de metadado.
 *
 * Quebra de linha, tabulação e controles somem: um `content` com `\n` não
 * quebra o documento, mas quebra o consumidor — o robô de prévia lê o valor
 * como uma linha só. O corte é em fronteira de palavra, e é marcado.
 */
export function textoDeMeta(valor, limite = 200) {
  const limpo = texto(valor).replace(CONTROLES, ' ').replace(/\s+/g, ' ').trim();
  if (limpo.length <= limite) return limpo;
  const cortado = limpo.slice(0, limite);
  const espaco = cortado.lastIndexOf(' ');
  return `${(espaco > limite * 0.5 ? cortado.slice(0, espaco) : cortado).trimEnd()}…`;
}

/** `<a href>` completo, ou só o rótulo quando o endereço foi recusado. */
function ancoraDeLink(href, dentro) {
  const seguro = hrefPublico(href);
  // endereço recusado: o RÓTULO continua visível, sem virar link. Sumir com o
  // texto esconderia do leitor que havia ali uma referência.
  if (!seguro) return dentro;
  const externo = /^https?:/i.test(seguro)
    ? ' target="_blank" rel="noopener noreferrer nofollow"' : '';
  return `<a href="${escapaAtributo(seguro)}"${externo}>${dentro}</a>`;
}

const ancoraPadrao = (n) => `#fonte-${n}`;

function serializa(no, opcoes) {
  const { ancora, nivelBase } = opcoes;
  const filhos = () => paraHtml(no.filhos ?? [], opcoes);
  switch (no.t) {
    case 'texto': return escapaTexto(no.valor);
    case 'quebra': return '<br />';
    case 'codigo': return `<code>${escapaTexto(no.valor)}</code>`;
    case 'forte': return `<strong>${filhos()}</strong>`;
    case 'enfase': return `<em>${filhos()}</em>`;
    case 'link': return ancoraDeLink(no.href, filhos());
    case 'marcador':
      return `<sup><a href="${escapaAtributo(ancora(no.n))}" class="marcador-fonte">`
        + `${escapaTexto(`[S${no.n}]`)}</a></sup>`;
    case 'h': {
      const nivel = Math.min(6, Math.max(1, (no.nivel ?? 1) + nivelBase));
      return `<h${nivel}>${filhos()}</h${nivel}>`;
    }
    case 'p': return `<p>${filhos()}</p>`;
    case 'hr': return '<hr />';
    case 'citacao': return `<blockquote>${filhos()}</blockquote>`;
    case 'ul': case 'ol': {
      const inicio = no.t === 'ol' && Number.isInteger(no.inicio) && no.inicio !== 1
        ? ` start="${escapaAtributo(String(no.inicio))}"` : '';
      const itens = (no.itens ?? [])
        .map((item) => `<li>${paraHtml(item.filhos ?? [], opcoes)}</li>`).join('');
      return `<${no.t}${inicio}>${itens}</${no.t}>`;
    }
    default: return '';
  }
}

/** Árvore de nós → HTML. Só as tags que este arquivo escolheu. */
export function paraHtml(nos, { ancora = ancoraPadrao, nivelBase = 0 } = {}) {
  return (Array.isArray(nos) ? nos : [])
    .map((no) => serializa(no, { ancora, nivelBase })).join('');
}
