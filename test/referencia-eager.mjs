/**
 * Implementação de REFERÊNCIA — o "antes".
 *
 * Reproduz, lendo tudo de uma vez, exatamente o que os import.meta.glob
 * eager das páginas do acervo faziam:
 *   import.meta.glob('.../data/acervo/*\/*\/*.json', { eager: true })
 *   import.meta.glob('.../data/acervo/*\/itens/*.json')
 *
 * Serve só para os testes de equivalência: as rotas do "depois" (leitura
 * arquivo a arquivo) têm de bater com as deste módulo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Todos os JSONs em <raiz>/*\/*\/*.json, carregados de uma vez (o eager). */
export function globEager(raiz) {
  const mapa = {};
  for (const slug of readdirSync(raiz)) {
    const dirSlug = join(raiz, slug);
    if (!statSync(dirSlug).isDirectory()) continue;
    for (const tipo of readdirSync(dirSlug)) {
      const dirTipo = join(dirSlug, tipo);
      if (!statSync(dirTipo).isDirectory()) continue;
      for (const arq of readdirSync(dirTipo)) {
        if (!arq.endsWith('.json')) continue;
        const chave = `data/acervo/${slug}/${tipo}/${arq}`;
        mapa[chave] = { default: JSON.parse(readFileSync(join(dirTipo, arq), 'utf8')) };
      }
    }
  }
  return mapa;
}

/** getStaticPaths original de acervo/[slug]/[tipo]/[ano]/[mes].astro. */
export function rotasMesAntes(raiz, limite = 400) {
  const dados = globEager(raiz);
  const caminhos = [];
  for (const [caminho, mod] of Object.entries(dados)) {
    const m = caminho.match(/data\/acervo\/([^/]+)\/([^/]+)\/(\d{4}|0000)\.json$/);
    if (!m || !['post-x', 'post-instagram'].includes(m[2])) continue;
    const itens = mod.default ?? [];
    if (itens.length <= limite) continue;
    const meses = new Set(itens.map((i) => (i.data ? i.data.slice(5, 7) : '00')));
    for (const mes of meses) {
      caminhos.push({ params: { slug: m[1], tipo: m[2], ano: m[3], mes } });
    }
  }
  return caminhos;
}

/** getStaticPaths original de acervo/[slug]/item/[id].astro. */
export function rotasItemAntes(raiz) {
  const chaves = Object.keys(globEager(raiz))
    .filter((c) => /data\/acervo\/[^/]+\/itens\/.+\.json$/.test(c));
  return chaves.map((caminho) => {
    const [, slug, , arquivo] = caminho.match(/data\/acervo\/([^/]+)\/(itens)\/(.+)\.json$/) ?? [];
    return { params: { slug, id: arquivo } };
  }).filter((p) => p.params.slug);
}

/** Corpo original da página mensal: pega o ano no mapa eager e filtra o mês. */
export function itensDoMesAntes(raiz, slug, tipo, ano, mes) {
  const dados = globEager(raiz);
  const todos = dados[`data/acervo/${slug}/${tipo}/${ano}.json`]?.default ?? [];
  return todos.filter((i) => (i.data ? i.data.slice(5, 7) : '00') === mes);
}
