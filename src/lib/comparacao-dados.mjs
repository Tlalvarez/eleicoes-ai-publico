/**
 * Leitura dos dados de comparação exportados pelo harness (v3/exporta_site.py).
 *
 * `data/comparacao/` é VERSIONADO: o site compila de um clone limpo, sem o
 * harness e sem S3. Um arquivo por página (tema) e por escopo:
 *   data/comparacao/paginas.json                    a lista de páginas
 *   data/comparacao/presidente/<pagina>.json
 *   data/comparacao/governador/<uf>/<pagina>.json   (uf em minúsculas)
 *
 * Escopo sem arquivo nenhum é "em preparação": a rota existe, a página diz
 * que a comparação ainda não está pronta.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTRATO = 'comparacao-site/1';
export const RAIZ_PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PASTA = join(RAIZ_PROJETO, 'data', 'comparacao');

const le = (caminho) => JSON.parse(readFileSync(caminho, 'utf8'));

/**
 * As páginas (temas consolidados), na ordem editorial. A lista é POR CARGO:
 * governador tem a sua taxonomia (decisão do Thiago em 13/09) em
 * `<cargo>/paginas.json`; presidente é a lista geral, `paginas.json`, que
 * também serve de fallback para um cargo sem lista própria.
 */
export function paginas(raiz = PASTA, cargo = 'presidente') {
  const propria = join(raiz, cargo, 'paginas.json');
  if (cargo !== 'presidente' && existsSync(propria)) return le(propria).paginas;
  return le(join(raiz, 'paginas.json')).paginas;
}

export function paginaPorId(id, raiz = PASTA, cargo = 'presidente') {
  return paginas(raiz, cargo).find((p) => p.id === id) ?? null;
}

/** A pasta de um escopo: presidente, ou governador/<uf>. */
export function pastaDoEscopo(cargo, uf = null, raiz = PASTA) {
  return uf ? join(raiz, cargo, String(uf).toLowerCase()) : join(raiz, cargo);
}

/** Ids das páginas com comparação pronta neste escopo, na ordem de paginas.json. */
export function paginasProntas(cargo, uf = null, raiz = PASTA) {
  const pasta = pastaDoEscopo(cargo, uf, raiz);
  if (!existsSync(pasta)) return [];
  const prontas = new Set(readdirSync(pasta).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)));
  return paginas(raiz, cargo).filter((p) => prontas.has(p.id)).map((p) => p.id);
}

/** As UFs (minúsculas) com ao menos uma página pronta para o cargo. */
export function ufsProntas(cargo, raiz = PASTA) {
  const pasta = join(raiz, cargo);
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta, { withFileTypes: true })
    .filter((e) => e.isDirectory() && paginasProntas(cargo, e.name, raiz).length)
    .map((e) => e.name).sort();
}

/** O JSON de uma página, validado pelo contrato; `null` se não existe. */
export function comparacao(cargo, uf, pagina, raiz = PASTA) {
  const caminho = join(pastaDoEscopo(cargo, uf, raiz), `${pagina}.json`);
  if (!existsSync(caminho)) return null;
  const d = le(caminho);
  if (d.contrato !== CONTRATO) {
    throw new Error(`${caminho}: contrato '${d.contrato}', esperado '${CONTRATO}'`);
  }
  for (const campo of ['pagina', 'nome', 'titulo', 'candidatos', 'propostas', 'blocos']) {
    if (!(campo in d)) throw new Error(`${caminho}: falta o campo '${campo}'`);
  }
  return d;
}

/** Resumo por página (para os índices): propostas, candidatos, discordâncias. */
export function resumoDoEscopo(cargo, uf = null, raiz = PASTA) {
  return paginasProntas(cargo, uf, raiz).map((id) => {
    const d = comparacao(cargo, uf, id, raiz);
    const ordem = d.candidatos.map((c) => c.slug);
    const unanimes = d.propostas.filter((p) => p.n_concorda === ordem.length).length;
    const comContra = d.propostas.filter((p) => Object.values(p.posicoes).some((v) => v.posicao === 'discorda')).length;
    return { id, nome: d.nome, titulo: d.titulo, propostas: d.propostas.length, candidatos: d.candidatos, unanimes, comContra };
  });
}
