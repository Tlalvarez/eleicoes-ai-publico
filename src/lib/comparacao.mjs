/**
 * O layout da comparação: uma coluna por candidato, cada proposta escrita
 * UMA vez, esticada da primeira à última coluna de quem se posiciona.
 *
 * Esta função roda em dois lugares com o mesmo resultado: no build (o Astro
 * desenha a página com todos os candidatos) e no navegador (quando a pessoa
 * tira ou põe um candidato na comparação, o layout é recalculado e os cartões
 * já desenhados são reposicionados). Um algoritmo só, testado em Node
 * (test/comparacao.test.mjs), para as duas telas nunca discordarem.
 *
 * Nenhuma cor por candidato, nenhum placar: as seções são pelo NÚMERO de
 * candidatos que propõem a mesma coisa, e a ordem das colunas é alfabética.
 */

/** Rótulos das seções por quantidade de candidatos que propõem. */
export const ROTULOS = Object.freeze({
  1: 'Só um candidato propõe',
  2: 'Dois candidatos propõem',
  3: 'Três candidatos propõem',
  4: 'Quatro candidatos propõem',
  5: 'Cinco candidatos propõem',
});

export function rotuloDaSecao(n) {
  return ROTULOS[n] ?? `${n} candidatos propõem`;
}

/** Quem concorda com a proposta, na ordem das colunas visíveis. */
export function quem(p, ordem) {
  return ordem.filter((s) => p.posicoes[s]?.posicao === 'concorda');
}

/** Quem propõe o contrário, na ordem das colunas visíveis. */
export function contra(p, ordem) {
  return ordem.filter((s) => p.posicoes[s]?.posicao === 'discorda');
}

/**
 * A seleção de candidatos a partir do parâmetro `c` da URL
 * (`?c=lula,romeu-zema`). Slug desconhecido é ignorado; seleção vazia ou
 * completa é "todos" e volta `null`, para a URL ficar limpa.
 */
export function selecaoDaUrl(param, ordem) {
  if (!param) return null;
  const pedidos = String(param).split(',').map((s) => s.trim()).filter(Boolean);
  const sel = ordem.filter((s) => pedidos.includes(s));
  if (!sel.length || sel.length === ordem.length) return null;
  return sel;
}

/** O parâmetro `c` para uma seleção; `null` quando é "todos". */
export function urlDaSelecao(sel, ordem) {
  if (!sel || sel.length === ordem.length) return null;
  return sel.join(',');
}

/**
 * Um cartão: onde começa (`ini`, índice da coluna), quantas colunas ocupa
 * (`largura`), o que cada coluna é (`colunas`: 'concorda' | 'contra') e em
 * que colunas relativas o TEXTO fica (`a`..`b`: sobre quem propõe; num
 * cartão só de quem discorda, sobre ele, abaixo do rótulo). `chave`
 * distingue os cartões de uma mesma proposta quando ela vira mais de um.
 */
function cartao(p, ordem, idx, ini, largura) {
  const q = quem(p, ordem);
  const c = contra(p, ordem);
  const colunas = ordem.slice(ini, ini + largura)
    .map((s) => (q.includes(s) ? 'concorda' : c.includes(s) ? 'contra' : 'fora'));
  const qi = q.map((s) => idx[s]).filter((i) => i >= ini && i < ini + largura);
  const a = qi.length ? Math.min(...qi) - ini : 0;
  const b = qi.length ? Math.max(...qi) - ini : largura - 1;
  return {
    id: p.id, chave: `${p.id}@${ini}`, ini, largura, colunas, a, b,
    comContra: colunas.includes('contra'), nConcorda: q.length,
  };
}

/**
 * Os cartões de uma proposta: um por trecho CONTÍGUO de colunas que se
 * posicionam. Candidatos não adjacentes não são ligados por uma faixa que
 * atravessa quem não fala do assunto — o texto se repete, um cartão em cada
 * lado (decisão do Thiago em 13/09).
 */
