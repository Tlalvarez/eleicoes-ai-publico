/**
 * Markdown seguro para a resposta do chat.
 *
 * A resposta é texto Markdown vindo de um serviço, com links para fontes de
 * terceiros. A página antiga montava isso com `innerHTML` sobre um
 * mini-markdown que escapava `& < > " '` à mão — e escapar à mão é uma
 * corrida que se perde: o escape cobria o TEXTO e não o ENDEREÇO, então
 * `[clique](javascript:…)` virava um link executável. No formato "Candidatos"
 * praticamente toda linha carrega um link de fonte, ou seja, o caminho de
 * ataque era o caminho principal do produto.
 *
 * Aqui o parser não produz marcação nenhuma. Ele produz uma ÁRVORE DE NÓS —
 * dados — e `criaElementos` a materializa com `createElement`,
 * `createTextNode` e `setAttribute`. Não existe ponto em que um caractere do
 * texto de origem possa virar estrutura: `<script>` no meio da resposta é uma
 * string dentro de um nó de texto, e ponto.
 *
 * A cobertura de sintaxe é a que o formato "Candidatos" (tópico do Telegram)
 * exige, e só ela: conclusão primeiro em parágrafo, seções com título,
 * bullets (com um nível de aninhamento), listas numeradas, negrito/itálico,
 * código em linha, citação em bloco, separador `---` entre blocos
 * comparativos, links de fonte e os marcadores `[S1]`.
 *
 * Puro e sem dependência de DOM: `analisaMarkdown` roda igual no build, nos
 * testes e no navegador.
 */

/** Esquemas de URL que podem virar `href`. O resto vira texto. */
const ESQUEMAS_OK = new Set(['http', 'https', 'mailto']);

