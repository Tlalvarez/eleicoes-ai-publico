#!/usr/bin/env node
/**
 * Checagem de ORIGEM da home. Roda ANTES do build, só sobre o código-fonte.
 *
 * A home é o CHAT com o acervo. Duas famílias de defeito são cobradas aqui,
 * porque as duas já aconteceram neste repositório:
 *
 * **Cobertura assimétrica.** A lista de candidatos e as perguntas de exemplo
 * têm de sair de `data/itens/resumo.json`. Elas já foram escritas à mão, com
 * cinco dos treze candidatos e um tema colado a cada nome ("O que o Fulano
 * diz sobre impostos?"). Quem entrasse pela primeira página concluiria que o
 * resto não é acompanhado, e que existe uma associação editorial entre nome e
 * tema que o dado coletado não sustenta.
 *
 * **Superfície duplicada.** A pergunta é UMA. Se a home voltar a ser uma
 * vitrine que manda para outra página de busca, o site passa a ter dois
 * campos de pergunta, dois renderizadores de resposta e dois formatos — e a
 * correção de um nunca chega no outro.
 *
 * A checagem do HTML construído é a irmã pós-build,
 * scripts/checa-home-dist.mjs.
 *
 * Uso: npm run test:home-fonte
 */
import { readFileSync } from 'node:fs';

import { leDados } from '../src/lib/dados.mjs';
import { citacoesDeCandidato } from '../src/lib/home.mjs';

// o resumo sai do manifesto da geração ativa, como o site — nunca de um
// caminho fixo (ver src/lib/dados.mjs)
const resumo = leDados('itens', 'resumo.json');
const fonte = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
// o chat mora em src/components/Chat.astro e a home o inclui: o que se cobra
// do chat (contrato da API, renderização nó a nó, permalink, compartilhar) é
// cobrado no componente; o que se cobra da HOME (lista do resumo, endereço da
// API, nenhum nome escrito à mão) segue cobrado no index.astro
const fonteChat = readFileSync(new URL('../src/components/Chat.astro', import.meta.url), 'utf8');
const fonteToda = `${fonte}\n${fonteChat}`;

const candidatos = Object.entries(resumo.candidatos);
const falhas = [];
const bloco = fonte.split('---')[1] ?? fonte;   // frontmatter do .astro

