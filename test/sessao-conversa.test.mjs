/**
 * A sessão de conversa: quem manda a pergunta, guarda o histórico e decide o
 * que fazer com uma resposta que chega ATRASADA.
 *
 * O defeito que este arquivo existe para impedir: "Começar outra conversa"
 * ficava disponível enquanto uma resposta estava pendente, e reiniciar não
 * abortava a requisição. A resposta antiga chegava depois, era anexada à
 * conversa já reiniciada e entrava no histórico como um turno `assistant` sem
 * a pergunta correspondente — o próximo envio mandaria ao serviço um
 * histórico que nunca existiu. Num produto de evidência, texto sem a pergunta
 * que o gerou é exatamente o que não pode acontecer.
 *
 * A regra é uma só: toda resposta pertence a uma ÉPOCA. Reiniciar avança a
 * época; resposta de época vencida é descartada em silêncio, não renderizada
 * e não escrita no histórico.
 *
 * Sem DOM: a sessão recebe `perguntar` e devolve o que aconteceu; quem desenha
 * é a página.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ErroConversa } from '../src/lib/chat.mjs';
import { criaSessao } from '../src/lib/sessao-conversa.mjs';

const RESULTADO = {
  id: 'r-1',
  texto: 'Resposta com fonte [S1]',
  citacoes: [{ marcadores: [1], nome: 'X', url: 'https://a.org/1' }],
  rodape: '',
  release_id: null,
  release_status: 'previa',
  viaFallback: false,
};

test('resposta normal entra no histórico com a pergunta que a gerou', async () => {
  const sessao = criaSessao({ apiBase: '', perguntar: async () => RESULTADO });

  const r = await sessao.envia('o que há sobre previdência?');

  assert.equal(r.estado, 'ok');
  assert.equal(r.resultado.texto, RESULTADO.texto);
  assert.deepEqual(sessao.historico.map((m) => m.papel), ['user', 'assistant']);
  assert.equal(sessao.historico[0].texto, 'o que há sobre previdência?');
});

test('pergunta vazia não vira turno', async () => {
  let chamou = false;
  const sessao = criaSessao({ perguntar: async () => { chamou = true; return RESULTADO; } });

  assert.equal((await sessao.envia('   ')).estado, 'vazio');
  assert.equal(chamou, false);
  assert.equal(sessao.historico.length, 0);
});

test('pergunta que falhou não fica no histórico', async () => {
  const sessao = criaSessao({
    perguntar: async () => { throw new ErroConversa('servidor', 'erro 500'); },
  });

  const r = await sessao.envia('pergunta que falha');

  assert.equal(r.estado, 'erro');
  assert.equal(r.erro.codigo, 'servidor');
  assert.deepEqual(sessao.historico, []);
});

// --------------------------------------------------------------------------
// o bloqueador: reiniciar com requisição pendente
// --------------------------------------------------------------------------

test('reiniciar durante a requisição aborta o pedido em voo', async () => {
  let sinalVisto = null;
  const sessao = criaSessao({
    buscar: (url, opcoes) => new Promise((_, nao) => {
      sinalVisto = opcoes.signal;
      opcoes.signal.addEventListener('abort',
        () => nao(Object.assign(new Error('abort'), { name: 'AbortError' })));
    }),
    perguntar: async (mensagens, { buscar }) => {
      try {
        return await buscar('/api/conversa', {});
      } catch (e) {
        throw new ErroConversa('rede', 'sem rede', e);
      }
    },
  });

  const emVoo = sessao.envia('pergunta longa');
  assert.equal(sessao.pendente, true);
  assert.equal(sinalVisto.aborted, false);

  sessao.reinicia();

  assert.equal(sinalVisto.aborted, true, 'reinicia() não abortou a requisição pendente');
  assert.equal(sessao.pendente, false);
  await emVoo;
});

test('resposta que chega depois do reinício não entra na conversa nova', async () => {
  let resolve;
  const sessao = criaSessao({ perguntar: () => new Promise((ok) => { resolve = ok; }) });

  const emVoo = sessao.envia('pergunta da conversa antiga');
  sessao.reinicia();
  resolve(RESULTADO);                       // a resposta antiga chega mesmo assim
  const r = await emVoo;

  assert.equal(r.estado, 'obsoleto',
    'a resposta da conversa anterior foi tratada como resposta válida');
  assert.equal(r.resultado, undefined);
  assert.deepEqual(sessao.historico, [],
    'a resposta antiga escreveu no histórico da conversa nova');
});

test('erro que chega depois do reinício não vira mensagem de erro na tela', async () => {
  let rejeita;
  const sessao = criaSessao({ perguntar: () => new Promise((_, nao) => { rejeita = nao; }) });

  const emVoo = sessao.envia('pergunta da conversa antiga');
  sessao.reinicia();
  rejeita(new ErroConversa('servidor', 'erro 500'));

  assert.equal((await emVoo).estado, 'obsoleto');
  assert.deepEqual(sessao.historico, []);
});

test('reinício NÃO descarta a resposta de uma pergunta feita depois dele', async () => {
  let resolve;
  const sessao = criaSessao({ perguntar: () => new Promise((ok) => { resolve = ok; }) });

  sessao.reinicia();
  const emVoo = sessao.envia('pergunta da conversa nova');
  resolve(RESULTADO);

  assert.equal((await emVoo).estado, 'ok');
  assert.deepEqual(sessao.historico.map((m) => m.papel), ['user', 'assistant']);
});

test('reiniciar zera histórico, identificador da resposta e época', async () => {
  const sessao = criaSessao({ perguntar: async () => RESULTADO });

  await sessao.envia('primeira');
  assert.equal(sessao.historico.length, 2);

  sessao.reinicia();

  assert.deepEqual(sessao.historico, []);
  await sessao.envia('segunda');
  assert.equal(sessao.ultimaChamada.respostaId, null,
    'a conversa nova mandou o resposta_id da conversa anterior');
});

// --------------------------------------------------------------------------
// cancelar
// --------------------------------------------------------------------------

test('cancelar aborta a requisição e devolve estado próprio, não erro', async () => {
  let sinalVisto = null;
  const sessao = criaSessao({
    buscar: (url, opcoes) => {
      sinalVisto = opcoes.signal;
      return new Promise((_, nao) => {
        opcoes.signal.addEventListener('abort',
          () => nao(Object.assign(new Error('abort'), { name: 'AbortError' })));
      });
    },
    perguntar: async (mensagens, { buscar }) => {
      try {
        return await buscar('/api/conversa', {});
      } catch (e) {
        throw new ErroConversa('rede', 'sem rede', e);
      }
    },
  });

  const emVoo = sessao.envia('pergunta a cancelar');
  sessao.cancela();
  const r = await emVoo;

  assert.equal(sinalVisto.aborted, true);
  assert.equal(r.estado, 'cancelado');
  assert.deepEqual(sessao.historico, [],
    'a pergunta cancelada continuou no histórico e seria reenviada');
});

test('cancelar sem requisição pendente não quebra', () => {
  const sessao = criaSessao({ perguntar: async () => RESULTADO });

  assert.doesNotThrow(() => sessao.cancela());
  assert.equal(sessao.pendente, false);
});

// --------------------------------------------------------------------------
// envio concorrente
// --------------------------------------------------------------------------

test('um envio novo cancela o anterior em vez de responder duas vezes', async () => {
  const pendentes = [];
  const sessao = criaSessao({ perguntar: () => new Promise((ok) => pendentes.push(ok)) });

  const primeira = sessao.envia('primeira pergunta');
  const segunda = sessao.envia('segunda pergunta');

  pendentes[0]({ ...RESULTADO, texto: 'resposta da primeira' });
  pendentes[1]({ ...RESULTADO, texto: 'resposta da segunda' });

  const [a, b] = await Promise.all([primeira, segunda]);

  assert.equal(a.estado, 'obsoleto', 'a primeira resposta ainda foi entregue');
  assert.equal(b.estado, 'ok');
  assert.deepEqual(sessao.historico.map((m) => m.texto),
    ['segunda pergunta', 'resposta da segunda']);
});

// --------------------------------------------------------------------------
// o que a página precisa saber
// --------------------------------------------------------------------------

test('a última pergunta do usuário fica acessível para reenvio', async () => {
  const sessao = criaSessao({
    perguntar: async () => { throw new ErroConversa('sem-followup', 'sem histórico'); },
  });

  await sessao.envia('primeira');
  const r = await sessao.envia('e sobre saúde?');

  assert.equal(r.estado, 'erro');
  assert.equal(r.perguntaRecusada, 'e sobre saúde?');
});

test('o identificador da resposta anterior acompanha o turno seguinte', async () => {
  const sessao = criaSessao({ perguntar: async () => RESULTADO });

  await sessao.envia('primeira');
  await sessao.envia('segunda');

  assert.equal(sessao.ultimaChamada.respostaId, 'r-1');
  assert.equal(sessao.ultimaChamada.mensagens.length, 3);
});
