/**
 * Implementação de REFERÊNCIA — o "antes" das páginas de candidato.
 *
 * Reproduz, lendo tudo de uma vez, o que os import.meta.glob eager faziam:
 *   import.meta.glob('.../data/itens/*\/*.json', { eager: true })
 *   import.meta.glob('.../data/itens/*\/recentes.json', { eager: true })
 *
 * Só para os testes de equivalência: o "depois" (src/lib/itens.mjs, um
 * arquivo por vez) tem de devolver exatamente o mesmo conteúdo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Todos os JSONs em <raiz>/*\/*.json, carregados de uma vez (o eager). */
export function globEagerItens(raiz) {
  const mapa = {};
  for (const slug of readdirSync(raiz)) {
    const dir = join(raiz, slug);
    if (!statSync(dir).isDirectory()) continue;
    for (const arq of readdirSync(dir)) {
      if (!arq.endsWith('.json')) continue;
      mapa[`data/itens/${slug}/${arq}`] = {
        default: JSON.parse(readFileSync(join(dir, arq), 'utf8')),
      };
    }
  }
  return mapa;
}

/** Corpo original de candidato/[slug]/arquivo.astro. */
export function porAnoAntes(raiz, slug, c) {
  const anosMod = globEagerItens(raiz);
  return c.anos.filter((a) => a !== '0000').map((ano) => {
    const itens = anosMod[`data/itens/${slug}/${ano}.json`]?.default ?? [];
    const propria = itens.filter((i) => i.voz !== 'terceiro');
    const posts = propria.filter((i) => i.tipo === 'post-x' || i.tipo === 'post-instagram').length;
    return { ano, total: propria.length, posts, longos: propria.length - posts };
  });
}

/** Corpo original de candidato/[slug]/arquivo/[ano].astro. */
export function itensDoAnoAntes(raiz, slug, ano) {
  const anosMod = globEagerItens(raiz);
  return (anosMod[`data/itens/${slug}/${ano}.json`]?.default ?? [])
    .filter((i) => i.voz !== 'terceiro');
}

/** Corpo original de candidato/[slug]/mencoes.astro. */
export function mencoesAntes(raiz, slug, c) {
  const anosMod = globEagerItens(raiz);
  return c.anos.flatMap((ano) =>
    (anosMod[`data/itens/${slug}/${ano}.json`]?.default ?? [])
      .filter((i) => i.voz === 'terceiro'));
}

/** Corpo original de candidato/[slug]/index.astro e voz.astro. */
export function recentesAntes(raiz, slug) {
  const recentesMod = globEagerItens(raiz);
  return recentesMod[`data/itens/${slug}/recentes.json`]?.default ?? [];
}
