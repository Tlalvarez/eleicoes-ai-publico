#!/usr/bin/env node
/**
 * Calcula, uma vez, o vetor de cada consulta do gabarito da busca
 * (test/busca-gabarito.json) com o mesmo modelo dos documentos, e grava em
 * test/busca-gabarito-vetores.json. Assim o teste de recall roda offline e
 * determinístico. Rode de novo quando o gabarito ou o modelo mudar.
 *
 * Uso: NATIVEPORT_API_KEY=… node scripts/vetores-do-gabarito.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = new URL('..', import.meta.url);
const gabarito = JSON.parse(readFileSync(new URL('test/busca-gabarito.json', RAIZ), 'utf8'));
const indice = JSON.parse(readFileSync(new URL('data/busca/presidente/indice.json', RAIZ), 'utf8'));
const chave = process.env.NATIVEPORT_API_KEY;
if (!chave) { console.error('NATIVEPORT_API_KEY não definida'); process.exit(1); }

const consultas = gabarito.consultas.map((c) => c.q);
const r = await fetch('https://api.nativeport.ai/jina/embeddings', {
  method: 'POST',
  headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', 'User-Agent': 'eleicoes-ai-site/1 (+https://eleicoes.ai)' },
  body: JSON.stringify({ model: indice.modelo, task: indice.task_consulta, dimensions: indice.dimensoes, input: consultas }),
});
if (!r.ok) { console.error(`jina: HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
const d = await r.json();
const vetores = {};
for (const item of d.data) vetores[consultas[item.index]] = item.embedding.map((x) => Number(x.toFixed(5)));
writeFileSync(new URL('test/busca-gabarito-vetores.json', RAIZ), JSON.stringify({
  modelo: indice.modelo, task: indice.task_consulta, dimensoes: indice.dimensoes, tokens: d.usage?.total_tokens ?? null, vetores,
}) + '\n');
console.log(`${consultas.length} consultas vetorizadas · tokens ${d.usage?.total_tokens}`);
