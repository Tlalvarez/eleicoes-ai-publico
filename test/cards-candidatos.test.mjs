import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pagina = readFileSync(`${ROOT}/src/pages/candidato/index.astro`, 'utf8');
const css = readFileSync(`${ROOT}/src/styles/global.css`, 'utf8');
const catalogo = JSON.parse(readFileSync(`${ROOT}/src/data/candidatos.json`, 'utf8')).candidatos;
const manifesto = JSON.parse(readFileSync(`${ROOT}/src/data/imagens-candidatos.json`, 'utf8'));

test('cada candidato possui card e retrato local', () => {
  const slugs = catalogo.map((c) => c.slug).sort();
  const imagens = manifesto.candidates.map((c) => c.candidate_slug).sort();
  assert.deepEqual(imagens, slugs);
  assert.equal(manifesto.count, 13);
  for (const imagem of manifesto.candidates) {
    assert.ok(existsSync(`${ROOT}/public${imagem.image_path}`), `imagem ausente: ${imagem.candidate_slug}`);
    assert.match(imagem.original_sha256, /^[a-f0-9]{64}$/);
    assert.ok(imagem.source_page && imagem.public_credit && imagem.license);
    assert.match(imagem.public_modification_note, /161 × 225/);
  }
});

test('lista de candidatos usa cards com foto, texto e crédito', () => {
  assert.match(pagina, /class="grade-candidatos"/);
  assert.match(pagina, /class="cartao-candidato"/);
  assert.match(pagina, /loading="lazy"[\s\S]*?alt=""/);
  assert.doesNotMatch(pagina, /public_modification_note/);   // a nota fica no manifesto, não no card
  assert.match(pagina, /width="161"[\s\S]*height="225"/);
  assert.match(pagina, /aspect-ratio: 161 \/ 225/);
  assert.match(pagina, /grid-template-columns: repeat\(auto-fill, 161px\)/);
  assert.match(pagina, /\.retrato-link img \{[\s\S]*?width: 100%;[\s\S]*?margin: 0;/);
  assert.match(pagina, /class="resumo-candidato"/);
  assert.match(pagina, /class="credito-retrato"/);
});

test('layout comporta sete cards por linha em desktop', () => {
  assert.match(css, /--largura:\s*80rem/);
  assert.match(pagina, /grid-template-columns: repeat\(auto-fill, 161px\)/);
  const larguraUtil = 80 * 16 - 2 * 20;
  const larguraSeteCards = 7 * 161 + 6 * 16;
  assert.ok(larguraUtil >= larguraSeteCards);
});
