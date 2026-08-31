/**
 * `/resposta/<id>` no DESENVOLVIMENTO.
 *
 * Em produção essa rota é da Pages Function (`functions/resposta/[id].js`),
 * que serve o app do chat; o `astro dev` não executa Functions, então sem isto
 * o link compartilhado daria 404 na máquina de quem desenvolve. A reescrita
 * entrega a home — o script dela lê o id do caminho. Só o formato exato do id
 * é reescrito; o resto (inclusive `/resposta/` e caminhos mais fundos) segue o
 * fluxo normal, como em produção segue para o 404 uniforme.
 *
 * Em build estático este middleware roda apenas sobre páginas pré-renderizadas
 * (nenhuma vive sob /resposta/), portanto não muda nada do artefato publicado.
 */
export function onRequest(contexto, next) {
  if (/^\/resposta\/[A-Za-z0-9_-]{22}$/.test(contexto.url.pathname)) {
    return next('/');
  }
  return next();
}
