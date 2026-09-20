/** IndexNow: a chave é o arquivo em public/, e o que se avisa é o que MUDOU (ver scripts/avisa-indexnow.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDeIndexNow, enderecosDe } from '../scripts/avisa-indexnow.mjs';

test('a chave existe e o arquivo público tem a própria chave dentro', () => {
  const chave = chaveDeIndexNow();
  assert.match(chave ?? '', /^[0-9a-f]{8,128}$/, 'sem public/<chave>.txt o IndexNow recusa o aviso');
});

test('arquivo de dado vira o endereço da página, não o do arquivo', () => {
  assert.deepEqual(enderecosDe(['data/comparacao/presidente/saude.json']), ['https://eleicoes.ai/presidente/saude']);
  assert.deepEqual(enderecosDe(['data/comparacao/governador/rj/seguranca.json']), ['https://eleicoes.ai/governador/rj']);
  // uma UF com dois temas mudados avisa a UF uma vez só
  assert.deepEqual(enderecosDe(['data/comparacao/governador/sp/saude.json', 'data/comparacao/governador/sp/economia.json']),
                   ['https://eleicoes.ai/governador/sp']);
  assert.deepEqual(enderecosDe(['src/pages/metodologia.astro']), ['https://eleicoes.ai/metodologia']);
  assert.deepEqual(enderecosDe(['src/pages/index.astro']), ['https://eleicoes.ai/']);
  // mudança no layout ou no componente muda toda página: avisa a home e deixa o sitemap fazer o resto
  assert.deepEqual(enderecosDe(['src/components/Comparacao.astro']), ['https://eleicoes.ai/']);
  assert.deepEqual(enderecosDe(['README.md', 'v3/qualquer.py']), []);
});