/** Espaços e caracteres de controle que o navegador ignora ao ler o esquema. */
const RUIDO_DE_ESQUEMA = /[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g;

/**
 * O endereço, se ele puder virar `href` — senão `null`.
 *
 * O esquema é lido de uma cópia SEM espaços nem caracteres de controle:
 * `java\tscript:` e `javascript\n:` são interpretados como `javascript:` pelos
 * navegadores, e uma checagem ingênua de prefixo não os pega.
 */
export function hrefSeguro(bruto) {
  if (typeof bruto !== 'string') return null;
  const url = bruto.trim();
  if (!url) return null;
  const semRuido = url.replace(RUIDO_DE_ESQUEMA, '');
  const dois = semRuido.indexOf(':');
  const caminho = semRuido.search(/[/?#]/);
  if (dois > 0 && (caminho === -1 || dois < caminho)) {
    const esquema = semRuido.slice(0, dois).toLowerCase();
    if (!/^[a-z][a-z0-9+.-]*$/.test(esquema)) return null;
    return ESQUEMAS_OK.has(esquema) ? url : null;
  }
  // relativo: só o que é inequivocamente do próprio site
  return /^[/#?]/.test(url) ? url : null;
}

// ---------------------------------------------------------------------------
// inline
// ---------------------------------------------------------------------------

const RE_CODIGO = /^`([^`\n]+)`/;
const RE_MARCADOR = /^\[S(\d{1,3})\]/;
const RE_LINK = /^\[((?:[^\]\\\n]|\\.)*)\]\(\s*((?:[^()\s]|\([^()]*\))*)\s*\)/;
const RE_FORTE = /^\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*/;
const RE_ENFASE_ASTERISCO = /^\*(?!\s)([^*\n]+?)(?<!\s)\*/;
const RE_ENFASE_SUBLINHADO = /^_(?!\s)([^_\n]+?)(?<!\s)_/;
const RE_URL = /^https?:\/\/[^\s<>[\]{}"']+/i;

/** Pontuação que costuma encostar numa URL solta e não faz parte dela. */
function aparaUrl(url) {
  let fim = url.length;
  while (fim > 0) {
    const c = url[fim - 1];
    if ('.,;:!?»”’'.includes(c)) { fim -= 1; continue; }
    const trecho = url.slice(0, fim);
    if (c === ')'
      && (trecho.match(/\(/g) ?? []).length < (trecho.match(/\)/g) ?? []).length) {
      fim -= 1; continue;
    }
    break;
  }
  return url.slice(0, fim);
}

const ehPalavra = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** Texto inline → nós. `\n` vira nó de quebra macia (o parágrafo é um só). */
export function analisaInline(texto) {
  const nos = [];
  let acumulado = '';
  const descarrega = () => {
    if (acumulado) { nos.push({ t: 'texto', valor: acumulado }); acumulado = ''; }
  };

  let i = 0;
  while (i < texto.length) {
    const resto = texto.slice(i);
    const c = texto[i];

    if (c === '\\' && i + 1 < texto.length) {   // escape: \* é asterisco
      acumulado += texto[i + 1]; i += 2; continue;
    }
    if (c === '\n') { descarrega(); nos.push({ t: 'quebra' }); i += 1; continue; }

    if (c === '`') {
      const m = resto.match(RE_CODIGO);
      if (m) { descarrega(); nos.push({ t: 'codigo', valor: m[1] }); i += m[0].length; continue; }
    }
    if (c === '[') {
      const marca = resto.match(RE_MARCADOR);
      if (marca) {
        descarrega(); nos.push({ t: 'marcador', n: Number(marca[1]) });
        i += marca[0].length; continue;
      }
      const link = resto.match(RE_LINK);
      if (link) {
        const href = hrefSeguro(link[2]);
        descarrega();
        // endereço recusado: o RÓTULO continua visível, sem virar link. Sumir
        // com o texto esconderia do leitor que havia ali uma referência.
        if (href) nos.push({ t: 'link', href, filhos: analisaInline(link[1]) });
        else nos.push(...analisaInline(link[1]));
        i += link[0].length; continue;
      }
    }
    if (c === '*') {
      const forte = resto.match(RE_FORTE);
      if (forte) {
        descarrega(); nos.push({ t: 'forte', filhos: analisaInline(forte[1]) });
        i += forte[0].length; continue;
      }
      const enfase = resto.match(RE_ENFASE_ASTERISCO);
      if (enfase) {
        descarrega(); nos.push({ t: 'enfase', filhos: analisaInline(enfase[1]) });
        i += enfase[0].length; continue;
      }
    }
    if (c === '_' && !ehPalavra(texto[i - 1])) {
      // `_` no meio de palavra é nome_de_variavel, não ênfase
      const enfase = resto.match(RE_ENFASE_SUBLINHADO);
      if (enfase && !ehPalavra(texto[i + enfase[0].length])) {
        descarrega(); nos.push({ t: 'enfase', filhos: analisaInline(enfase[1]) });
        i += enfase[0].length; continue;
      }
    }
    if ((c === 'h' || c === 'H') && !ehPalavra(texto[i - 1])) {
      const m = resto.match(RE_URL);
      if (m) {
        const url = aparaUrl(m[0]);
        const href = hrefSeguro(url);
        if (href) {
          descarrega();
          nos.push({ t: 'link', href, filhos: [{ t: 'texto', valor: url }] });
          i += url.length; continue;
        }
      }
    }
    acumulado += c; i += 1;
  }
  descarrega();
  return nos;
}

// ---------------------------------------------------------------------------
// blocos
// ---------------------------------------------------------------------------

