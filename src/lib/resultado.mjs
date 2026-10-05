/**
 * O resultado oficial da eleição (TSE), aplicado à comparação.
 *
 * `data/resultado/turno-<n>.json` é VERSIONADO e sai de scripts/baixa-resultado-tse.mjs,
 * que lê os arquivos públicos de resultado do TSE. O build não acessa a rede.
 *
 * Duas regras, decididas pelo Thiago em 05/10/2026, com o primeiro turno apurado:
 *   · onde há segundo turno (presidente e os estados sem governador eleito), a comparação
 *     mostra só os dois candidatos que o disputam — as propostas que só os outros faziam
 *     saem junto, e o layout é o mesmo do seletor `?c=` com esses dois;
 *   · onde o governador foi eleito no primeiro turno, a comparação segue com todos, e o
 *     eleito leva a marca "eleito" (ou "eleita") junto ao nome.
 *
 * O cruzamento é pelo NÚMERO de urna, que é único numa disputa. Quem o TSE diz que foi
 * eleito ou foi ao segundo turno e não está na comparação é ERRO de build: mostrar a
 * disputa sem um dos dois, ou o estado sem o eleito marcado, seria pior que não publicar.
 *
 * Por escopo vale o turno MAIS RECENTE que o traz: o arquivo do segundo turno só terá as
 * disputas que foram a ele, e o estado decidido no primeiro continua lendo o turno 1.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CONTRATO_RESULTADO = 'resultado-tse/1';

/** A situação do candidato no arquivo do TSE (`st`), no vocabulário do site. */
const SITUACOES = Object.freeze({
  'Eleito': 'eleito',
  '2º turno': 'segundo_turno',
  'Não eleito': 'nao_eleito',
  '': null,                      // apuração em andamento: o TSE ainda não decidiu
});

export function normalizaSituacao(st) {
  const s = String(st ?? '').trim();
  if (!(s in SITUACOES)) throw new Error(`situação do TSE desconhecida: '${st}'`);
  return SITUACOES[s];
}

/** Os turnos gravados em `pasta`, do primeiro ao último. */
export function turnos(pasta) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((n) => /^turno-\d+\.json$/.test(n))
    .map((n) => {
      const d = JSON.parse(readFileSync(join(pasta, n), 'utf8'));
      if (d.contrato !== CONTRATO_RESULTADO) throw new Error(`${n}: contrato '${d.contrato}', esperado '${CONTRATO_RESULTADO}'`);
      return d;
    })
    .sort((a, b) => a.turno - b.turno);
}

/** O resultado de presidente, ou de governador numa UF, no turno mais recente que o traz; null se não há. */
export function resultadoDoEscopo(lista, cargo, uf = null) {
  for (const t of lista.slice().reverse()) {
    const e = cargo === 'presidente' ? t.presidente : t[cargo]?.[String(uf ?? '').toLowerCase()];
    if (e) return { ...e, turno: t.turno, pagina_publica: t.pagina_publica };
  }
  return null;
}

/**
 * Quem segue e quem foi eleito, em slugs da comparação. No primeiro turno, segue na disputa
 * quem foi ao segundo; no segundo turno, os dois que o disputaram. Sem ninguém seguindo (o
 * eleito saiu no primeiro turno), `naDisputa` é null: a comparação fica inteira.
 */
export function situacaoDoEscopo(escopo, candidatos, rotulo = 'escopo') {
  const porNumero = new Map(candidatos.map((c) => [String(c.numero), c]));
  const naComparacao = (c) => {
    const s = porNumero.get(String(c.numero));
    if (!s) throw new Error(`${rotulo}: ${c.nome_urna} (nº ${c.numero}) está como '${c.situacao_tse}' no TSE e não está na comparação`);
    return s.slug;
  };
  const seguem = escopo.turno > 1 ? escopo.candidatos : escopo.candidatos.filter((c) => c.situacao === 'segundo_turno');
  const eleitos = escopo.candidatos.filter((c) => c.situacao === 'eleito');
  for (const c of eleitos) {
    if (!['feminino', 'masculino'].includes(c.genero)) {
      throw new Error(`${rotulo}: ${c.nome_urna} eleito sem gênero no arquivo do TSE — a marca não sabe se diz "eleito" ou "eleita"`);
    }
  }
  return {
    naDisputa: seguem.length ? seguem.map(naComparacao) : null,
    eleitos: eleitos.map((c) => ({ slug: naComparacao(c), rotulo: c.genero === 'feminino' ? 'eleita' : 'eleito' })),
  };
}

