/**
 * O registro público de correções: data/correcoes.json, mostrado em /correcoes
 * e usado pelo selo "contestado pelo candidato" no cartão da proposta.
 *
 * Decisão de 16/09/2026 (revisão jurídica do lançamento, §3.5): todo pedido
 * recebido entra aqui, aceito ou recusado, com o motivo. Recusa sem motivo
 * público é a próxima brecha, então o contrato exige motivo em toda decisão
 * que não seja "em análise".
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ_PROJETO } from './comparacao-dados.mjs';

export const CONTRATO_CORRECOES = 'correcoes/1';
const ARQUIVO = join(RAIZ_PROJETO, 'data', 'correcoes.json');
const DECISOES = new Set(['aceito', 'recusado', 'em análise']);
const ORIGENS = new Set(['campanha', 'leitor']);

let cache = null;

/** O registro inteiro, já conferido contra o contrato. Lista vazia quando não há arquivo. */
export function correcoes(arquivo = ARQUIVO) {
  if (cache && arquivo === ARQUIVO) return cache;
  if (!existsSync(arquivo)) return { contrato: CONTRATO_CORRECOES, pedidos: [] };
  const d = JSON.parse(readFileSync(arquivo, 'utf8'));
  if (d.contrato !== CONTRATO_CORRECOES) throw new Error(`correcoes.json: contrato ${d.contrato}`);
  for (const p of d.pedidos) {
    if (!p.id || !p.recebido_em || !p.escopo || !p.pedido) throw new Error(`correcoes.json: pedido incompleto (${p.id ?? 'sem id'})`);
    if (!ORIGENS.has(p.origem)) throw new Error(`correcoes.json: ${p.id} tem origem "${p.origem}"`);
    if (!DECISOES.has(p.decisao)) throw new Error(`correcoes.json: ${p.id} tem decisão "${p.decisao}"`);
    if (p.decisao !== 'em análise' && !p.motivo) throw new Error(`correcoes.json: ${p.id} decidido sem motivo público`);
  }
  const reg = { ...d, pedidos: [...d.pedidos].sort((a, b) => b.recebido_em.localeCompare(a.recebido_em)) };
  if (arquivo === ARQUIVO) cache = reg;
  return reg;
}

/** Os pedidos de campanha sobre uma proposta — o que acende o selo no cartão. */
export function contestacoesDaProposta(escopo, pagina, propostaId, arquivo = ARQUIVO) {
  return correcoes(arquivo).pedidos.filter(
    (p) => p.origem === 'campanha' && p.escopo === escopo && p.pagina === pagina && p.proposta === propostaId,
  );
}

/** {"<escopo>|<pagina>|<proposta>": [id, ...]} para o layout, que roda também no navegador. */
export function indiceDeContestacoes(arquivo = ARQUIVO) {
  const fora = {};
  for (const p of correcoes(arquivo).pedidos) {
    if (p.origem !== 'campanha' || !p.proposta) continue;
    const chave = `${p.escopo}|${p.pagina}|${p.proposta}`;
    (fora[chave] ??= []).push(p.id);
  }
  return fora;
}
