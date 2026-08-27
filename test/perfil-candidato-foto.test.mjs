import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGINA = fileURLToPath(new URL('../src/pages/candidato/[slug]/index.astro', import.meta.url));
const fonte = readFileSync(PAGINA, 'utf8');

test('página individual usa o retrato licenciado como perfil', () => {
  assert.match(fonte, /class="perfil-candidato"/);
  assert.match(fonte, /src=\{imagem\.image_path\}/);
  assert.match(fonte, /alt=\{`Retrato de \$\{c\.nome\}`\}/);
  assert.match(fonte, /width="161"[\s\S]*height="225"/);
  assert.match(fonte, /aspect-ratio: 161 \/ 225/);
  assert.match(fonte, /class="foto-perfil"/);
  assert.match(fonte, /imagem\.source_page/);
  assert.match(fonte, /imagem\.license/);
});

test('conteúdo e navegação do perfil permanecem disponíveis', () => {
  assert.match(fonte, /id="nome-candidato"/);
  assert.match(fonte, />Visões</);
  assert.match(fonte, /\/voz`/);
  assert.match(fonte, /\/arquivo`/);
  assert.match(fonte, /\/mencoes`/);
});
