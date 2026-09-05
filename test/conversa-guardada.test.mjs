/**
 * A conversa guardada no navegador: sair da página e voltar não pode apagar a
 * resposta à pergunta que a pessoa fez.
 *
 * O cenário que motivou: perguntar em Presidente, clicar em Governador no
 * menu, clicar em Presidente de novo — e encontrar a home vazia. A resposta só
 * voltava pelo botão "voltar" do navegador. Aqui se prova, sem navegador, que
 * o que a página desenha vai ao armazém por página e volta inteiro, e que o
 * que vem do armazém é conferido campo a campo antes de virar tela.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TURNOS, PREFIXO_CHAVE, apaga, chaveDaConversa, contemResposta, desempacota,
  empacota, guarda, le, turnoGuardavel,
} from '../src/lib/conversa-guardada.mjs';
import { criaSessao } from '../src/lib/sessao-conversa.mjs';

/** Um sessionStorage falso, com a mesma superfície usada pelo módulo. */
function armazemFalso({ recusa = false } = {}) {
  const mapa = new Map();
  return {
    mapa,
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => { if (recusa) throw new Error('QuotaExceededError'); mapa.set(k, String(v)); },
    removeItem: (k) => { mapa.delete(k); },
  };
}

const RESULTADO = {
  id: 'r-1',
  compartilhamento_id: 'AbCdEfGhIjKlMnOpQrStUv',
  pergunta: 'o que há sobre previdência?',
  texto: '**Conclusão:** há proposta [S1]\n\n## Evidência\n- item [S1]',
  citacoes: [{ marcadores: [1], nome: 'Plano', url: 'https://a.org/1', tipo: 'programa', data: '2026-08-14' }],
  rodape: '',
  release_id: 'rel_2026-09-05_04',
  release_status: 'oficial',
};

test('a chave é por página de conversa', () => {
  assert.equal(chaveDaConversa('/'), `${PREFIXO_CHAVE}/`);
  assert.equal(chaveDaConversa('/governador/mg'), `${PREFIXO_CHAVE}/governador/mg`);
  assert.equal(chaveDaConversa(''), `${PREFIXO_CHAVE}/`);
  assert.notEqual(chaveDaConversa('/'), chaveDaConversa('/senador/sp'));
});

test('guardar e ler devolve os turnos e o id de continuidade, por página', () => {
  const armazem = armazemFalso();
  assert.equal(guarda(armazem, '/', {
    turnos: [{ pergunta: RESULTADO.pergunta, resultado: RESULTADO }], ultimoId: 'r-1',
  }), true);

  const lida = le(armazem, '/');
  assert.equal(lida.turnos.length, 1);
  assert.equal(lida.turnos[0].pergunta, RESULTADO.pergunta);
  assert.deepEqual(lida.turnos[0].resultado, RESULTADO);
  assert.equal(lida.ultimoId, 'r-1');

  // outra página não vê esta conversa
  assert.equal(le(armazem, '/governador/mg'), null);
});

test('apagar esquece a conversa da página e só dela', () => {
  const armazem = armazemFalso();
  guarda(armazem, '/', { turnos: [{ pergunta: 'a', resultado: RESULTADO }] });
  guarda(armazem, '/senador/rj', { turnos: [{ pergunta: 'b', resultado: RESULTADO }] });
  apaga(armazem, '/');
  assert.equal(le(armazem, '/'), null);
  assert.equal(le(armazem, '/senador/rj').turnos[0].pergunta, 'b');
});

test('armazém que recusa (cota, modo privado) não derruba a página', () => {
  const armazem = armazemFalso({ recusa: true });
  assert.equal(guarda(armazem, '/', { turnos: [{ pergunta: 'a', resultado: RESULTADO }] }), false);
  assert.equal(le(armazem, '/'), null);
  assert.doesNotThrow(() => apaga(armazem, '/'));
  // sem armazém nenhum
  assert.equal(le(null, '/'), null);
  assert.doesNotThrow(() => apaga(undefined, '/'));
});

test('turno sem pergunta ou sem texto não é guardável', () => {
  assert.equal(turnoGuardavel('', RESULTADO), null);
  assert.equal(turnoGuardavel('pergunta', { ...RESULTADO, texto: '   ' }), null);
  assert.equal(turnoGuardavel('pergunta', null), null);
  assert.ok(turnoGuardavel('pergunta', RESULTADO));
});

