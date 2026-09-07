#!/usr/bin/env node
/**
 * Checagem de CARGOS no artefato: o menu promete, o `dist` entrega.
 *
 * `src/lib/cargos.mjs` é a autoridade do menu e das rotas. Um cargo entra ali
 * e o cabeçalho passa a linkar para ele em toda página do site — mas nada,
 * até aqui, conferia que a página linkada existe no artefato que sobe. O
 * menu-cargos.test.mjs confere a FONTE (que o layout deriva a lista e que os
 * arquivos de rota existem); este confere o PRODUTO.
 *
 * O que ele pega: cargo no menu sem página construída, UF faltando na grade
 * dos 27, e página de conversa que subiu sem o chat ou com o escopo errado
 * embutido (`data-cargo`/`data-uf` são o que o cliente manda ao serviço — sair
 * errado dali é perguntar sobre um conjunto de candidatos e mostrar outro).
 *
 * O que ele NÃO pega, e não tenta: se a GERAÇÃO por trás do artefato é a
 * certa. Isso é do deploy (`harness/scripts/deploy-site.sh`), que exige
 * `data/current.json` oficial e confere `dist/release.json` contra o ponteiro
 * antes de qualquer upload — inclusive no caminho `--somente-codigo`.
 *
 * Uso: npm run test:cargos-dist [raiz-do-projeto]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CARGOS, UFS, caminhoUf } from '../src/lib/cargos.mjs';

const RAIZ = resolve(process.argv[2] ?? dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');

if (!existsSync(DIST)) {
  console.error('FALHOU (cargos): não há dist/ — rode `npm run build` antes');
  process.exit(1);
}

/** O arquivo que a Pages serve para uma rota (`build.format: 'file'`). */
function arquivoDaRota(rota) {
  const limpa = rota.replace(/^\/+/, '');
  return limpa === '' ? join(DIST, 'index.html') : join(DIST, `${limpa}.html`);
}

const falhas = [];
const exige = (condicao, mensagem) => { if (!condicao) falhas.push(mensagem); };

/** A rota existe no artefato e traz o chat com este escopo embutido? */
function conferePagina(rota, { cargo, uf = '' }) {
  const arquivo = arquivoDaRota(rota);
  if (!existsSync(arquivo)) {
    exige(false, `${rota}: o menu leva a esta página e ela não está no dist`);
    return;
  }
  const html = readFileSync(arquivo, 'utf8');
  exige(html.includes('<section class="chat"'),
    `${rota}: a página subiu sem a conversa`);
  exige(html.includes(`data-cargo="${cargo}"`),
    `${rota}: o chat não declara data-cargo="${cargo}"`);
  if (uf) {
    exige(html.includes(`data-uf="${uf}"`),
      `${rota}: o chat não declara data-uf="${uf}"`);
  }
}

let paginas = 0;
for (const cargo of CARGOS) {
  if (!cargo.porUF) {
    conferePagina(cargo.href, { cargo: cargo.slug });
    paginas += 1;
    continue;
  }
  // a página de escolha da UF não tem chat: basta existir
  exige(existsSync(arquivoDaRota(cargo.href)),
    `${cargo.href}: o menu leva à escolha de estado e ela não está no dist`);
  paginas += 1;
  for (const uf of UFS) {
    conferePagina(caminhoUf(cargo, uf), { cargo: cargo.slug, uf: uf.sigla });
    paginas += 1;
  }
}

if (falhas.length) {
  console.error(`FALHOU (cargos):\n  ${falhas.join('\n  ')}`);
  process.exit(1);
}
console.log(`OK (cargos): ${paginas} páginas no dist para os ${CARGOS.length} cargos do menu `
  + `(${CARGOS.map((c) => c.nome).join(', ')}), cada conversa com o próprio escopo embutido`);