// 1. a página tem de puxar o resumo gerado, e pelo MANIFESTO da geração:
// caminho fixo prenderia a home a uma geração enquanto o resto do site anda
if (!/\bleDados\(\s*['"]itens['"]\s*,\s*['"]resumo\.json['"]\s*\)/.test(bloco)) {
  falhas.push('index.astro não lê data/itens/resumo.json por leDados() — a lista '
    + 'não tem de onde vir, ou vem de um caminho fixo fora do manifesto');
}
if (/^\s*import\s+\w+\s+from\s+['"][^'"]*data\/itens\//m.test(bloco)) {
  falhas.push('index.astro importa data/itens por caminho fixo — fora do manifesto da geração');
}

// 3. nenhum slug/nome de candidato escrito à mão na página
for (const [slug, c] of candidatos) {
  if (bloco.includes(`'${slug}'`) || bloco.includes(`"${slug}"`)) {
    falhas.push(`index.astro traz o slug '${slug}' como literal — a lista não vem do resumo.json`);
  }
  if (bloco.includes(`'${c.nome}'`) || bloco.includes(`"${c.nome}"`)) {
    falhas.push(`index.astro traz o nome '${c.nome}' como literal — a lista não vem do resumo.json`);
  }
}

// nome solto em qualquer texto da página, frontmatter ou marcação (era assim
// que as sugestões e o placeholder citavam 'o que o Fulano propõe…' sem casar
// com a checagem de literal acima). A regra vive em src/lib/home.mjs e é
// testada lá: vários sobrenomes brasileiros são substantivos comuns, e
// procurar sem caixa acusava "todos os dias" como citação de um sobrenome.
for (const { nome, trecho } of citacoesDeCandidato(
  fonteToda, candidatos.map(([, c]) => c.nome))) {
  falhas.push(`index.astro cita '${trecho}' ('${nome}') no texto da página — cobertura assimétrica`);
}

// 4. a home É o chat: campo de pergunta, cliente da conversa e renderizador
// seguro moram aqui, não numa segunda página
const exigencias = [
  [/<form[^>]*id=["']form-chat["']/, 'o chat não tem o formulário (id="form-chat")'],
  [/from\s+['"][^'"]*lib\/chat\.mjs['"]/, 'a home não usa src/lib/chat.mjs — o contrato da '
    + 'API estaria reimplementado na página'],
  [/from\s+['"][^'"]*lib\/markdown\.mjs['"]/, 'a home não usa src/lib/markdown.mjs — a '
    + 'resposta estaria sendo renderizada por outro caminho'],
  [/from\s+['"][^'"]*lib\/permalink\.mjs['"]/, 'a home não usa src/lib/permalink.mjs — não '
    + 'haveria permalink do resultado'],
  [/from\s+['"][^'"]*lib\/compartilhar\.mjs['"]/, 'a home não usa src/lib/compartilhar.mjs '
    + '— os formatos de compartilhamento estariam duplicados na página'],
];
if (!/<Chat\b[^>]*apiBase=\{apiBase\}/.test(fonte)) {
  falhas.push('index.astro não inclui o componente <Chat apiBase={apiBase}> — a home deixou de ser o chat');
}
for (const [regra, mensagem] of exigencias) {
  if (!regra.test(fonteToda)) falhas.push(mensagem);
}

// 5. a resposta NUNCA é montada por string de marcação
for (const perigo of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
  if (fonteToda.includes(perigo)) {
    falhas.push(`index.astro usa ${perigo} — a resposta vem de terceiro e tem de ser `
      + 'materializada nó a nó (src/lib/markdown.mjs)');
  }
}

// 7. o endereço do serviço de evidências não pode cair em localhost no build
// público. O padrão anterior era `http://localhost:8765`: publicado, ele faz o
// navegador do VISITANTE procurar o serviço na máquina dele — que responde
// nada, ou pior, responde outra coisa — e ainda é http dentro de página https,
// bloqueado como conteúdo misto. O padrão de produção é MESMA ORIGEM ('').
const linhaApi = bloco.match(/^.*PUBLIC_PESQUISA_API.*$/m)?.[0] ?? '';
if (!linhaApi) {
  falhas.push('index.astro não declara PUBLIC_PESQUISA_API — o chat não tem endereço');
} else if (/localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(linhaApi)
           && !/import\.meta\.env\.DEV/.test(linhaApi)) {
  falhas.push('index.astro usa localhost como padrão do serviço de evidências sem '
    + 'restringir a `import.meta.env.DEV` — o build público apontaria para a máquina '
    + 'de quem visita');
}

// 8. a conversa corrente vive na HOME, e o endereço da página diz isso.
//
// A versão anterior reescrevia a barra de endereço para o permalink do último
// resultado. Com a resposta ganhando rota própria (`/resposta/<id>`), repetir
// esse gesto seria pior: recarregar ou apertar "voltar" levaria a uma página
// avulsa, sem a conversa que estava na tela. O único endereço que a home pode
// escrever é o dela.
// Exceção única: a página da conversa (`/?resposta=<id>`, via `caminhoPagina`),
// que É a home carregando a resposta guardada — recarregar volta ao mesmo lugar.
for (const m of fonteToda.matchAll(/history\.(replaceState|pushState)\s*\(([^)]*)\)/g)) {
  if (!/location\.pathname|\bpagina\b/.test(m[2])) {
    falhas.push(`index.astro chama history.${m[1]} com um endereço que não é o da própria `
      + 'home — a conversa corrente deixaria de estar no endereço em que ela está');
  }
}

// 6. a home não pode mandar a pergunta para outra superfície
for (const escondida of ['/candidato', '/acervo']) {
  if (new RegExp(`href=["'\`]\\${escondida}(?:[/"'\`?#]|$)`).test(fonteToda)) {
    falhas.push(`a home linka ${escondida} — a seção está escondida (menu por cargo; retrato leva ao TSE)`);
  }
}
if (/href=["']\/pesquisa/.test(fonteToda)) {
  falhas.push('index.astro ainda linka /pesquisa — a home é o chat, e uma segunda '
    + 'superfície de pergunta volta a duplicar campo, renderizador e formato');
}

if (falhas.length) {
  console.error('FALHOU (origem):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (origem): a home é o chat e deriva os candidatos dos `
  + `${candidatos.length} candidatos de data/itens/resumo.json`);
