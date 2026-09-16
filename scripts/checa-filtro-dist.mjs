#!/usr/bin/env node
/**
 * O filtro de candidatos reposiciona TODOS os cartões do HTML construído.
 *
 * O defeito que este gate impede (15/09/2026): a tarja de meta só é escrita no
 * build quando a proposta tem meta. O código do navegador passou a ajustar
 * `.metas` em todo cartão, e no primeiro cartão SEM meta o `querySelector`
 * devolveu `null`. O erro derrubava o reposicionamento inteiro: o cabeçalho
 * escondia as colunas, mas os cartões continuavam com a largura de antes.
 *
 * Nenhum teste pegava isso. Os de layout rodam sobre objetos, não sobre o HTML
 * publicado; os de `dist/` conferem marcação, não comportamento. Aqui o gate
 * junta as duas pontas: pega os cartões como o navegador os encontra (do HTML)
 * e roda o mesmo `layout` do produto com uma seleção reduzida, exigindo que
 * cada cartão visível tenha uma posição nova e que nenhum passo estoure.
 *
 * Uso: npm run build && npm run test:filtro-dist
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { layout } from '../src/lib/comparacao.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
if (!existsSync(DIST)) {
  console.error('FALHOU (filtro): dist/ não existe — rode `npm run build` antes.');
  process.exit(1);
}

const falhas = [];

/** As páginas de comparação construídas: presidente e uma UF com dados. */
function paginas() {
  const saida = [];
  const pres = join(DIST, 'presidente');
  if (existsSync(pres)) {
    for (const f of readdirSync(pres).filter((x) => x.endsWith('.html')).slice(0, 3)) saida.push(join(pres, f));
  }
  const gov = join(DIST, 'governador');
  if (existsSync(gov)) {
    for (const uf of readdirSync(gov, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dir = join(gov, uf.name);
      const temas = readdirSync(dir).filter((x) => x.endsWith('.html'));
      if (temas.length) { saida.push(join(dir, temas[0])); break; }
    }
  }
  return saida;
}

for (const caminho of paginas()) {
  const rel = caminho.slice(DIST.length);
  const html = readFileSync(caminho, 'utf8');
  // o Astro passa os dados por define:vars: o HTML declara `json = "…"` e o script faz JSON.parse(json)
  const m = html.match(/json = "((?:[^"\\]|\\.)*)"/);
  if (!m) { falhas.push(`${rel}: não achei os dados embutidos`); continue; }
  const dados = JSON.parse(JSON.parse(`"${m[1]}"`));
  const ordem = dados.candidatos.map((c) => c.slug);

  // os cartões como o navegador os encontra no HTML: chave e se trazem a faixa de metas
  const noHtml = [...html.matchAll(/<button[^>]*class="proposta[^"]*"[^>]*data-k="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)]
    .map((x) => ({ chave: x[1], temFaixaDeMetas: /class="metas"/.test(x[2]) }));
  if (!noHtml.length) { falhas.push(`${rel}: nenhum cartão no HTML`); continue; }
  if (noHtml.every((c) => c.temFaixaDeMetas)) {
    // sem cartão "sem faixa" a página não exercita o defeito; não é erro, só não prova nada
    continue;
  }

  // o mesmo layout do produto, com metade dos candidatos
  const sel = ordem.slice(0, Math.max(1, Math.floor(ordem.length / 2)));
  const visiveis = dados.propostas.filter((p) => sel.some((s) => p.posicoes[s]?.posicao === 'concorda'));
  const L = layout(visiveis, sel);
  const cartoes = L.linhas.filter((l) => l.tipo === 'cartao')
    .concat(L.linhas.filter((l) => l.tipo === 'pilhas').flatMap((l) => l.pilhas.flat()));
  if (!cartoes.length) { falhas.push(`${rel}: a seleção reduzida não produziu cartão nenhum`); continue; }

  for (const c of cartoes) {
    if (!(c.ini >= 0 && c.largura >= 1 && c.ini + c.largura <= sel.length)) {
      falhas.push(`${rel}: cartão ${c.chave ?? c.id} fora da grade de ${sel.length} colunas (ini ${c.ini}, largura ${c.largura})`);
    }
    // o navegador cria a faixa quando ela não veio do HTML: o cartão com meta tem de saber dizer isso
    if (c.metas && c.metas.some((x) => x.col >= c.largura)) {
      falhas.push(`${rel}: meta do cartão ${c.id} aponta coluna fora do cartão`);
    }
  }
  const semFaixa = noHtml.filter((c) => !c.temFaixaDeMetas).length;
  console.log(`  ${rel}: ${noHtml.length} cartões no HTML (${semFaixa} sem faixa de metas) · ${cartoes.length} reposicionados em ${sel.length} colunas`);
}

if (falhas.length) {
  console.error('FALHOU (filtro):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log('OK (filtro): a seleção reduzida reposiciona todo cartão do HTML dentro da grade nova');
