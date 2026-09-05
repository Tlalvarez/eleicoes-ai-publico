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

test('só a verificação pede noindex; as páginas do menu, não', async () => {
  for (const f of ['pages/verificacao/index.astro', 'pages/verificacao/[slug].astro']) {
    assert.match(await le(f), /<Base noindex/, f);
  }
  for (const f of ['pages/index.astro', 'pages/[cargo]/index.astro', 'pages/metodologia.astro', 'pages/sobre.astro', 'pages/privacidade.astro']) {
    assert.doesNotMatch(await le(f), /<Base noindex/, f);
  }
});

test('acervo, hub por candidato e menções saíram do build; os endereços antigos redirecionam', async () => {
  const { existsSync } = await import('node:fs');
  for (const dir of ['pages/acervo', 'pages/candidato', 'pages/mencoes']) {
    assert.ok(!existsSync(new URL(`../src/${dir}`, import.meta.url)), `${dir} voltou ao build`);
  }
  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
  const catalogo = JSON.parse(await readFile(new URL('../src/data/candidatos.json', import.meta.url), 'utf8'));
  for (const raiz of ['/acervo', '/candidato', '/mencoes']) {
    assert.match(redirects, new RegExp(`^${raiz} +/ +302$`, 'm'), raiz);
  }
  for (const { slug } of catalogo.candidatos) {
    for (const secao of ['acervo', 'candidato']) {
      assert.match(redirects, new RegExp(`^/${secao}/${slug}/\\* +/presidente/${slug} +302$`, 'm'), `${secao}/${slug}`);
      assert.match(redirects, new RegExp(`^/${secao}/${slug} +/presidente/${slug} +302$`, 'm'), `${secao}/${slug}`);
    }
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
  assert.match(sobre, /EMAIL_CONTATO/);
  assert.match(await le('components/Chat.astro'), /Reportar um problema nesta resposta/);
  assert.match(await le('pages/privacidade.astro'), /EMAIL_CONTATO/);
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

test('a verificação sai do esconderijo pela metodologia, com moldura datada', async () => {
  assert.match(await le('pages/metodologia.astro'), /href="\/verificacao"/);
  const indice = await le('pages/verificacao/index.astro');
  assert.match(indice, /Não é avaliação de nenhuma candidatura de 2026/);
  assert.match(indice, /\{periodo\}/);
  assert.match(await le('pages/verificacao/[slug].astro'), /Não é avaliação de candidatura de 2026/);
});