function cartoes(p, ordem, idx) {
  const posicionado = ordem.map((s) => Boolean(p.posicoes[s]) && p.posicoes[s].posicao !== 'nao_cita');
  const saida = [];
  let ini = null;
  for (let i = 0; i <= ordem.length; i += 1) {
    if (i < ordem.length && posicionado[i]) { if (ini === null) ini = i; continue; }
    if (ini !== null) { saida.push({ tipo: 'cartao', ...cartao(p, ordem, idx, ini, i - ini) }); ini = null; }
  }
  return saida;
}

/**
 * Ordem de leitura: MAIS candidatos primeiro (o que todos propõem abre a
 * página; o que só um propõe fecha — decisão do Thiago em 13/09: começar por
 * onde se parecem e separá-los depois); dentro do mesmo número, pelo SUBTEMA
 * (propostas sobre o mesmo assunto ficam vizinhas, sob um cabeçalho — pedido
 * dele em 13/09); dentro do subtema, pela combinação de quem propõe.
 */
export function ordena(propostas, ordem) {
  const idx = Object.fromEntries(ordem.map((s, i) => [s, i]));
  return propostas.slice().sort((x, y) => {
    const qx = quem(x, ordem).map((s) => idx[s]);
    const qy = quem(y, ordem).map((s) => idx[s]);
    if (qx.length !== qy.length) return qy.length - qx.length;
    const st = String(x.subtema).localeCompare(String(y.subtema), 'pt-BR');
    if (st !== 0) return st;
    for (let i = 0; i < qx.length; i += 1) {
      if (qx[i] !== qy[i]) return qx[i] - qy[i];
    }
    return 0;
  });
}

/**
 * O layout para as colunas `ordem` (os candidatos SELECIONADOS, na ordem das
 * colunas). Uma proposta só aparece se ao menos um selecionado a faz;
 * quem está fora da seleção não conta nem como faixa nem como contrário.
 *
 * Devolve linhas, na ordem da página (do que todos propõem ao que só um propõe):
 *   { tipo: 'secao', rotulo }                          quantos candidatos propõem
 *   { tipo: 'subtema', rotulo }                        o assunto, fora dos cartões
 *   { tipo: 'cartao', ...cartao }
 *   { tipo: 'pilhas', pilhas: [[cartao...], ...] }     uma pilha por coluna (exclusivas sem
 *                                                      contrário, de UM subtema); pilha vazia =
 *                                                      o candidato não tem proposta no assunto
 */
export const MODOS = Object.freeze(['concordancia', 'assunto']);

export function modoDaUrl(param) {
  return MODOS.includes(param) ? param : 'concordancia';
}

// a página é organizada por ASSUNTO (decisão do Thiago em 13/09: sem
// alternador); o modo por concordância continua disponível para quem chamar
export function layout(propostas, ordem, modo = 'assunto') {
  const idx = Object.fromEntries(ordem.map((s, i) => [s, i]));
  const n = ordem.length;
  const visiveis = ordena(propostas.filter((p) => quem(p, ordem).length > 0), ordem);
  if (modo === 'assunto') return porAssunto(visiveis, ordem, idx, n);
  const linhas = [];
  let secao = 0;
  let subtema = null;
  for (const p of visiveis.filter((p) => quem(p, ordem).length >= 2)) {
    const k = quem(p, ordem).length;
    if (k !== secao) { secao = k; subtema = null; linhas.push({ tipo: 'secao', rotulo: rotuloDaSecao(k) }); }
    if (p.subtema !== subtema) { subtema = p.subtema; linhas.push({ tipo: 'subtema', rotulo: p.subtema }); }
    linhas.push(...cartoes(p, ordem, idx));
  }
  const exclusivas = visiveis.filter((p) => quem(p, ordem).length === 1);
  if (exclusivas.length) {
    // com um candidato só na tela, não há o que rotular
    if (n > 1) linhas.push({ tipo: 'secao', rotulo: rotuloDaSecao(1) });
    for (const st of [...new Set(exclusivas.map((p) => p.subtema))]) {
      const doSubtema = exclusivas.filter((p) => p.subtema === st);
      linhas.push({ tipo: 'subtema', rotulo: st });
      // com contrário, a faixa cobre os dois e vem antes; sem contrário, a proposta fica na pilha da coluna
      for (const p of doSubtema.filter((p) => contra(p, ordem).length)) linhas.push(...cartoes(p, ordem, idx));
      const pilhas = ordem.map((s, i) => doSubtema
        .filter((p) => quem(p, ordem)[0] === s && !contra(p, ordem).length)
        .map((p) => cartao(p, ordem, idx, i, 1)));
      if (pilhas.some((x) => x.length)) linhas.push({ tipo: 'pilhas', pilhas });
    }
  }
  return { n, linhas, total: visiveis.length };
}