const RE_TITULO = /^\s{0,3}(#{1,6})\s+(.*)$/;
const RE_SEPARADOR = /^\s{0,3}(?:-\s*-\s*-[-\s]*|\*\s*\*\s*\*[*\s]*|_\s*_\s*_[_\s]*)$/;
const RE_CITACAO = /^\s{0,3}>\s?(.*)$/;
const RE_ITEM_BULLET = /^(\s*)([-*+])\s+(.*)$/;
const RE_ITEM_NUMERO = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;

const recuo = (linha) => linha.match(/^\s*/)[0].length;

function casaItem(linha) {
  if (RE_SEPARADOR.test(linha)) return null;   // `---` é separador, não bullet
  const b = linha.match(RE_ITEM_BULLET);
  if (b) return { recuo: b[1].length, ordenada: false, texto: b[3] };
  const n = linha.match(RE_ITEM_NUMERO);
  if (n) return { recuo: n[1].length, ordenada: true, numero: Number(n[2]), texto: n[3] };
  return null;
}

const ehVazia = (linha) => !linha.trim();
const ehInicioDeBloco = (linha) =>
  ehVazia(linha) || RE_TITULO.test(linha) || RE_SEPARADOR.test(linha)
  || RE_CITACAO.test(linha) || casaItem(linha) !== null;

/** Tira o recuo comum de um grupo de linhas. */
function desrecua(linhas) {
  const comConteudo = linhas.filter((l) => l.trim());
  if (!comConteudo.length) return linhas;
  const minimo = Math.min(...comConteudo.map(recuo));
  return linhas.map((l) => (l.trim() ? l.slice(minimo) : l));
}

/**
 * Um bloco de lista → um ou mais nós de lista.
 *
 * Devolve mais de um quando o tipo muda no mesmo nível (bullets seguidos de
 * numerada): um `<ul>` que virasse `<ol>` no meio perderia a numeração que o
 * autor escreveu.
 */
function analisaLista(linhas) {
  const base = recuo(linhas[0]);
  const grupos = [];
  let atual = null;
  for (const linha of linhas) {
    const item = casaItem(linha);
    if (item && item.recuo <= base) {
      if (!atual || atual.ordenada !== item.ordenada) {
        atual = { ordenada: item.ordenada, inicio: item.numero ?? 1, itens: [] };
        grupos.push(atual);
      }
      atual.itens.push({ texto: item.texto, sub: [] });
    } else if (atual) {
      atual.itens.at(-1).sub.push(linha);
    }
  }
  return grupos.map((g) => {
    const itens = g.itens.map(({ texto, sub }) => {
      const filhos = analisaInline(texto);
      if (sub.length) {
        const blocos = analisaBlocos(desrecua(sub));
        // continuação de texto do próprio item: entra como quebra macia, não
        // como parágrafo novo — no formato "Candidatos" o bullet é uma frase só
        if (blocos[0]?.t === 'p') {
          filhos.push({ t: 'quebra' }, ...blocos.shift().filhos);
        }
        filhos.push(...blocos);
      }
      return { filhos };
    });
    return g.ordenada ? { t: 'ol', inicio: g.inicio, itens } : { t: 'ul', itens };
  });
}

function analisaBlocos(linhas) {
  const nos = [];
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i];

    if (ehVazia(linha)) { i += 1; continue; }

    if (RE_SEPARADOR.test(linha)) { nos.push({ t: 'hr' }); i += 1; continue; }

    const titulo = linha.match(RE_TITULO);
    if (titulo) {
      nos.push({ t: 'h', nivel: titulo[1].length, filhos: analisaInline(titulo[2].trim()) });
      i += 1; continue;
    }

    if (RE_CITACAO.test(linha)) {
      const dentro = [];
      while (i < linhas.length && RE_CITACAO.test(linhas[i])) {
        dentro.push(linhas[i].match(RE_CITACAO)[1]);
        i += 1;
      }
      nos.push({ t: 'citacao', filhos: analisaBlocos(dentro) });
      continue;
    }

    if (casaItem(linha)) {
      const bloco = [linha];
      i += 1;
      while (i < linhas.length && !ehVazia(linhas[i])
        && (casaItem(linhas[i]) || recuo(linhas[i]) > recuo(linha))) {
        bloco.push(linhas[i]); i += 1;
      }
      nos.push(...analisaLista(bloco));
      continue;
    }

    const paragrafo = [linha];
    i += 1;
    while (i < linhas.length && !ehInicioDeBloco(linhas[i])) {
      paragrafo.push(linhas[i]); i += 1;
    }
    nos.push({ t: 'p', filhos: analisaInline(paragrafo.map((l) => l.trim()).join('\n')) });
  }
  return nos;
}

/** Markdown → árvore de nós. Nunca devolve marcação. */
export function analisaMarkdown(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return [];
  return analisaBlocos(texto.replace(/\r\n?/g, '\n').split('\n'));
}

// ---------------------------------------------------------------------------
// materialização
// ---------------------------------------------------------------------------

const ancoraPadrao = (n) => `#fonte-${n}`;

/**
 * Árvore de nós → fragmento de DOM.
 *
 * Só `createElement`, `createTextNode`, `setAttribute` e `appendChild`. Não
 * há string de HTML em lugar nenhum desta função — é o que torna impossível
 * um caractere do texto virar estrutura.
 */
export function criaElementos(nos, doc = globalThis.document, opcoes = {}) {
  const { ancora = ancoraPadrao, nivelBase = 0 } = opcoes;
  const frag = doc.createDocumentFragment();
  for (const no of nos) frag.appendChild(criaNo(no, doc, ancora, nivelBase));
  return frag;
}