/**
 * Uma página de comparação depois do resultado: candidatos de fora da disputa saem com as
 * posições, os trechos e as propostas que só eles faziam; o eleito ganha `eleito` e
 * `rotulo_eleito`. A página leva `resultado`, para o texto dizer por que a tela mudou.
 */
export function aplicaResultado(dados, escopo) {
  if (!escopo) return dados;
  const rotulo = dados.uf ? `${dados.cargo}/${String(dados.uf).toLowerCase()}` : dados.cargo;
  const { naDisputa, eleitos } = situacaoDoEscopo(escopo, dados.candidatos, rotulo);
  const fica = (s) => !naDisputa || naDisputa.includes(s);
  const marca = new Map(eleitos.map((e) => [e.slug, e.rotulo]));
  const candidatos = dados.candidatos.filter((c) => fica(c.slug))
    .map((c) => (marca.has(c.slug) ? { ...c, eleito: true, rotulo_eleito: marca.get(c.slug) } : c));
  const propostas = dados.propostas
    .map((p) => {
      const posicoes = Object.fromEntries(Object.entries(p.posicoes).filter(([s]) => fica(s)));
      const n = Object.values(posicoes).filter((v) => v.posicao === 'concorda').length;
      return { ...p, n_concorda: n, posicoes };
    })
    // a mesma regra do layout (C4, 18/09): fica a proposta em que alguém da tela se posiciona
    .filter((p) => Object.keys(p.posicoes).length > 0);
  const blocos = Object.fromEntries(Object.entries(dados.blocos).filter(([s]) => fica(s)));
  const resultado = {
    turno: escopo.turno,
    segundo_turno: Boolean(naDisputa) && escopo.turno === 1,
    eleitos: eleitos.map((e) => e.slug),
    divulgado_em: escopo.divulgado_em,
    fonte: escopo.fonte,
    pagina_publica: escopo.pagina_publica,
  };
  return { ...dados, candidatos, propostas, blocos, resultado };
}

/**
 * A busca de um escopo (documentos.json e os dois .bin, uma linha de `dims` bytes por
 * documento, na ordem dos documentos) só com os candidatos que ficam. Devolve os
 * documentos e os vetores recortados na mesma ordem — sem isso, buscar "Caiado" na página
 * do segundo turno traria cartões que a tela não mostra.
 */
export function recortaBusca(documentos, vp, vb, dims, ficam) {
  const fica = (s) => ficam.includes(s);
  const linhas = (buf, idx) => Buffer.concat(idx.map((i) => Buffer.from(buf.subarray(i * dims, (i + 1) * dims))));
  const ip = [];
  const propostas = [];
  documentos.propostas.forEach((p, i) => {
    const candidatos = p.candidatos.filter(fica);
    const contra = (p.contra ?? []).filter(fica);
    if (!candidatos.length && !contra.length) return;
    ip.push(i);
    propostas.push({ ...p, candidatos, contra });
  });
  const ids = new Set(propostas.map((p) => p.id));
  const ib = [];
  const blocos = [];
  documentos.blocos.forEach((b, i) => {
    if (!fica(b.slug)) return;
    ib.push(i);
    blocos.push({ ...b, propostas: (b.propostas ?? []).filter((id) => ids.has(id)) });
  });
  const paginasComProposta = new Set(propostas.map((p) => p.pagina));
  return {
    documentos: {
      ...documentos,
      candidatos: documentos.candidatos.filter((c) => fica(c.slug)),
      paginas: documentos.paginas.filter((p) => paginasComProposta.has(p.id)),
      propostas,
      blocos,
    },
    vp: linhas(vp, ip),
    vb: linhas(vb, ib),
  };
}

/** "A", "A e B", "A, B e C". */
export function emLista(nomes) {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
