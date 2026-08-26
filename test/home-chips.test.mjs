/**
 * Os chips da home (as perguntas de exemplo sob a busca) saem de
 * data/itens/resumo.json, com a MESMA formulação para todo candidato.
 *
 * Os chips eram escritos à mão e citavam 5 dos candidatos, cada um com um
 * tema próprio ("O que o Lula propõe para a educação?", "O que o Zema diz
 * sobre impostos?"). São duas quebras de régua: cobertura assimétrica (quem
 * não está na lista parece não ser acompanhado) e formulação desigual (o tema
 * colado no nome sugere associação editorial que o dado não sustenta).
 *
 * Fixture sintética — nomes inventados, para o teste não depender de quem
 * está no resumo real.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  candidatosDaHome, chipsDaHome, citacoesDeCandidato, perguntaChip,
} from '../src/lib/home.mjs';

/** Ordem de inserção e volume propositalmente contrários à ordem alfabética. */
const resumo = {
  candidatos: {
    'zuleide-alves': { nome: 'Zuleide Alves', total: 90000 },
    'ana-brito': { nome: 'Ana Brito', total: 10 },
    'carlos-dias': { nome: 'Carlos Dias', total: 500 },
  },
};

test('um chip por candidato do resumo — nem a mais, nem a menos', () => {
  const chips = chipsDaHome(resumo);
  assert.deepEqual(
    chips.map((c) => c.slug).sort(),
    Object.keys(resumo.candidatos).sort(),
  );
  assert.equal(chips.length, Object.keys(resumo.candidatos).length);
});

test('candidato novo no resumo entra sozinho, sem tocar no código', () => {
  const ampliado = { candidatos: { ...resumo.candidatos, 'edu-farias': { nome: 'Edu Farias', total: 7 } } };
  const chips = chipsDaHome(ampliado);
  assert.equal(chips.length, 4);
  assert.ok(chips.some((c) => c.slug === 'edu-farias' && c.pergunta.includes('Edu Farias')));
});

test('a mesma formulação para todos: o molde só troca o nome', () => {
  const chips = chipsDaHome(resumo);
  const moldes = new Set(chips.map((c) => c.pergunta.replace(c.nome, '{}')));
  assert.equal(moldes.size, 1, `formulações diferentes entre candidatos: ${[...moldes].join(' | ')}`);
  for (const c of chips) assert.equal(c.pergunta, perguntaChip(c.nome));
});

test('nenhum tema colado a um candidato só', () => {
  const chips = chipsDaHome(resumo);
  const sobras = chips.map((c) => c.pergunta.replace(c.nome, '').trim());
  for (const s of sobras) assert.equal(s, sobras[0], `sobra de texto diferente entre chips: ${s}`);
});

test('o molde não infere gênero do nome', () => {
  const p = perguntaChip('Ana Brito');
  assert.doesNotMatch(p, /\b(o|a|do|da|ao|à)\s+Ana Brito/i, `artigo de gênero no molde: ${p}`);
});

test('ordem alfabética por nome — não por volume de itens', () => {
  const chips = chipsDaHome(resumo);
  assert.deepEqual(chips.map((c) => c.nome), ['Ana Brito', 'Carlos Dias', 'Zuleide Alves']);
  assert.deepEqual(candidatosDaHome(resumo).map((c) => c.slug), chips.map((c) => c.slug));
});

test('o chip leva ao chat da home com a pergunta codificada', () => {
  // a home É o chat: o chip não pode apontar para uma segunda superfície de
  // busca, e precisa continuar funcionando sem JavaScript
  for (const c of chipsDaHome(resumo)) {
    assert.equal(c.href, `/?q=${encodeURIComponent(c.pergunta)}`);
    assert.equal(decodeURIComponent(c.href.split('?q=')[1]), c.pergunta);
  }
});


// --------------------------------------------------------------------------
// citação de candidato no texto da home
//
// A home não pode citar UM candidato pelo nome: quem não é citado parece não
// ser acompanhado. A checagem de origem procurava cada pedaço do nome com 4+
// letras, sem caixa — e na Onda 1 isso passou a acusar a frase "acompanhamos
// o que cada candidato fala todos os dias" como citação de **Hertz Dias**.
//
// O falso positivo não é detalhe: um gate que acusa o que não é problema é um
// gate que alguém desliga. A regra passou a exigir a caixa do nome próprio —
// em português o sobrenome vem capitalizado e o substantivo comum não.
// --------------------------------------------------------------------------

const NOMES = ['Hertz Dias', 'Lula', 'Rui Costa Pimenta'];

test('substantivo comum que coincide com sobrenome não é citação', () => {
  const texto = 'acompanhamos o que cada candidato fala todos os dias.';

  assert.deepEqual(citacoesDeCandidato(texto, NOMES), []);
});

test('o nome próprio citado no texto é acusado', () => {
  const texto = 'O que o Lula propõe para a educação?';

  assert.deepEqual(citacoesDeCandidato(texto, NOMES), [
    { nome: 'Lula', trecho: 'Lula' },
  ]);
});

test('sobrenome citado com a caixa do nome próprio é acusado', () => {
  const texto = 'Uma entrevista com Dias sobre o programa.';

  assert.deepEqual(citacoesDeCandidato(texto, NOMES), [
    { nome: 'Hertz Dias', trecho: 'Dias' },
  ]);
});

test('pedaço curto do nome não conta', () => {
  // "Rui" tem 3 letras: procurar por ele acusaria qualquer texto que o
  // contivesse por acaso, e o sinal se perderia no ruído
  assert.deepEqual(citacoesDeCandidato('Rui foi ao mercado', NOMES), []);
});

test('cada candidato é acusado uma vez, mesmo citado várias', () => {
  const texto = 'Lula e Lula outra vez, e também Pimenta.';

  assert.deepEqual(citacoesDeCandidato(texto, NOMES), [
    { nome: 'Lula', trecho: 'Lula' },
    { nome: 'Rui Costa Pimenta', trecho: 'Pimenta' },
  ]);
});