test('o pacote descarta turnos inválidos e guarda só os últimos MAX_TURNOS', () => {
  const muitos = Array.from({ length: MAX_TURNOS + 5 }, (_, i) => ({
    pergunta: `pergunta ${i}`, resultado: { ...RESULTADO, texto: `resposta ${i}` },
  }));
  muitos.splice(3, 0, { pergunta: 'quebrada', resultado: { texto: '' } });
  const pacote = empacota({ turnos: muitos, ultimoId: 'r-9' });
  assert.equal(pacote.turnos.length, MAX_TURNOS);
  assert.equal(pacote.turnos.at(-1).pergunta, `pergunta ${MAX_TURNOS + 4}`);
  assert.equal(pacote.turnos.some((t) => t.pergunta === 'quebrada'), false);
  assert.equal(pacote.ultimoId, 'r-9');
});

test('o que vem do armazém fora da forma esperada vira null, nunca tela', () => {
  const bom = JSON.stringify(empacota({ turnos: [{ pergunta: 'a', resultado: RESULTADO }] }));
  assert.ok(desempacota(bom));

  assert.equal(desempacota('não é json'), null);
  assert.equal(desempacota(null), null);
  assert.equal(desempacota(JSON.stringify({ v: 99, turnos: [] })), null);
  assert.equal(desempacota(JSON.stringify({ v: 1, turnos: 'x' })), null);
  assert.equal(desempacota(JSON.stringify({ v: 1, turnos: [] })), null);
  // turno sem pergunta
  assert.equal(desempacota(JSON.stringify({ v: 1, turnos: [{ resultado: RESULTADO }] })), null);
  // resultado sem texto
  assert.equal(desempacota(JSON.stringify({
    v: 1, turnos: [{ pergunta: 'a', resultado: { ...RESULTADO, texto: 7 } }],
  })), null);
  // citação sem lista de marcadores — a interface itera sobre ela
  assert.equal(desempacota(JSON.stringify({
    v: 1, turnos: [{ pergunta: 'a', resultado: { ...RESULTADO, citacoes: [{ nome: 'x' }] } }],
  })), null);
  assert.equal(desempacota(JSON.stringify({
    v: 1, turnos: [{ pergunta: 'a', resultado: { ...RESULTADO, citacoes: 'x' } }],
  })), null);
});

test('a conversa guardada sabe se contém a resposta pública da barra de endereço', () => {
  const conversa = desempacota(empacota({ turnos: [
    { pergunta: 'a', resultado: RESULTADO },
    { pergunta: 'b', resultado: { ...RESULTADO, compartilhamento_id: null, texto: 'seguimento' } },
  ] }));
  assert.equal(contemResposta(conversa, 'AbCdEfGhIjKlMnOpQrStUv'), true);
  assert.equal(contemResposta(conversa, 'outroIdQualquerXXXXXXX'), false);
  assert.equal(contemResposta(null, 'AbCdEfGhIjKlMnOpQrStUv'), false);
  assert.equal(contemResposta(conversa, null), false);
});

test('a sessão restaura a conversa inteira e continua dela', async () => {
  const sessao = criaSessao({ perguntar: async () => ({ ...RESULTADO, id: 'r-3', texto: 'terceira' }) });
  assert.equal(sessao.restaura([
    { pergunta: 'primeira?', texto: 'resposta 1' },
    { pergunta: 'segunda?', texto: 'resposta 2' },
  ], { id: 'r-2' }), true);
  assert.deepEqual(sessao.historico.map((m) => m.papel), ['user', 'assistant', 'user', 'assistant']);

  const r = await sessao.envia('terceira?');
  assert.equal(r.estado, 'ok');
  // o serviço recebeu a conversa restaurada + a pergunta nova, e o id de continuidade
  assert.equal(sessao.ultimaChamada.mensagens.length, 5);
  assert.equal(sessao.ultimaChamada.respostaId, 'r-2');
});

test('a sessão recusa restaurar par incompleto ou sobre conversa já começada', async () => {
  const sessao = criaSessao({ perguntar: async () => RESULTADO });
  assert.equal(sessao.restaura([{ pergunta: 'a', texto: '' }]), false);
  assert.equal(sessao.restaura([]), false);
  assert.equal(sessao.historico.length, 0);

  await sessao.envia('primeira?');
  assert.equal(sessao.restaura([{ pergunta: 'b', texto: 'c' }]), false);
  assert.equal(sessao.historico.length, 2);
});
