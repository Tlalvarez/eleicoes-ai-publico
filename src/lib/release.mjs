/**
 * O estado de publicação dos dados que o site mostra.
 *
 * A tese do eleicoes.ai é proveniência: cada afirmação com fonte, data e
 * origem verificável. Um site assim que chame de "Acervo Oficial" uma
 * exportação local, sem release e sem Inspection, mente exatamente onde
 * prometeu não mentir.
 *
 * Por isso "oficial" aqui é PORTÃO, não adjetivo. O padrão é prévia; oficial
 * exige uma declaração completa — geração publicada, `release_id` e
 * `release_status: "oficial"`. Sem qualquer uma das peças, prévia. Não há
 * caminho que produza o rótulo oficial por omissão, por campo de tipo errado
 * ou por valor parecido.
 *
 * Serve às duas pontas: os DADOS do site (manifesto da geração ativa,
 * `data/current.json`) e a RESPOSTA do chat (que traz `release_id` e
 * `release_status` no próprio contrato da API).
 */

export const ROTULO_PREVIA = 'Prévia interna — aguardando release oficial/Inspection';

const eh = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Avalia uma declaração de release.
 *
 * `exigeGeracao` distingue as duas pontas: os dados do site só são oficiais
 * se houver geração publicada; a resposta do chat traz a release do serviço,
 * que não tem geração de site.
 */
function avalia(fonte, { exigeGeracao }) {
  const decl = fonte && typeof fonte === 'object' && !Array.isArray(fonte) ? fonte : {};
  const faltando = [];
  if (exigeGeracao && !eh(decl.geracao)) faltando.push('geracao');
  if (!eh(decl.release_id)) faltando.push('release_id');
  if (decl.release_status !== 'oficial') faltando.push('release_status');

  if (faltando.length === 0) {
    return {
      oficial: true,
      releaseId: decl.release_id,
      releaseStatus: decl.release_status,
      rotulo: `Release oficial ${decl.release_id}`,
      detalhe: eh(decl.geracao)
        ? `geração ${decl.geracao}, release ${decl.release_id}`
        : `release ${decl.release_id}`,
    };
  }
  return {
    oficial: false,
    releaseId: eh(decl.release_id) ? decl.release_id : null,
    releaseStatus: eh(decl.release_status) ? decl.release_status : null,
    rotulo: ROTULO_PREVIA,
    detalhe: `sem declaração de release completa: falta ${faltando.join(', ')}`,
  };
}

/** Estado dos dados publicados pelo site (manifesto da geração ativa). */
export function estadoDoSite(manifesto) {
  return avalia(manifesto, { exigeGeracao: true });
}

/** Estado da release que a resposta do chat declara para si mesma. */
export function estadoDaResposta(resposta) {
  return avalia(resposta, { exigeGeracao: false });
}
