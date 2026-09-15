/**
 * O critério de quem entra na comparação, por escopo, exportado pelo harness
 * (v3/exporta_criterio.py) para data/comparacao/criterio.json.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ_PROJETO } from './comparacao-dados.mjs';

export const CONTRATO_CRITERIO = 'criterio-da-comparacao/1';
const ARQUIVO = join(RAIZ_PROJETO, 'data', 'comparacao', 'criterio.json');

let cache = null;
export function criterios(arquivo = ARQUIVO) {
  if (cache && arquivo === ARQUIVO) return cache;
  if (!existsSync(arquivo)) return null;
  const d = JSON.parse(readFileSync(arquivo, 'utf8'));
  if (d.contrato !== CONTRATO_CRITERIO) throw new Error(`criterio.json: contrato ${d.contrato}`);
  if (arquivo === ARQUIVO) cache = d;
  return d;
}

/** O critério de presidente, ou de governador numa UF; null se não há. */
export function criterioDoEscopo(cargo, uf = null, arquivo = ARQUIVO) {
  const d = criterios(arquivo);
  if (!d) return null;
  if (cargo === 'presidente') return d.presidente ?? null;
  return d[cargo]?.[String(uf ?? '').toLowerCase()] ?? null;
}
