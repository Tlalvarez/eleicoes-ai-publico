/**
 * Fecha os caminhos malformados sob `/resposta/`.
 *
 * Sem este catch-all, `/resposta/` e `/resposta/<id>/qualquer-coisa` caem no
 * fallback estático do Pages e podem devolver a home com 200. A mesma página
 * uniforme de 404 da rota principal é usada aqui, sem tocar no backend.
 */
import { trata } from './[id].js';

export async function onRequestGet(contexto) {
  return trata({
    url: contexto?.request?.url,
    id: null,
    env: contexto?.env ?? {},
    // `id: null` encerra antes da rede; a injeção deixa isso verificável.
    buscar: contexto?.buscar ?? globalThis.fetch,
  });
}