function criaFilhos(pai, filhos, doc, ancora, nivelBase) {
  for (const f of filhos ?? []) pai.appendChild(criaNo(f, doc, ancora, nivelBase));
  return pai;
}

function criaNo(no, doc, ancora, nivelBase) {
  switch (no.t) {
    case 'texto': return doc.createTextNode(no.valor);
    case 'quebra': return doc.createElement('br');
    case 'codigo': {
      const el = doc.createElement('code');
      el.textContent = no.valor;
      return el;
    }
    case 'forte': return criaFilhos(doc.createElement('strong'), no.filhos, doc, ancora, nivelBase);
    case 'enfase': return criaFilhos(doc.createElement('em'), no.filhos, doc, ancora, nivelBase);
    case 'link': {
      const a = doc.createElement('a');
      a.setAttribute('href', no.href);
      // externo abre fora e não vaza referrer nem PageRank; interno não
      if (/^https?:/i.test(no.href)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer nofollow');
      }
      return criaFilhos(a, no.filhos, doc, ancora, nivelBase);
    }
    case 'marcador': {
      const sup = doc.createElement('sup');
      const a = doc.createElement('a');
      a.setAttribute('href', ancora(no.n));
      a.setAttribute('class', 'marcador-fonte');
      a.textContent = `[S${no.n}]`;
      sup.appendChild(a);
      return sup;
    }
    case 'h': {
      const nivel = Math.min(6, Math.max(1, no.nivel + nivelBase));
      return criaFilhos(doc.createElement(`h${nivel}`), no.filhos, doc, ancora, nivelBase);
    }
    case 'p': return criaFilhos(doc.createElement('p'), no.filhos, doc, ancora, nivelBase);
    case 'hr': return doc.createElement('hr');
    case 'citacao':
      return criaFilhos(doc.createElement('blockquote'), no.filhos, doc, ancora, nivelBase);
    case 'ul': case 'ol': {
      const lista = doc.createElement(no.t);
      if (no.t === 'ol' && no.inicio && no.inicio !== 1) {
        lista.setAttribute('start', no.inicio);
      }
      for (const item of no.itens) {
        lista.appendChild(criaFilhos(doc.createElement('li'), item.filhos, doc, ancora, nivelBase));
      }
      return lista;
    }
    default: return doc.createTextNode('');
  }
}

// ---------------------------------------------------------------------------
// texto simples — a base do que se copia e do que vai para o WhatsApp
// ---------------------------------------------------------------------------

function inlineSimples(filhos) {
  return (filhos ?? []).map((f) => {
    switch (f.t) {
      case 'texto': return f.valor;
      case 'quebra': return '\n';
      case 'codigo': return f.valor;
      case 'marcador': return `[S${f.n}]`;
      case 'link': {
        const rotulo = inlineSimples(f.filhos).trim();
        return !rotulo || rotulo === f.href ? f.href : `${rotulo} (${f.href})`;
      }
      default: return inlineSimples(f.filhos);
    }
  }).join('');
}

const EH_BLOCO_INTERNO = (t) => ['ul', 'ol', 'p', 'citacao', 'h', 'hr'].includes(t);

function itemSimples(item) {
  const inline = item.filhos.filter((f) => !EH_BLOCO_INTERNO(f.t));
  const dentro = item.filhos.filter((f) => EH_BLOCO_INTERNO(f.t))
    .map(blocoSimples).filter(Boolean)
    .map((t) => t.split('\n').map((l) => `  ${l}`).join('\n')).join('\n');
  return [inlineSimples(inline), dentro].filter(Boolean).join('\n');
}

function blocoSimples(no) {
  switch (no.t) {
    case 'h': case 'p': return inlineSimples(no.filhos);
    case 'hr': return '---';
    case 'citacao': return no.filhos.map(blocoSimples).filter(Boolean).join('\n\n');
    case 'ul': return no.itens.map((i) => `• ${itemSimples(i)}`).join('\n');
    case 'ol':
      return no.itens.map((i, k) => `${(no.inicio ?? 1) + k}. ${itemSimples(i)}`).join('\n');
    default: return '';
  }
}

/** Árvore de nós → texto legível, sem marcação. */
export function paraTextoSimples(nos) {
  return nos.map(blocoSimples).filter((t) => t !== '').join('\n\n').trim();
}
