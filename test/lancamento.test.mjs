import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// O lançamento público de 05/09/2026 tem três condições que o gate protege:
// o site é indexável, tem quem responda por ele e não finge encontrar tudo.
// Em 13/09/2026 o produto mudou (v3): o chat saiu e o site compara os
// programas de governo por tema. As condições continuam; o que se cobra da
// superfície mudou com ela.
const le = (p) => readFile(new URL(`../src/${p}`, import.meta.url), 'utf8');
const existe = (p) => existsSync(new URL(`../${p}`, import.meta.url));

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
  for (const f of ['pages/index.astro', 'pages/presidente/index.astro', 'pages/presidente/[tema].astro',
    'pages/[cargo]/index.astro', 'pages/[cargo]/[uf].astro', 'pages/[cargo]/[uf]/[tema].astro',
    'pages/metodologia.astro', 'pages/sobre.astro', 'pages/privacidade.astro']) {
    assert.doesNotMatch(await le(f), /<Base noindex/, f);
  }
});

test('v3: o chat saiu inteiro — componente, libs, função de servidor, middleware', () => {
  for (const p of ['src/components/Chat.astro', 'src/middleware.js', 'functions',
    'src/lib/chat.mjs', 'src/lib/sessao-conversa.mjs', 'src/lib/conversa-guardada.mjs', 'src/lib/markdown.mjs',
    'src/lib/html-seguro.mjs', 'src/lib/pagina-resposta.mjs', 'src/lib/resposta-publica.mjs', 'src/lib/permalink.mjs',
    'src/lib/compartilhar.mjs', 'src/lib/previa-resposta.mjs', 'src/lib/dados.mjs', 'data/itens', 'data/current.json']) {
    assert.ok(!existe(p), `${p} voltou`);
  }
});

test('v3: o site compila só do que está versionado — nada lê o harness, o S3 ou uma geração', async () => {
  const { execSync } = await import('node:child_process');
  const saida = execSync("grep -rlE 'PUBLIC_PESQUISA_API|/api/conversa|leDados\\(|data/current\\.json|releases/' src astro.config.mjs || true",
    { encoding: 'utf8', cwd: new URL('..', import.meta.url) }).trim();
  assert.equal(saida, '', `ainda lê o acervo/chat: ${saida}`);
  assert.ok(existe('data/comparacao/paginas.json'), 'os dados da comparação não estão no repositório');
  assert.ok(!existe('.gitignore') || !/^data\/comparacao/m.test(await readFile(new URL('../.gitignore', import.meta.url), 'utf8')),
    'data/comparacao está no .gitignore — ele tem de ser versionado');
});

test('páginas por UF separam quem está na disputa de quem saiu, com a data do TSE, e dizem "em preparação" sem dados', async () => {
  const uf = await le('pages/[cargo]/[uf].astro');
  assert.match(uf, /separaPorDisputa\(candidaturas\(cargo\.slug, uf\.sigla\)\)/);
  assert.match(uf, /<details class="fora-da-disputa">/);
  assert.match(uf, /Fora da disputa segundo o TSE em \{SNAPSHOT_BR\}/);
  assert.match(uf, /emDisputa\.map/);
  assert.match(uf, /em preparação/);
  // sem link para conversa por candidato: o cartão é informação, não porta
  assert.doesNotMatch(uf, /retrato-link/);
});

test('acervo, hub por candidato e menções saíram do build; os endereços antigos redirecionam', async () => {
  for (const dir of ['pages/acervo', 'pages/candidato', 'pages/mencoes']) {
    assert.ok(!existe(`src/${dir}`), `${dir} voltou ao build`);
  }
  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
  for (const raiz of ['/acervo', '/candidato', '/mencoes']) {
    assert.match(redirects, new RegExp(`^${raiz} +/presidente +302$`, 'm'), raiz);
  }
});

test('regra do Thiago: nenhuma superfície diz "na própria voz"', async () => {
  const { execSync } = await import('node:child_process');
  const saida = execSync("grep -rli 'própria voz' src || true", { encoding: 'utf8', cwd: new URL('..', import.meta.url) }).trim();
  assert.equal(saida, '', `ainda diz "própria voz": ${saida}`);
});

test('lançamento: rodapé leva a quem faz, privacidade e contato, e não fala em respostas', async () => {
  const base = await le('layouts/Base.astro');
  for (const href of ['/sobre', '/privacidade', '/sobre#contato', '/metodologia']) {
    assert.match(base, new RegExp(`href="${href}"`), `falta ${href} no rodapé`);
  }
  const rodape = base.match(/<footer class="site">[\s\S]*?<\/footer>/)[0];
  assert.doesNotMatch(rodape, /resposta/i);
  assert.match(rodape, /não recomenda voto/);
  assert.match(rodape, /iniciativa independente/);
});

