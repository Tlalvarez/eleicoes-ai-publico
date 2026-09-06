/**
 * A conversa guardada no navegador — para a resposta não sumir quando a pessoa
 * sai da página e volta.
 *
 * O defeito que este módulo corrige: perguntar em Presidente, ler a resposta,
 * clicar em Governador e voltar a Presidente devolvia a home vazia. A resposta
 * só reaparecia pelo botão "voltar" do navegador, porque a barra de endereço
 * tinha virado `/resposta/<id>`. Para quem pergunta, a resposta é dela: tem
 * de estar lá sempre que ela voltar à página onde perguntou.
 *
 * O que se guarda é, POR PÁGINA DE CONVERSA ('/', '/governador/mg', ...), a
 * lista de turnos já respondidos — a pergunta enviada e o resultado normalizado
 * que a interface desenhou — e o id que o serviço usa para continuar a conversa.
 * Vive em `localStorage`: a conversa sobrevive a fechar a aba e volta no dia
 * seguinte (decisão do Thiago em 06/09/2026 — quem passou vinte minutos
 * perguntando não pode recomeçar do zero). Em troca, a pessoa tem de poder
 * APAGAR: cada pergunta some sozinha pelo botão ao lado dela, e "Começar outra
 * conversa" apaga a conversa inteira. Isso fica escrito em /privacidade, porque
 * o navegador é frequentemente compartilhado e pergunta política é dado
 * sensível.
 *
 * O que vem do armazém é tratado como entrada: forma conferida campo a campo,
 * nada além do reconhecido chega à página. Sem DOM aqui — testável em Node com
 * um armazém falso.
 */

export const PREFIXO_CHAVE = 'eleicoes.conversa:';
export const VERSAO = 1;
/** Turnos guardados por página — o suficiente para uma conversa longa, sem
 *  estourar a cota do armazém com respostas de 15 mil caracteres. */
export const MAX_TURNOS = 20;

const str = (v) => (typeof v === 'string' ? v : '');

/** A chave da conversa de uma página. */
export function chaveDaConversa(pagina) {
  const p = str(pagina).trim() || '/';
  return PREFIXO_CHAVE + p;
}

/**
 * Um turno pronto para guardar: pergunta enviada + resultado desenhado.
 * Devolve `null` se faltar o essencial — turno sem pergunta ou sem texto não
 * é conversa, é lixo.
 */
export function turnoGuardavel(pergunta, resultado) {
  const p = str(pergunta).trim();
  const r = resultado && typeof resultado === 'object' ? resultado : null;
  if (!p || !r || !str(r.texto).trim()) return null;
  return { pergunta: p, resultado: r };
}

/** O pacote que vai ao armazém. */
export function empacota({ turnos, ultimoId = null }) {
  const lista = (Array.isArray(turnos) ? turnos : [])
    .map((t) => turnoGuardavel(t?.pergunta, t?.resultado))
    .filter(Boolean)
    .slice(-MAX_TURNOS);
  return {
    v: VERSAO,
    gravadoEm: new Date().toISOString(),
    ultimoId: str(ultimoId) || null,
    turnos: lista,
  };
}

/**
 * Lê um pacote do armazém. Qualquer coisa fora da forma esperada vira `null`:
 * versão diferente, turno sem pergunta, resultado sem texto, citação sem
 * lista de marcadores.
 */
export function desempacota(bruto) {
  let dados = bruto;
  if (typeof bruto === 'string') {
    try { dados = JSON.parse(bruto); } catch { return null; }
  }
  if (!dados || typeof dados !== 'object' || dados.v !== VERSAO) return null;
  if (!Array.isArray(dados.turnos)) return null;
  const turnos = [];
  for (const t of dados.turnos) {
    const turno = turnoGuardavel(t?.pergunta, t?.resultado);
    if (!turno) return null;
    const cit = turno.resultado.citacoes;
    if (cit !== undefined && (!Array.isArray(cit)
        || cit.some((c) => !c || typeof c !== 'object' || !Array.isArray(c.marcadores)))) {
      return null;
    }
    turnos.push(turno);
  }
  if (!turnos.length) return null;
  return { turnos, ultimoId: str(dados.ultimoId) || null };
}

/** Guarda a conversa da página. `false` se o armazém recusou (cota, modo privado). */
export function guarda(armazem, pagina, dados) {
  try {
    armazem.setItem(chaveDaConversa(pagina), JSON.stringify(empacota(dados)));
    return true;
  } catch {
    return false;
  }
}

/** A conversa guardada da página, ou `null`. */
export function le(armazem, pagina) {
  try {
    return desempacota(armazem.getItem(chaveDaConversa(pagina)));
  } catch {
    return null;
  }
}

/** Esquece a conversa da página. */
/**
 * Apaga UM turno guardado (a pergunta e a resposta dela), pelo índice.
 * Devolve a conversa que ficou, ou `null` quando não sobrou nada — aí quem
 * chama apaga a chave inteira em vez de guardar uma conversa vazia.
 */
export function apagaTurno(conversa, indice) {
  const turnos = Array.isArray(conversa?.turnos) ? conversa.turnos : [];
  if (!Number.isInteger(indice) || indice < 0 || indice >= turnos.length) return conversa ?? null;
  const restantes = turnos.filter((_, i) => i !== indice);
  if (!restantes.length) return null;
  // o id de continuação é o da última resposta que sobrou: continuar a conversa
  // a partir de um turno apagado pediria ao serviço um contexto que não existe
  const ultimo = restantes[restantes.length - 1];
  return { turnos: restantes, ultimoId: ultimo?.resultado?.id ?? null };
}

export function apaga(armazem, pagina) {
  try { armazem.removeItem(chaveDaConversa(pagina)); } catch { /* sem armazém: nada a apagar */ }
}

/**
 * A conversa guardada CONTÉM a resposta pública `id`? Quando a barra de
 * endereço está em `/resposta/<id>` e a conversa guardada tem esse turno, a
 * cópia local é a mesma resposta — e ainda traz os turnos seguintes.
 */
export function contemResposta(conversa, id) {
  if (!conversa || !id) return false;
  return conversa.turnos.some((t) => t.resultado?.compartilhamento_id === id);
}
