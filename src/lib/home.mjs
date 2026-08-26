/**
 * Os candidatos e os chips da home, derivados de data/itens/resumo.json.
 *
 * Chips são as perguntas de exemplo sob a busca. Eram escritos à mão e
 * citavam 5 dos candidatos, cada um com um tema próprio ("O que o Lula propõe
 * para a educação?", "O que o Zema diz sobre impostos?"). Duas quebras da
 * régua do site, logo na primeira página:
 *
 *  - cobertura assimétrica — quem não estivesse na lista parecia não ser
 *    acompanhado, e a lista não crescia com o resumo;
 *  - formulação desigual — o tema colado a um nome sugere uma associação
 *    editorial que o dado coletado não sustenta ("Lula ↔ educação").
 *
 * A saída aqui é um chip por candidato do resumo, todos no mesmo molde: só o
 * nome muda. Candidato novo no resumo entra sozinho.
 */

/**
 * O molde único. Sem artigo antes do nome — "o Lula" / "a Ana" obrigaria a
 * inferir gênero de um nome, coisa que o resumo não informa; sem verbo de
 * juízo ("defende", "ataca"), só o que o material coletado permite responder.
 */
export const perguntaChip = (nome) => `O que ${nome} propõe?`;

/**
 * Os candidatos do resumo em ordem alfabética por nome público — ordem estável
 * e sem hierarquia. Ordenar por volume de itens coletados faria a home ranquear
 * candidato por quanto o harness capturou, que não é medida de nada.
 */
export function candidatosDaHome(resumo) {
  return Object.entries(resumo.candidatos)
    .map(([slug, c]) => ({ slug, nome: c.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Um chip por candidato, na mesma ordem dos cards.
 *
 * O `href` aponta para a PRÓPRIA home (`/?q=…`), que agora é o chat: a busca
 * deixou de ser uma segunda página. Manter o link é o que faz o chip
 * funcionar sem JavaScript — a home lê `?q=` ao carregar — e é o que preserva
 * "compartilhar uma pergunta" como endereço estável.
 */
export function chipsDaHome(resumo) {
  return candidatosDaHome(resumo).map(({ slug, nome }) => {
    const pergunta = perguntaChip(nome);
    return { slug, nome, pergunta, href: `/?q=${encodeURIComponent(pergunta)}` };
  });
}

/**
 * Onde o texto da home cita UM candidato pelo nome — o que quebra a cobertura
 * simétrica logo na primeira página.
 *
 * A regra procura o nome inteiro e cada pedaço dele com 4+ letras, **com a
 * caixa do nome próprio**. A versão sem caixa acusava a frase "acompanhamos o
 * que cada candidato fala todos os dias" como citação de "Hertz **Dias**": em
 * português vários sobrenomes são substantivos comuns (Dias, Costa, Barão,
 * Santos), e um gate que acusa o que não é problema é um gate que alguém
 * desliga na primeira vez que ele atrapalha.
 *
 * Exigir a capitalização recupera a distinção que a própria língua já faz — a
 * prosa escreve "dias", o sobrenome é "Dias". O preço é uma citação no início
 * de frase escapar; o ganho é o gate continuar sendo levado a sério.
 *
 * Devolve [{nome, trecho}], no máximo uma entrada por candidato.
 */
export function citacoesDeCandidato(texto, nomes) {
  const achados = [];
  for (const nome of nomes) {
    const partes = [nome, ...nome.split(/\s+/)]
      .filter((parte) => parte.length >= 4);
    for (const parte of partes) {
      const escapado = parte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?<![\\p{L}])${escapado}(?![\\p{L}])`, 'u').test(texto)) {
        achados.push({ nome, trecho: parte });
        break;
      }
    }
  }
  return achados;
}