test('lançamento: a página Quem faz nomeia o responsável e o canal de contato', async () => {
  const sobre = await le('pages/sobre.astro');
  assert.match(sobre, /Thiago Alvarez/);
  assert.match(sobre, /id="contato"/);
  assert.match(sobre, /Não recomenda voto/);
  assert.match(sobre, /revisor humano/);
  assert.match(sobre, /EMAIL_CONTATO/);
  assert.match(sobre, /linkedin\.com\/in\/thiagoalvarez/);
  assert.match(sobre, /<h2 id="regras">Regras da casa<\/h2>/);
  assert.ok((sobre.match(/<ol class="regras">[\s\S]*?<\/ol>/)[0].match(/<li>/g) || []).length >= 4);
  assert.match(await le('pages/privacidade.astro'), /EMAIL_CONTATO/);
  // nada de chat na superfície pública
  for (const f of ['pages/sobre.astro', 'pages/privacidade.astro', 'content/metodologia.md']) {
    const t = await le(f);
    assert.doesNotMatch(t, /\/resposta\//, `${f} ainda cita a resposta guardada`);
    assert.doesNotMatch(t, /\bchat\b/i, `${f} ainda fala em chat como produto`);
  }
});

test('lançamento: privacidade descreve o que o código faz', async () => {
  const priv = await le('pages/privacidade.astro');
  const base = await le('layouts/Base.astro');
  assert.match(priv, /modo sem cookies/);
  assert.match(base, /cookieless_mode: 'always'/, 'a promessa de "sem cookies" depende disto');
  assert.match(base, /person_profiles: 'never'/);
  // o site não guarda nada no navegador: nem conversa, nem preferência
  assert.doesNotMatch(base, /localStorage|sessionStorage/);
  assert.doesNotMatch(await le('components/Comparacao.astro'), /localStorage|sessionStorage/);
  assert.doesNotMatch(priv, /neste navegador/);
  // o que a medição manda: só o vocabulário fechado
  for (const evento of ['tema', 'proposta', 'TSE']) assert.match(priv, new RegExp(evento), `privacidade não diz que mede ${evento}`);
});

test('lançamento: existe página 404 própria, apontando para a comparação', async () => {
  const p = await le('pages/404.astro');
  assert.match(p, /Página não encontrada/);
  assert.match(p, /href="\/presidente"/);
  assert.match(p, /href="\/governador"/);
  assert.doesNotMatch(p, /senador/);
});

test('senador e deputado federal fora, com redirecionamento e página de explicação', async () => {
  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
  assert.ok(!existe('src/pages/senador.astro'), 'senador.astro voltou');
  assert.match(redirects, /^\/senador\/\* +\/ +302$/m);
  const dep = await le('pages/deputado-federal.astro');
  assert.match(dep, /não registram programa de governo/);
  assert.match(redirects, /^\/deputado-federal\/\* +\/deputado-federal +302$/m);
});

test('a verificação sai do esconderijo pela metodologia, com moldura datada', async () => {
  assert.match(await le('pages/metodologia.astro'), /href="\/verificacao"/);
  const indice = await le('pages/verificacao/index.astro');
  assert.match(indice, /Não é avaliação de nenhuma candidatura de 2026/);
  assert.match(indice, /\{periodo\}/);
  assert.match(await le('pages/verificacao/[slug].astro'), /Não é avaliação de candidatura de 2026/);
});

test('prévia do site: og:title, og:description, og:url e og:image em todas as páginas; a imagem existe', async () => {
  const base = await le('layouts/Base.astro');
  for (const chave of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card']) {
    assert.match(base, new RegExp(`(?:property|name)="${chave}"`), chave);
  }
  const png = statSync(new URL('../public/og-eleicoes.png', import.meta.url));
  assert.ok(png.size > 10_000 && png.size < 300_000, 'og-eleicoes.png entre 10 KB e 300 KB (WhatsApp)');
});

test('og:url é o endereço público, sem .html (é o destino que o WhatsApp usa)', async () => {
  const base = await le('layouts/Base.astro');
  assert.match(base, /const caminhoPublico = path\.replace\(\/index\\\.html\$\/, ''\)\.replace\(\/\\\.html\$\/, ''\) \|\| '\/';/);
  assert.match(base, /og:url" content=\{new URL\(caminhoPublico/);
});

test('metodologia diz como os programas são lidos e comparados, com o histórico do código', async () => {
  const m = await readFile(new URL('../src/content/metodologia.md', import.meta.url), 'utf8');
  assert.match(m, /## Como este site foi feito/);
  assert.match(m, /commits\/main/);
  assert.match(m, /TSE/);
  assert.match(m, /propõe o contrário/);
  assert.doesNotMatch(m, /\]\(\/acervo\)/, 'o acervo saiu do build: link morto');
});

test('a página de comparação: rótulo de IA, trecho do programa a um toque, sem cor por candidato', async () => {
  const comp = await le('components/Comparacao.astro');
  assert.match(comp, /inteligência artificial/);
  assert.match(comp, /<dialog class="trechos"/);
  assert.match(comp, /Ver o programa no TSE/);
  assert.match(comp, /import \{ layout, selecaoDaUrl, urlDaSelecao \} from '\.\.\/lib\/comparacao\.mjs'/);
  assert.match(comp, /import \{ layout, contagens \} from '\.\.\/lib\/comparacao\.mjs'/, 'o build usa a mesma função que o navegador');
  // nenhuma cor atribuída a uma coluna específica
  assert.doesNotMatch(comp, /nth-child|nth-of-type|data-slug="[a-z-]+"\]\s*\{/);
  // e nada monta estrutura a partir de string
  assert.doesNotMatch(comp, /innerHTML|insertAdjacentHTML|set:html/);
});
