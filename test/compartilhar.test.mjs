/**
 * O que sai do site quando alguém compartilha um resultado.
 *
 * Um texto compartilhado circula SEM a página em volta: sem o aviso de
 * rotulagem de IA, sem o estado de release, sem a nota de neutralidade. Se o
 * que o botão copia for só a resposta, o site publica um veredito anônimo em
 * grupo de WhatsApp — o oposto do que ele se propõe.
 *
 * Então todo formato de saída carrega, sempre: a pergunta que gerou aquilo, o
 * estado de publicação dos dados, a marca de que é resposta gerada por IA, e
 * o link quando ele existe. É verboso de propósito.
 *
 * São quatro saídas, para quatro usos:
 *   · `resumoLegivel`  — WhatsApp e Web Share: conclusão + link, curto;
 *   · `textoCompleto`  — "copiar texto": resposta inteira, sem marcação;
 *   · `markdownCompleto` — "copiar Markdown": resposta como veio, com fontes;
 *   · `linkWhatsApp`   — o endereço wa.me com a mensagem já embutida.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIMITE_RESUMO, linkWhatsApp, markdownCompleto, payloadWebShare,
  resumoLegivel, textoCompleto,
} from '../src/lib/compartilhar.mjs';
import { ROTULO_PREVIA } from '../src/lib/release.mjs';

const RESULTADO = {
  pergunta: 'O que os candidatos propõem sobre previdência?',
  texto: [
    '## Conclusão',
    '',
    'Dois dos treze registraram proposta sobre o tema; os demais não têm registro.',
    '',
    '## Evidência',
    '',
    '- **A:** falou em revisar a regra de transição [S1]',
    '- **B:** citou o tema sem detalhar [S2]',
    '',
    '## Lacuna',
    '',
    '- Nada registrado para os outros onze.',
  ].join('\n'),
  citacoes: [
    { marcadores: [1], nome: 'A', rotulo: 'vídeo no YouTube', data: '2026-08-13',
      url: 'https://youtube.com/watch?v=aaa', estatuto_rotulo: 'legenda automática' },
    { marcadores: [2], nome: 'B', rotulo: 'post no X', data: '2026-07-02',
      url: 'https://x.com/b/status/2' },
  ],
  rodape: 'Resposta gerada por IA a partir do acervo · 2026-08-25',
};

const URL_RESULTADO = 'https://eleicoes.ai/#r=1zABCDEF';

// --------------------------------------------------------------------------
// resumo curto (WhatsApp, Web Share)
// --------------------------------------------------------------------------

test('o resumo abre pela pergunta e traz a conclusão', () => {
  const r = resumoLegivel({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.match(r, /O que os candidatos propõem sobre previdência\?/);
  assert.match(r, /Dois dos treze registraram proposta/);
});

test('o resumo não leva marcação de Markdown', () => {
  const r = resumoLegivel({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.doesNotMatch(r, /^##/m);
  assert.doesNotMatch(r, /\*\*/);
});

