import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// O lançamento público de 05/09/2026 tem três condições que o gate protege:
// o site é indexável, tem quem responda por ele e não finge encontrar tudo.
const le = (p) => readFile(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('lançamento: o layout só emite noindex quando a página pede', async () => {
  const base = await le('layouts/Base.astro');
  const metas = [...base.matchAll(/<meta name="robots"[^>]*noindex[^>]*>/g)];
  assert.equal(metas.length, 1);
  assert.match(base, /\{noindex && <meta name="robots" content="noindex, follow" \/>\}/);
  assert.match(base, /noindex = false,/);
});

test('seções fora do menu pedem noindex; as do menu, não', async () => {
  const pede = ['pages/candidato/index.astro', 'pages/acervo/index.astro', 'pages/mencoes/index.astro',
    'pages/verificacao/index.astro', 'pages/candidato/[slug]/voz.astro'];
  for (const f of pede) assert.match(await le(f), /<Base noindex/, f);
  for (const f of ['pages/index.astro', 'pages/[cargo]/index.astro', 'pages/metodologia.astro', 'pages/sobre.astro', 'pages/privacidade.astro']) {
    assert.doesNotMatch(await le(f), /<Base noindex/, f);
  }
});

test('regra do Thiago: nenhuma superfície diz "na própria voz"', async () => {
  const { execSync } = await import('node:child_process');
  const saida = execSync("grep -rli 'própria voz' src || true", { encoding: 'utf8' }).trim();
  assert.equal(saida, '', `ainda diz "própria voz": ${saida}`);
});

test('lançamento: rodapé leva a quem faz, privacidade e contato', async () => {
  const base = await le('layouts/Base.astro');
  for (const href of ['/sobre', '/privacidade', '/sobre#contato']) {
    assert.match(base, new RegExp(`href="${href}"`), `falta ${href} no rodapé`);
  }
});

test('lançamento: a página Quem faz nomeia o responsável e o canal de retirada', async () => {
  const sobre = await le('pages/sobre.astro');
  assert.match(sobre, /Thiago Alvarez/);
  assert.match(sobre, /id="contato"/);
  assert.match(sobre, /Não recomenda voto/);
  assert.match(sobre, /Não tem revisor humano/);
});

test('lançamento: privacidade descreve o que o código faz', async () => {
  const priv = await le('pages/privacidade.astro');
  const base = await le('layouts/Base.astro');
  assert.match(priv, /endereço próprio, não listado/);
  assert.match(priv, /modo sem cookies/);
  assert.match(base, /cookieless_mode: 'always'/, 'a promessa de "sem cookies" depende disto');
  assert.match(base, /person_profiles: 'never'/);
});

test('lançamento: existe página 404 própria', async () => {
  const p = await le('pages/404.astro');
  assert.match(p, /Página não encontrada/);
});

test('senador suspenso: página de explicação e redirecionamento dos endereços antigos', async () => {
  const pagina = await le('pages/senador.astro');
  assert.match(pagina, /Em preparação/);
  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
  assert.match(redirects, /^\/senador\/\* +\/senador +302$/m);
  assert.match(redirects, /^\/deputado-federal\/\* +\/deputado-federal +302$/m);
  assert.match(await le('pages/deputado-federal.astro'), /Em preparação/);
});
