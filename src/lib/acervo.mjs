/**
 * Leitura do acervo arquivo a arquivo.
 *
 * As páginas do acervo usavam `import.meta.glob('data/acervo/*\/*\/*.json',
 * { eager: true })`. Esse padrão casa também com `<slug>/itens/*.json`: no
 * acervo dos cinco candidatos são 1.592 arquivos / 112 MB carregados por
 * inteiro em CADA rota — o build morreu por OOM (kernel matou o node, sem
 * swap na máquina). Aqui as rotas saem do indice.json (4 KB) e cada página
 * abre só o JSON de que precisa, então o pico de memória passa a ser o do
 * maior arquivo, não o do acervo inteiro.
 *
 * `ler` é injetável só para os testes conseguirem afirmar QUAIS arquivos
 * foram abertos; as páginas usam o padrão.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { leJson, leJsonOuPadrao, raizDados } from './dados.mjs';

export { leJson } from './dados.mjs';

/** Tipos que ganham página por mês quando o ano passa do limite. */
export const TIPOS_PAGINADOS = ['post-x', 'post-instagram'];

/** Achado da revisão: 3.340 itens numa página = 3,9 MB / 596 telas no celular. */
export const LIMITE_PAGINA = 400;

export function raizAcervo(raiz) {
  return raizDados('acervo', 'indice.json', raiz);
}

/** Mês 'MM' do item, ou '00' quando não tem data. */
export function mesDoItem(item) {
  return item.data ? item.data.slice(5, 7) : '00';
}

/** O rollup de um ano: [] quando o arquivo não existe. */
export function carregaAno(raiz, slug, tipo, ano, ler = leJson) {
  return leJsonOuPadrao(join(raiz, slug, tipo, `${ano}.json`), [], ler);
}

/** A transcrição de um item. */
export function carregaItem(raiz, slug, id, ler = leJson) {
  return ler(join(raiz, slug, 'itens', `${id}.json`));
}

/**
 * Este ano vira índice de meses? Mesma regra usada para gerar as rotas
 * mensais — as duas pontas têm de concordar, senão a página do ano lista mês
 * que não existe (ou esconde mês que existe).
 */
export function ehPaginadoPorMes(tipo, itens, limite = LIMITE_PAGINA) {
  return TIPOS_PAGINADOS.includes(tipo) && itens.length > limite;
}

/** Rotas /acervo/[slug]/[tipo]/[ano] — só do índice, sem abrir arquivo. */
export function rotasAno(indice) {
  return Object.entries(indice.candidatos).flatMap(([slug, c]) =>
    Object.entries(c.tipos).flatMap(([tipo, d]) =>
      Object.keys(d.anos).map((ano) => ({ params: { slug, tipo, ano } }))));
}

/** Rotas /acervo/[slug]/item/[id] — nomes de arquivo, sem ler o conteúdo. */
export function rotasItem(raiz) {
  const rotas = [];
  for (const slug of readdirSync(raiz, { withFileTypes: true })) {
    if (!slug.isDirectory()) continue;
    const dirItens = join(raiz, slug.name, 'itens');
    if (!existsSync(dirItens)) continue;
    for (const arq of readdirSync(dirItens)) {
      if (!arq.endsWith('.json')) continue;
      rotas.push({ params: { slug: slug.name, id: arq.slice(0, -'.json'.length) } });
    }
  }
  return rotas;
}

/**
 * Rotas /acervo/[slug]/[tipo]/[ano]/[mes].
 *
 * Abre um arquivo por vez e só os anos de tipo paginado — nunca transcrição,
 * nunca vídeo. O arquivo é descartado assim que os meses saem dele.
 */
export function rotasMes(raiz, indice, { limite = LIMITE_PAGINA, ler = leJson } = {}) {
  const rotas = [];
  for (const [slug, c] of Object.entries(indice.candidatos)) {
    for (const [tipo, d] of Object.entries(c.tipos)) {
      if (!TIPOS_PAGINADOS.includes(tipo)) continue;
      for (const ano of Object.keys(d.anos)) {
        const itens = carregaAno(raiz, slug, tipo, ano, ler);
        if (!ehPaginadoPorMes(tipo, itens, limite)) continue;
        for (const mes of new Set(itens.map(mesDoItem))) {
          rotas.push({ params: { slug, tipo, ano, mes } });
        }
      }
    }
  }
  return rotas;
}
