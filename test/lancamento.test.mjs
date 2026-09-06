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

test('páginas por UF separam quem está na disputa de quem saiu, com a data do TSE', async () => {
  const uf = await le('pages/[cargo]/[uf].astro');
  assert.match(uf, /separaPorDisputa\(cards\)/);
  assert.match(uf, /<details class="fora-da-disputa">/);
  assert.match(uf, /Fora da disputa segundo o TSE em \{SNAPSHOT_BR\}/);
  assert.match(uf, /emDisputa\.map/);
  assert.match(await le('pages/[cargo]/[uf]/[slug].astro'), /foraDaDisputa\(c\) &&/);
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
  assert.match(sobre, /linkedin\.com\/in\/thiagoalvarez/);
  assert.match(sobre, /<h2 id="regras">Regras da casa<\/h2>/);
  assert.equal((sobre.match(/<ol class="regras">[\s\S]*?<\/ol>/)[0].match(/<li>/g) || []).length, 6);
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

test('senador no ar; deputado federal com página de explicação e redirecionamento', async () => {
  const { existsSync } = await import('node:fs');
  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
  assert.ok(!existsSync(new URL('../src/pages/senador.astro', import.meta.url)), 'senador.astro voltou');
  assert.doesNotMatch(redirects, /^\/senador(\/|\s)/m, 'redirecionamento de senador ainda existe');
  const dep = await le('pages/deputado-federal.astro');
  assert.match(dep, /Em preparação/);
  assert.match(dep, /7\.772 candidaturas/, 'a página diz o número que motivou a decisão');
  assert.match(redirects, /^\/deputado-federal\/\* +\/deputado-federal +302$/m);
});

test('a verificação sai do esconderijo pela metodologia, com moldura datada', async () => {
  assert.match(await le('pages/metodologia.astro'), /href="\/verificacao"/);
  const indice = await le('pages/verificacao/index.astro');
  assert.match(indice, /Não é avaliação de nenhuma candidatura de 2026/);
  assert.match(indice, /\{periodo\}/);
  assert.match(await le('pages/verificacao/[slug].astro'), /Não é avaliação de candidatura de 2026/);
});

test('o rótulo de IA aparece no topo de cada resposta, antes do texto', async () => {
  const chat = await le('components/Chat.astro');
  const i = chat.indexOf("el('p', 'rotulo-ia'");
  const j = chat.indexOf('artigo.append(montaCorpo(resultado.texto');
  assert.ok(i > 0 && j > i, 'o rótulo tem de ser montado antes do corpo');
  assert.match(chat, /Resposta gerada por inteligência artificial · sem revisão humana · \$\{dataRotulo\}/);
});

test('prévia do site: og:title, og:description, og:url e og:image em todas as páginas; a imagem existe', async () => {
  const base = await le('layouts/Base.astro');
  for (const chave of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card']) {
    assert.match(base, new RegExp(`(?:property|name)="${chave}"`), chave);
  }
  const { statSync } = await import('node:fs');
  const png = statSync(new URL('../public/og-eleicoes.png', import.meta.url));
  assert.ok(png.size > 10_000 && png.size < 300_000, 'og-eleicoes.png entre 10 KB e 300 KB (WhatsApp)');
});

test('endereços legíveis do lançamento apontam para respostas guardadas', async () => {
  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
  for (const curto of ['/gas', '/gasolina']) {
    assert.match(redirects, new RegExp(`^${curto} +/resposta/[A-Za-z0-9_-]{22} +302$`, 'm'), curto);
  }
});

test('og:url é o endereço público, sem .html (é o destino que o WhatsApp usa)', async () => {
  const base = await le('layouts/Base.astro');
  assert.match(base, /const caminhoPublico = path\.replace\(\/index\\\.html\$\/, ''\)\.replace\(\/\\\.html\$\/, ''\) \|\| '\/'/);
  assert.match(base, /property="og:url" content=\{new URL\(caminhoPublico,/);
  assert.doesNotMatch(base, /property="og:url" content=\{new URL\(path,/);
});

test('a resposta mostra quem ficou de fora e a causa (a seção Lacunas é removida da tela)', async () => {
  const chat = await le('components/Chat.astro');
  // o bloco é montado a partir de candidatos[] do payload, não da prosa
  assert.match(chat, /function montaCobertura\(candidatos\)/);
  assert.match(chat, /const cobertura = montaCobertura\(resultado\.candidatos\);/);
  // as quatro causas do vocabulário fechado, com a frase de leitor de cada uma
  for (const [causa, frase] of [
    ['sem_fonte_declarada', 'Não informaram site nem rede social ao TSE'],
    ['so_canal_de_partido_declarado', 'Informaram ao TSE só o canal do partido'],
    ['so_canal_de_partido_anexado', 'Não há material próprio deles; o que temos é do canal do partido'],
    ['so_fontes_sem_lane', 'Informaram ao TSE só redes que ainda não coletamos'],
    ['sem_material_coletado', 'Ainda não coletamos material'],
  ]) {
    assert.ok(chat.includes(`['${causa}', '${frase}']`), `falta a frase da causa ${causa}`);
  }
  // nome de registro vem em caixa alta e não pode ir assim para a tela
  assert.match(chat, /function nomeLegivel\(nome\)/);
  // o bloco só aparece quando há alguém de fora
  assert.match(chat, /if \(!semTema\.length && !semNada\.length\) return null;/);
});

test('metodologia diz como o site foi feito, com o histórico do código e o gateway da coleta', async () => {
  const m = await readFile(new URL('../src/content/metodologia.md', import.meta.url), 'utf8');
  assert.match(m, /## Como este site foi feito/);
  assert.match(m, /nativeport\.ai/);
  assert.match(m, /commits\/main/);
  assert.doesNotMatch(m, /\]\(\/acervo\)/, 'o acervo saiu do build: link morto');
});

test('perguntar não esconde o cabeçalho nem a grade de candidatos', async () => {
  const chat = await le('components/Chat.astro');
  // o modo conversa escondia .hero-home e .secao-catalogo, e o leitor perdia o
  // caminho: não dava para ver os outros candidatos nem voltar para todos
  assert.doesNotMatch(chat, /modo-conversa[^{]*\.(hero-home|secao-catalogo)[^{]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(chat, /body\.modo-conversa \.secao-catalogo/);
  assert.doesNotMatch(chat, /body\.modo-conversa \.hero-home/);
  // o compositor que acompanha a rolagem fica: é o ganho real do modo conversa
  assert.match(chat, /body\.modo-conversa \.form-chat \{[\s\S]*?position: sticky/);
});

test('a conversa é guardada entre sessões e cada pergunta pode ser apagada', async () => {
  const chat = await le('components/Chat.astro');
  // decisão do Thiago em 06/09: guardar a conversa inteira, com o direito de apagar
  assert.match(chat, /window\.localStorage/);
  assert.doesNotMatch(chat, /window\.sessionStorage/);
  assert.match(chat, /el\('button', 'apagar-turno', 'Apagar'\)/);
  assert.match(chat, /function apagaUmTurno\(/);
  // guardar entre sessões só é aceitável com o apagar dito na privacidade
  const priv = await le('pages/privacidade.astro');
  assert.match(priv, /neste navegador/);
  assert.match(priv, /botão "Apagar"/);
  assert.doesNotMatch(priv, /Fechou a aba, acabou/);
});

test('a rolagem da tabela sobrevive à chegada de cada pedaço da resposta', async () => {
  const chat = await le('components/Chat.astro');
  // o corpo do rascunho é refeito a cada quadro; sem guardar a rolagem, a
  // tabela saltava de volta para a esquerda enquanto a pessoa a lia de lado
  const bloco = chat.match(/const desenhaRascunho = \(\) => \{[\s\S]*?\n      \};/)[0];
  assert.match(bloco, /querySelectorAll\('\.tabela-rolagem'\)[\s\S]*?scrollLeft/);
  assert.match(bloco, /tabelas\[i\]\.scrollLeft = x/);
});

test('mensagem de erro do navegador não chega à tela', async () => {
  const chat = await le('components/Chat.astro');
  // "Load failed" (Safari) subia cru quando o túnel caía no meio do fluxo
  assert.match(chat, /erro instanceof ErroConversa && erro\.message/);
  assert.match(chat, /Não consegui responder agora\. Tente perguntar de novo\./);
  const lib = await le('lib/chat.mjs');
  assert.match(lib, /A conexão caiu enquanto a resposta era escrita/);
  assert.match(lib, /e\?\.name === 'AbortError'/, 'cancelar do usuário não pode virar erro de rede');
});
