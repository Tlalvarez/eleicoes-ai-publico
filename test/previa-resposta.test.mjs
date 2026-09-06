import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESCRICAO_PREVIA, injetaPrevia, nomesCitados, tituloDaResposta } from '../src/lib/previa-resposta.mjs';

const cit = (nome) => ({ nome, url: 'https://x' });

test('título da prévia: nomes citados, sem repetição, até três; acima disso, a contagem', () => {
  assert.equal(tituloDaResposta({ citacoes: [] }), 'Uma resposta do eleicoes.ai');
  assert.equal(tituloDaResposta({ citacoes: [cit('Lula'), cit('Lula')] }), 'Resposta sobre Lula');
  assert.equal(tituloDaResposta({ citacoes: [cit('Lula'), cit('Flávio Bolsonaro')] }),
    'Resposta sobre Lula e Flávio Bolsonaro');
  assert.equal(tituloDaResposta({ citacoes: [cit('A'), cit('B'), cit('C')] }), 'Resposta sobre A, B e C');
  assert.equal(tituloDaResposta({ citacoes: [cit('A'), cit('B'), cit('C'), cit('D')] }), 'Resposta sobre 4 candidatos');
  assert.deepEqual(nomesCitados({ citacoes: [cit('  B  '), cit(''), cit('A'), cit('B')] }), ['B', 'A']);
});

test('a prévia nunca usa a pergunta nem o texto do modelo: só nomes de fonte', () => {
  const r = { pergunta: 'Quem mente mais?', texto: 'Conclusão: …', citacoes: [cit('Lula')] };
  assert.equal(tituloDaResposta(r), 'Resposta sobre Lula');
  assert.doesNotMatch(DESCRICAO_PREVIA, /mente|melhor|pior/);
});

test('injeta título e metas escapados; sem <title> ou </head>, devolve o HTML intacto', () => {
  const app = '<!doctype html><html><head><title>app</title><meta name="description" content="x"></head><body></body></html>';
  const saida = injetaPrevia(app, { titulo: 'Resposta sobre <A> & "B"', url: 'https://eleicoes.ai/resposta/AbC' });
  assert.match(saida, /<title>Resposta sobre &lt;A&gt; &amp; &quot;B&quot; · eleicoes\.ai<\/title>/);
  assert.match(saida, /<meta property="og:title" content="Resposta sobre &lt;A&gt; &amp; &quot;B&quot;">/);
  assert.match(saida, /<meta property="og:url" content="https:\/\/eleicoes\.ai\/resposta\/AbC">/);
  assert.match(saida, /<meta property="og:description" content="Gerada por inteligência artificial/);
  assert.equal((saida.match(/name="description"/g) || []).length, 1, 'a description antiga sai, a nova entra');
  assert.equal(injetaPrevia('<p>sem head</p>', { titulo: 'x' }), '<p>sem head</p>');
  assert.equal(injetaPrevia(app, {}), app);
});