/** Quantas propostas cada candidato faz (concorda) e quantas são só dele. */
export function contagens(propostas, ordem) {
  const saida = Object.fromEntries(ordem.map((s) => [s, { propoe: 0, exclusivas: 0, contraria: 0 }]));
  for (const p of propostas) {
    const q = quem(p, ordem);
    for (const s of q) saida[s].propoe += 1;
    if (q.length === 1) saida[q[0]].exclusivas += 1;
    for (const s of contra(p, ordem)) saida[s].contraria += 1;
  }
  return saida;
}

/**
 * O outro modo de ler a página: por ASSUNTO. Cada subtema é uma seção, com
 * tudo o que se propõe sobre ele lado a lado — as faixas de quem concorda
 * (mais candidatos primeiro), depois uma pilha por coluna com o que só um
 * propõe. Mercosul fica com Mercosul, seja de um candidato ou de cinco.
 */
function porAssunto(visiveis, ordem, idx, n) {
  const linhas = [];
  const assuntos = [...new Set(visiveis.map((p) => p.subtema))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  for (const st of assuntos) {
    const doAssunto = visiveis.filter((p) => p.subtema === st);
    linhas.push({ tipo: 'secao', rotulo: st });
    // faixas: quem concorda em mais de um, ou exclusiva com contrário (a faixa cobre os dois)
    // proposta própria derivada (correção de fidelidade, pedido do Thiago em 15/09): vem logo abaixo
    // do cartão de onde saiu, e não na pilha da coluna — por isso o cartão de origem vira faixa
    // mesmo quando ficou com um candidato só
    const idsVisiveis = new Set(doAssunto.map((p) => p.id));
    const temFilhas = new Set(doAssunto.filter((p) => p.derivada_de && idsVisiveis.has(p.derivada_de)).map((p) => p.derivada_de));
    const faixas = doAssunto.filter((p) => !(p.derivada_de && idsVisiveis.has(p.derivada_de))
      && (quem(p, ordem).length >= 2 || contra(p, ordem).length || temFilhas.has(p.id)));
    const idsFaixas = new Set(faixas.map((p) => p.id));
    const derivadas = doAssunto.filter((p) => p.derivada_de && idsFaixas.has(p.derivada_de));
    const idsDerivadas = new Set(derivadas.map((p) => p.id));
    for (const p of faixas) {
      linhas.push(...cartoes(p, ordem, idx));
      for (const d of derivadas.filter((d) => d.derivada_de === p.id)) linhas.push(...cartoes(d, ordem, idx));
    }
    const pilhas = ordem.map((s, i) => doAssunto
      .filter((p) => !idsDerivadas.has(p.id) && !idsFaixas.has(p.id) && quem(p, ordem).length === 1 && quem(p, ordem)[0] === s && !contra(p, ordem).length)
      .map((p) => cartao(p, ordem, idx, i, 1)));
    if (pilhas.some((x) => x.length)) linhas.push({ tipo: 'pilhas', pilhas });
  }
  return { n, linhas, total: visiveis.length };
}
