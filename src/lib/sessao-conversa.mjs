/**
 * A sessão de conversa: histórico, requisição em voo e o que fazer quando uma
 * resposta chega TARDE.
 *
 * Este módulo existe por causa de uma corrida real. A página oferece "Começar
 * outra conversa" enquanto uma resposta está pendente; reiniciar limpava a
 * tela mas não abortava o `fetch`. A resposta antiga chegava depois e era
 * anexada à conversa nova — na tela, um texto sem a pergunta que o gerou; no
 * histórico enviado ao serviço no turno seguinte, um `assistant` órfão. Num
 * produto cuja tese é proveniência, resposta sem pergunta é o defeito que não
 * pode existir.
 *
 * A regra é uma só, e está inteira aqui: **toda resposta pertence a uma
 * época**. Reiniciar avança a época e aborta o que estava em voo; qualquer
 * coisa que chegue de uma época vencida devolve `obsoleto` — não é desenhada,
 * não vira erro na tela e não entra no histórico.
 *
 * O mesmo vale entre turnos: um envio novo encerra o anterior e retira do
 * histórico a pergunta que ficou sem resposta. Pergunta pendurada seria
 * reenviada no próximo turno como se tivesse sido feita.
 *
 * `envia` nunca lança e nunca desenha: devolve o que aconteceu
 * (`ok` | `erro` | `cancelado` | `obsoleto` | `vazio`) e quem monta o DOM é a
 * página. Sem DOM aqui, o comportamento concorrente é testável sem navegador.
 */
import { pergunta as perguntaAoAcervo } from './chat.mjs';

/** Foi um aborto nosso (cancelar/reiniciar) e não uma falha do serviço? */
function ehAborto(erro) {
  return erro?.name === 'AbortError' || erro?.cause?.name === 'AbortError';
}

/**
 * Cria a sessão.
 *
 * `perguntar` e `buscar` são injetados: os testes rodam sem rede e sem DOM.
 */
export function criaSessao({
  apiBase = '',
  buscar = (...a) => globalThis.fetch(...a),
  perguntar = perguntaAoAcervo,
  // o escopo da página ({cargo, uf?}): vai em toda pergunta desta sessão
  escopo = null,
} = {}) {
  const historico = [];
  let ultimoId = null;
  let epoca = 0;
  let voo = null;              // {controle, msg} da requisição em andamento
  let ultimaChamada = null;    // o que foi mandado ao serviço, para inspeção

  /**
   * Encerra a requisição em voo e desfaz a pergunta que ela carregava.
   *
   * A pergunta sai do histórico junto: mantê-la faria o próximo turno reenviar
   * ao serviço uma pergunta que nunca foi respondida.
   */
  function encerraVoo(motivo) {
    if (!voo) return;
    // o motivo fica marcado NO voo, não numa variável da sessão: é ele que
    // diz, quando a promessa finalmente resolver, se aquilo foi um cancelamento
    // pedido pelo usuário ou uma conversa que já não existe
    voo.motivo = motivo;
    voo.controle.abort();
    const i = historico.indexOf(voo.msg);
    if (i >= 0) historico.splice(i, 1);
    voo = null;
  }

  return {
    historico,

    /** Há requisição em andamento? (a página usa para o botão Cancelar) */
    get pendente() { return voo !== null; },

    /** O último corpo mandado ao serviço — usado pelos testes e por diagnóstico. */
    get ultimaChamada() { return ultimaChamada; },

    /** Cancela o pedido em voo mantendo a conversa como está. */
    cancela() { encerraVoo('cancelado'); },

    /**
     * Retoma uma conversa a partir de uma resposta GUARDADA pelo serviço
     * (pergunta + texto): entra no histórico como primeiro par de turnos.
     * Só vale em conversa vazia — o conteúdo vem do nosso armazém, não da URL.
     */
    retoma({ pergunta, texto, id = null }) {
      if (historico.length || voo) return false;
      const p = String(pergunta ?? '').trim();
      const t = String(texto ?? '').trim();
      if (!p || !t) return false;
      historico.push({ papel: 'user', texto: p }, { papel: 'assistant', texto: t });
      ultimoId = id ?? null;
      return true;
    },

    /** Conversa nova: aborta o que estava em voo e zera tudo, inclusive a época. */
    reinicia() {
      epoca += 1;
      encerraVoo('obsoleto');
      historico.length = 0;
      ultimoId = null;
      ultimaChamada = null;
    },

    /**
     * Manda a pergunta.
     *
     * `aoPerguntar` é chamado de forma síncrona, antes da rede, para a página
     * poder desenhar o turno da pergunta imediatamente.
     */
    async envia(texto, { aoPerguntar, aoEtapa, aoTexto } = {}) {
      const conteudo = String(texto ?? '').trim();
      if (!conteudo) return { estado: 'vazio' };

      encerraVoo('obsoleto');

      const minhaEpoca = epoca;
      const msg = { papel: 'user', texto: conteudo };
      historico.push(msg);
      aoPerguntar?.(conteudo);

      const controle = new AbortController();
      voo = { controle, msg };
      const meu = voo;

      /**
       * O que fazer com o que acabou de chegar.
       *
       * `null` = ainda vigente, siga. Caso contrário é o estado a devolver:
       * a conversa mudou embaixo desta requisição.
       */
      const desfecho = () => {
        if (meu.motivo === 'cancelado') return 'cancelado';
        if (meu.motivo || minhaEpoca !== epoca || voo !== meu) return 'obsoleto';
        return null;
      };
      /** Tira do histórico a pergunta que não foi respondida. */
      const desfaz = () => {
        const i = historico.indexOf(msg);
        if (i >= 0) historico.splice(i, 1);
      };

      try {
        ultimaChamada = { mensagens: historico.map((m) => ({ ...m })), respostaId: ultimoId };
        // progresso e rascunho só chegam à página enquanto este voo é o
        // vigente: resposta de época vencida não desenha nem um pedaço
        const seVigente = (fn) => fn && ((valor) => { if (!desfecho()) fn(valor); });
        const resultado = await perguntar(historico.slice(), {
          apiBase,
          respostaId: ultimoId,
          escopo,
          buscar: (url, opcoes) => buscar(url, { ...opcoes, signal: controle.signal }),
          aoEtapa: seVigente(aoEtapa),
          aoTexto: seVigente(aoTexto),
        });

        const fim = desfecho();
        if (fim) return { estado: fim };
        historico.push({ papel: 'assistant', texto: resultado.texto });
        ultimoId = resultado.id ?? null;
        // a pergunta viaja COM o resultado. Quem desenha também monta o que
        // sai dali — WhatsApp, Web Share, texto, Markdown —, e todo esse
        // material abre pela pergunta: um texto compartilhado sem ela é o
        // veredito anônimo que este produto existe para não gerar. O serviço
        // não devolve a pergunta, e a normalização fixa a forma sem inventar
        // conteúdo; quem sabe qual pergunta gerou aquele texto é a sessão.
        // Sobrescreve o campo de propósito: vale a pergunta ENVIADA, não uma
        // que o serviço tenha posto no lugar.
        return { estado: 'ok', resultado: { ...resultado, pergunta: conteudo } };
      } catch (erro) {
        const fim = desfecho();
        if (fim) return { estado: fim };
        desfaz();
        if (ehAborto(erro)) return { estado: 'cancelado' };
        return { estado: 'erro', erro, perguntaRecusada: conteudo };
      } finally {
        if (voo === meu) voo = null;
      }
    },
  };
}
