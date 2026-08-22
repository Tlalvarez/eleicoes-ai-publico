/**
 * Leitura de data/itens arquivo a arquivo — o que as páginas de candidato
 * precisam.
 *
 * As páginas de candidato carregavam `data/itens/*\/*.json` com eager:true:
 * 47 arquivos / 14,4 MB em cada rota, para usar um ou os anos de um único
 * candidato. Medido nesta máquina, JSON parseado custa ~4,1× o tamanho em
 * disco — ~60 MB de objetos vivos por nada. Aqui cada página abre só o(s)
 * arquivo(s) daquele candidato.
 *
 * `ler` é injetável só para os testes afirmarem QUAIS arquivos foram
 * abertos; as páginas usam o padrão.
 */
import { join } from 'node:path';
import { leJson, leJsonOuPadrao, raizDados } from './dados.mjs';

export { leJson } from './dados.mjs';

/** Posts de rede — listados como contadores, não item a item. */
export const TIPOS_POST = ['post-x', 'post-instagram'];

export function raizItens(raiz) {
  return raizDados('itens', 'resumo.json', raiz);
}

/** Os anos do arquivo do candidato: '0000' (sem data) não vira página. */
export function anosDoArquivo(c) {
  return c.anos.filter((a) => a !== '0000');
}

/** Itens de um ano do candidato; [] quando o ano não tem arquivo. */
export function carregaAnoItens(raiz, slug, ano, ler = leJson) {
  return leJsonOuPadrao(join(raiz, slug, `${ano}.json`), [], ler);
}

/** A janela recente do candidato; [] quando não existe. */
export function carregaRecentes(raiz, slug, ler = leJson) {
  return leJsonOuPadrao(join(raiz, slug, 'recentes.json'), [], ler);
}

/** Contadores por ano do arquivo de 5 anos — um arquivo por vez. */
export function resumoPorAno(raiz, slug, anos, { ler = leJson } = {}) {
  return anos.map((ano) => {
    const propria = carregaAnoItens(raiz, slug, ano, ler).filter((i) => i.voz !== 'terceiro');
    const posts = propria.filter((i) => TIPOS_POST.includes(i.tipo)).length;
    return { ano, total: propria.length, posts, longos: propria.length - posts };
  });
}

/** Menções de terceiros do candidato, em todos os anos — um arquivo por vez. */
export function mencoesDoCandidato(raiz, slug, anos, { ler = leJson } = {}) {
  return anos.flatMap((ano) =>
    carregaAnoItens(raiz, slug, ano, ler).filter((i) => i.voz === 'terceiro'));
}
