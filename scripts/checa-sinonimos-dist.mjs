/**
 * Portão: nenhum conjunto de sinônimos pode descrever outro cartão em vez do seu.
 *
 * A terceira auditoria do ChatGPT (19/09/2026) leu o índice de assuntos publicado e viu, no assunto
 * "Soberania monetária", os termos "vants, veículos aéreos não tripulados, facções criminosas,
 * monitoramento aéreo". Eram os sinônimos do cartão "Reduzir a dependência do dólar": o modelo respondeu
 * sobre outra proposta, e nada no caminho percebeu — os sinônimos entram na busca do site E no índice que
 * o assistente lê. Em presidente eram 93 cartões, 11 deles sem relação nenhuma com os próprios termos.
 *
 * A medida usa o que já está publicado, sem chamar modelo: o vetor de cada proposta e o do seu conjunto de
 * termos. Termo que não tem relação com a própria proposta (cosseno < LIMIAR) reprova. O corte é frouxo de
 * propósito: sinônimo bom é justamente o que NÃO repete as palavras da proposta ("autismo" para "pessoas
 * com TEA" marca 0,13), então só se reprova o que é claramente de outro assunto.
 *
 * O vetor dos termos não está publicado — ele é calculado por v3/confere_sinonimos.py, que grava
 * v3/busca/sinonimos-suspeitos-<escopo>.json. Este portão lê esse laudo quando ele existe e é do mesmo
 * conjunto de propostas; sem laudo, avisa e passa (não dá para inventar vetor no build).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname;
const V3 = join(RAIZ, '..', 'v3', 'busca');
const LIMIAR = 0.10;
// Dívida conhecida, item D5 do BACKLOG: as 27 UFs nunca foram conferidas e carregam 1.008 conjuntos no
// cartão errado (presidente tinha 93 e foi consertado em 19/09/2026). O portão é catraca: o número de
// cada escopo só pode CAIR. Um defeito novo, ou um escopo fora desta lista, reprova.
const DIVIDA = {
    "governador/go": 9,
    "governador/ma": 129,
    "governador/mg": 77,
    "governador/ms": 107,
    "governador/pb": 9,
    "governador/pe": 156,
    "governador/rj": 124,
    "governador/rn": 80,
    "governador/rr": 7,
    "governador/rs": 17,
    "governador/sc": 137,
    "governador/se": 101,
    "governador/sp": 43,
    "governador/to": 12
};


const escopos = [];
for (const cargo of ['presidente']) escopos.push([cargo, join(RAIZ, 'data', 'busca', cargo)]);
const gov = join(RAIZ, 'data', 'busca', 'governador');
for (const uf of existsSync(gov) ? readdirSync(gov) : []) escopos.push([`governador/${uf}`, join(gov, uf)]);

let problemas = 0;
let conferidos = 0;
let semLaudo = 0;
let pendentes = 0;
for (const [escopo, pasta] of escopos) {
  if (!existsSync(join(pasta, 'documentos.json'))) continue;
  const docs = JSON.parse(readFileSync(join(pasta, 'documentos.json'), 'utf8'));
  const laudo = join(V3, `sinonimos-suspeitos-${escopo.replace('/', '-')}.json`);
  if (!existsSync(laudo)) { semLaudo++; continue; }
  const d = JSON.parse(readFileSync(laudo, 'utf8'));
  if (d.propostas !== docs.propostas.length) {
    console.log(`  aviso  ${escopo}: laudo de sinônimos é de outra rodada (${d.propostas} propostas, o site tem ${docs.propostas.length}) — rode v3/confere_sinonimos.py`);
    semLaudo++;
    continue;
  }
  conferidos++;
  const vivos = new Set(docs.propostas.map((p) => p.id));
  const fora = d.itens.filter((x) => x.cos_propria < LIMIAR && vivos.has(x.id));
  const teto = DIVIDA[escopo] ?? 0;
  if (fora.length > teto) {
    for (const x of fora.slice(0, 5)) {
      console.log(`  · ${escopo} ${x.id}: os termos não têm relação com a própria proposta (cos ${x.cos_propria}); descrevem ${x.melhor_id} (cos ${x.cos_melhor})`);
      console.log(`      proposta: ${x.proposta.slice(0, 100)}`);
      console.log(`      termos:   ${x.sinonimos.join(', ').slice(0, 120)}`);
    }
    console.log(`  ${escopo}: ${fora.length} fora do cartão, e a dívida registrada é ${teto}`);
    problemas += fora.length - teto;
  } else if (fora.length) {
    pendentes += fora.length;
  }
}

if (problemas) {
  console.log(`FALHOU (sinônimos): ${problemas} conjunto(s) de termos no cartão errado, além da dívida registrada`);
  process.exit(1);
}
console.log(`OK (sinônimos): ${conferidos} escopo(s) conferidos, nenhum caso novo`
  + (pendentes ? ` · ${pendentes} da dívida conhecida das UFs (D5 do BACKLOG)` : '')
  + (semLaudo ? ` · ${semLaudo} sem laudo (v3/confere_sinonimos.py)` : ''));