test('o resumo leva a URL quando ela existe', () => {
  const r = resumoLegivel({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.ok(r.includes(URL_RESULTADO));
});

test('sem URL o resumo não fica com link pela metade', () => {
  const r = resumoLegivel({ ...RESULTADO, url: null, estado: ROTULO_PREVIA });

  assert.doesNotMatch(r, /https?:\/\/eleicoes/);
  assert.doesNotMatch(r, /\n\s*$/);
});

test('o resumo diz que é resposta de IA e em que estado estão os dados', () => {
  const r = resumoLegivel({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.match(r, /eleicoes\.ai/i);
  assert.match(r, /IA|inteligência artificial/i);
  assert.ok(r.includes(ROTULO_PREVIA), `estado de release ausente:\n${r}`);
});

test('o resumo cabe numa mensagem, cortando em fronteira de palavra', () => {
  const longo = { ...RESULTADO,
    texto: `## Conclusão\n\n${'palavra '.repeat(400)}fim.` };

  const r = resumoLegivel({ ...longo, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.ok(r.length < 1000, `resumo com ${r.length} caracteres`);
  assert.ok(r.length <= LIMITE_RESUMO + URL_RESULTADO.length + 300,
    `resumo com ${r.length} caracteres para limite de ${LIMITE_RESUMO}`);
  assert.match(r, /…/);
  assert.doesNotMatch(r, /pala…/);
  assert.ok(r.includes(URL_RESULTADO), 'cortou justamente o link');
});

test('o resumo nunca vira recomendação de voto', () => {
  const r = resumoLegivel({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.doesNotMatch(r, /\bvote\b|melhor candidato|recomend/i);
});

// --------------------------------------------------------------------------
// WhatsApp
// --------------------------------------------------------------------------

test('o link do WhatsApp é wa.me com o texto embutido', () => {
  const link = linkWhatsApp('oi & tchau?\nsegunda linha');

  assert.ok(link.startsWith('https://wa.me/?text='));
  assert.equal(decodeURIComponent(link.slice('https://wa.me/?text='.length)),
    'oi & tchau?\nsegunda linha');
});

test('o link do WhatsApp escapa o que quebraria a query', () => {
  const link = linkWhatsApp('a&b=c#d');

  assert.ok(!link.slice('https://wa.me/?text='.length).includes('&'));
  assert.ok(!link.slice('https://wa.me/?text='.length).includes('#'));
});

test('mensagem vazia não gera link', () => {
  for (const m of ['', '   ', null, undefined]) assert.equal(linkWhatsApp(m), null);
});

// --------------------------------------------------------------------------
// Web Share
// --------------------------------------------------------------------------

test('o payload do Web Share tem título, texto e URL separados', () => {
  const p = payloadWebShare({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.equal(p.url, URL_RESULTADO);
  assert.match(p.title, /previdência/i);
  assert.ok(p.text.length > 0);
  assert.ok(!p.text.includes(URL_RESULTADO), 'a URL duplicada no texto vira link torto');
});

test('sem URL o Web Share leva tudo no texto, sem campo url', () => {
  const p = payloadWebShare({ ...RESULTADO, url: null, estado: ROTULO_PREVIA });

  assert.equal('url' in p, false);
  assert.match(p.text, /Dois dos treze/);
});

// --------------------------------------------------------------------------
// texto completo
// --------------------------------------------------------------------------

test('o texto completo traz a resposta inteira, sem marcação', () => {
  const t = textoCompleto({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.match(t, /Conclusão/);
  assert.match(t, /Lacuna/);
  assert.match(t, /• A: falou em revisar/);
  assert.doesNotMatch(t, /\*\*/);
  assert.doesNotMatch(t, /^## /m);
});

test('o texto completo lista as fontes com endereço e data', () => {
  const t = textoCompleto({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.match(t, /\[S1\]/);
  assert.ok(t.includes('https://youtube.com/watch?v=aaa'));
  assert.match(t, /13\/08\/2026/);
  assert.match(t, /legenda automática/);
});

test('o texto completo carrega rodapé, estado e pergunta', () => {
  const t = textoCompleto({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.ok(t.includes(RESULTADO.pergunta));
  assert.ok(t.includes(RESULTADO.rodape));
  assert.ok(t.includes(ROTULO_PREVIA));
});

// --------------------------------------------------------------------------
// Markdown completo
// --------------------------------------------------------------------------

test('o Markdown preserva a resposta como veio', () => {
  const md = markdownCompleto({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.ok(md.includes(RESULTADO.texto), 'a resposta foi reescrita em vez de preservada');
});

test('o Markdown lista as fontes como links numerados', () => {
  const md = markdownCompleto({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.match(md, /\[S1\].*\(https:\/\/youtube\.com\/watch\?v=aaa\)/);
  assert.match(md, /\[S2\].*\(https:\/\/x\.com\/b\/status\/2\)/);
});

test('o Markdown abre com a pergunta como título', () => {
  const md = markdownCompleto({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.match(md, /^# O que os candidatos propõem sobre previdência\?/);
});

test('o Markdown declara estado, rodapé e permalink', () => {
  const md = markdownCompleto({ ...RESULTADO, url: URL_RESULTADO, estado: ROTULO_PREVIA });

  assert.ok(md.includes(ROTULO_PREVIA));
  assert.ok(md.includes(RESULTADO.rodape));
  assert.ok(md.includes(URL_RESULTADO));
});

test('sem citações o bloco de fontes não aparece vazio', () => {
  const md = markdownCompleto({ ...RESULTADO, citacoes: [], url: null, estado: ROTULO_PREVIA });

  assert.doesNotMatch(md, /## Fontes/);
});

test('todos os formatos aguentam resultado degenerado sem lançar', () => {
  for (const r of [{}, { pergunta: '', texto: '' }, { texto: null, citacoes: null }]) {
    assert.doesNotThrow(() => resumoLegivel(r));
    assert.doesNotThrow(() => textoCompleto(r));
    assert.doesNotThrow(() => markdownCompleto(r));
    assert.doesNotThrow(() => payloadWebShare(r));
  }
});
