#!/usr/bin/env node
/**
 * A porta da medição continua sendo UMA. Roda antes do build, sobre a origem.
 *
 * `src/lib/medicao.mjs` garante, por filtro, que nenhum texto livre chega ao
 * PostHog (ver test/medicao.test.mjs). A garantia vale enquanto TODA medição
 * passar por ele. Um `posthog.capture('pergunta', { texto })` escrito direto
 * numa página fura o filtro sem quebrar teste nenhum, e o vazamento só
 * apareceria meses depois, num painel, com a pergunta de alguém dentro.
 *
 * Por isso este gate cobra três coisas do código-fonte:
 *
 *   1. `posthog.capture` só existe dentro de `src/lib/medicao.mjs`;
 *   2. todo `medir('<evento>')` usa um evento declarado em `EVENTOS` —
 *      evento com nome trocado seria descartado em silêncio no navegador;
 *   3. todo evento declarado tem pelo menos um chamador — vocabulário que
 *      ninguém emite vira painel vazio que parece medida zerada.
 *
 * Uso: npm run test:medicao
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EVENTOS } from '../src/lib/medicao.mjs';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORTA = join(RAIZ, 'src', 'lib', 'medicao.mjs');
const EXTENSOES = new Set(['.astro', '.mjs', '.js', '.ts']);

function arquivos(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (EXTENSOES.has(extname(caminho))) saida.push(caminho);
  }
  return saida;
}

const falhas = [];
const emitidos = new Set();
const fontes = [...arquivos(join(RAIZ, 'src')), ...arquivos(join(RAIZ, 'functions'))];

for (const caminho of fontes) {
  const texto = readFileSync(caminho, 'utf8');
  const onde = relative(RAIZ, caminho);

  // 1. a porta é uma só. O `medicao.mjs` é o único que fala com o PostHog;
  //    o Base.astro inicializa o SDK (`posthog.init`), o que é outra coisa.
  if (caminho !== PORTA && /\bposthog\s*\.\s*capture\s*\(/.test(texto)) {
    falhas.push(`${onde}: chama posthog.capture direto — use medir() de src/lib/medicao.mjs, `
      + 'que é onde o filtro de conteúdo vive');
  }

  // a própria porta declara `medir(evento, ...)`: conferir o vocabulário
  // dentro dela cobraria a definição como se fosse chamada
  if (caminho === PORTA) continue;

  // 2. o nome do evento tem de existir no vocabulário
  for (const m of texto.matchAll(/\bmedir\(\s*(['"`])([^'"`]*)\1/g)) {
    const evento = m[2];
    emitidos.add(evento);
    if (!EVENTOS[evento]) {
      falhas.push(`${onde}: medir('${evento}') não está em EVENTOS — o navegador `
        + 'descartaria o evento em silêncio');
    }
  }
  // medir() com nome montado em variável não é conferível aqui
  if (/\bmedir\(\s*[^'"`)\s]/.test(texto)) {
    falhas.push(`${onde}: medir() com nome de evento que não é literal — o gate não `
      + 'consegue conferir o vocabulário');
  }
}

// 3. vocabulário sem chamador
for (const evento of Object.keys(EVENTOS)) {
  if (!emitidos.has(evento)) {
    falhas.push(`EVENTOS declara '${evento}', mas nada o emite — painel vazio parece `
      + 'medida zerada, não medida ausente');
  }
}

if (falhas.length) {
  console.error('FALHOU (medição):\n  ' + falhas.join('\n  '));
  process.exit(1);
}
console.log(`OK (medição): ${Object.keys(EVENTOS).length} eventos declarados, todos emitidos, `
  + `e posthog.capture só em src/lib/medicao.mjs (${fontes.length} arquivos conferidos)`);
