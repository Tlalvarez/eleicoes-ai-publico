/**
 * Base comum de leitura dos dados gerados pelo harness.
 *
 * As páginas usavam `import.meta.glob(..., { eager: true })`, que carrega o
 * diretório inteiro em memória em toda rota. Aqui cada página abre só o JSON
 * de que precisa, com `node:fs`, fora do grafo de módulos do Vite — o pico de
 * memória do build passa a ser o do maior arquivo, não o do conjunto.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A raiz do projeto, derivada de ONDE ESTE MÓDULO ESTÁ (src/lib/dados.mjs),
 * não de onde alguém o chamou.
 *
 * Era `process.cwd()` + busca ascendente por um `data/<sub>/<marcador>`. Isso
 * amarrava o build ao diretório de execução — chamar de /tmp, ou por uma
 * ferramenta de monorepo que roda da raiz do workspace, quebrava com
 * "não encontrado" mesmo com o projeto inteiro no lugar — e, pior, a subida
 * podia casar em silêncio um `data/` homônimo de um ancestral, publicando
 * dado de outro projeto sem uma linha de aviso.
 */
export const RAIZ_PROJETO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function leJson(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8'));
}

/** Lê um JSON que pode não existir — reproduz o `?? padrao` dos globs. */
export function leJsonOuPadrao(caminho, padrao, ler = leJson) {
  if (!existsSync(caminho)) return padrao;
  return ler(caminho) ?? padrao;
}

/**
 * O MANIFESTO da geração ativa (`data/current.json`), ou null.
 *
 * É o mesmo ponteiro que a pesquisa resolve. Os três produtos da rodada —
 * itens, acervo e índice — nascem sob `data/geracoes/<id>/` e viram públicos
 * pela troca deste arquivo. Antes disso, o site lia dois diretórios fixos
 * promovidos por exportações independentes: cada uma atômica em si, e o
 * conjunto mesmo assim incoerente (itens de uma geração, acervo de outra).
 *
 * null NÃO é erro: enquanto a migração operacional não acontecer, não existe
 * `current.json` e o caminho legado continua valendo, inalterado.
 */
export function leManifesto(raiz = RAIZ_PROJETO) {
  const caminho = join(resolve(raiz), 'data', 'current.json');
  if (!existsSync(caminho)) return null;
  const dados = JSON.parse(readFileSync(caminho, 'utf8'));
  return dados && dados.geracao ? dados : null;
}

/**
 * Diretório de um produto — o da geração ativa, ou o legado `data/<sub>`.
 *
 * `marcador` é o arquivo que prova que é o diretório certo; ausente, o erro
 * diz exatamente qual caminho foi procurado, em vez de subir atrás de outro.
 * Manifesto apontando para geração que não existe é ERRO: publicar o site com
 * o ponteiro quebrado seria servir a geração anterior sem ninguém saber.
 */
export function raizDados(sub, marcador, raiz = RAIZ_PROJETO) {
  const base = resolve(raiz);
  const manifesto = leManifesto(base);
  // os caminhos do manifesto são relativos ao próprio `data/`, para a árvore
  // de gerações poder ser movida inteira sem reescrever o ponteiro
  const alvo = join(base, 'data', manifesto?.[sub] ?? sub);
  if (!existsSync(join(alvo, marcador))) {
    throw new Error(`${join(alvo, marcador)} não encontrado — `
      + (manifesto
        ? `a geração ativa é '${manifesto.geracao}' (data/current.json) e o `
          + `produto '${sub}' dela não está em disco`
        : `os dados de data/${sub} são gerados pelo harness `
          + `(exporta_itens.py / exporta_acervo.py) antes do build`));
  }
  return alvo;
}

/** Abre um arquivo de um produto pela resolução acima — o atalho das páginas. */
export function leDados(sub, nome, raiz = RAIZ_PROJETO) {
  return leJson(join(raizDados(sub, nome, raiz), nome));
}
